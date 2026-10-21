# Messaging: queues in SQL Server

Jobs and events between the API, the media workers and the identity server are durable queues stored in SQL Server, in the `messaging` schema of the app database (`badjockeys`). There's no separate message broker: the queues are covered by the zone-redundant Azure SQL database's redundancy and backups, cost nothing extra, and run wherever SQL Server runs. The code is in bjk-modules (`BJK.Modules.Shared.Messaging`, using Rebus and Rebus.SqlServer, both MIT); its README has the full design ("Messaging (SQL Server queues)").

## The queues

| Queue (table in `messaging`) | From → to | What | Attempts |
|---|---|---|---|
| `media.process` | API → media workers; workers → workers | Process an upload; for longer videos, one job per segment, then a job that joins them | 3, then the media is marked `Failed` and the job moves to `media.process.failed` |
| `bjk-core.media-events` (subscribed to topic `bjk.media`) | API and workers (through `media.Outbox`) → API (Posts) | `media.ready` / `media.failed`: publish or fail posts made while their media were processing | 5, then `.failed` |
| `bjk-core.user-events` (subscribed to topic `bjk.users`) | Identity server (through `users.Outbox` in `idsrv`) → API (Profiles, Posts, Media) | A user deactivated, reactivated or was deleted | 5, then `.failed` |

Each `.failed` table holds dead letters: messages given up on, with the error in their headers. `messaging.subscriptions` lists which queue subscribes to which topic. The API creates all of these on its first start (and the media worker creates `media.process` if it starts first).

Retries wait 5, 10, 20... seconds (`Queues:RetryDelay`, doubling up to `Queues:MaxRetryDelay`). A worker that crashes mid-job stops renewing its lease on the message, so it's delivered again within about a minute (`Queues:LeaseDuration`). Every delivery counts as an attempt, crashes included, so a file that crashes the worker every time still ends up `Failed` rather than looping.

The upload's job is queued in the same database transaction that sets the media to `Processing`, so a job is never lost and never queued for a change that was rolled back.

## The identity server's access

The identity server writes user events into `bjk-core.user-events` through its own connection (`ConnectionStrings:BadJockeysDatabase` in the identity server) with a database user in `badjockeys` that may only read `messaging.subscriptions` and add rows to the `messaging` tables. It can't read the queues, delete anything, or touch the app's data. Create it once per environment (the Terraform will do this), after the API has started once:

```sql
-- In the master database: a SQL login for the identity server's messaging connection (password as a container secret).
CREATE LOGIN [bjk-identity-server-messaging] WITH PASSWORD = '<a long random password>';
-- Then in the badjockeys database:
CREATE USER [bjk-identity-server] FOR LOGIN [bjk-identity-server-messaging];
GRANT SELECT ON OBJECT::[messaging].[subscriptions] TO [bjk-identity-server];
GRANT INSERT ON SCHEMA::[messaging] TO [bjk-identity-server];
```

Until the API has started and subscribed, the identity server keeps its events in its outbox, so a fresh environment loses none.

## Scaling the media worker (Container Apps + KEDA)

The worker runs one job per replica (`Media:Processing:MaxConcurrentJobs` = 1) and scales on the number of jobs that are due: waiting, or being worked on. Counting the jobs in progress too means KEDA never scales away a replica that's still busy, and a 30-second video split into six segments asks for six replicas. Jobs waiting for a retry delay aren't counted until they're due.

```sql
SELECT COUNT(*) FROM [messaging].[media.process] WITH (NOLOCK)
WHERE [visible] <= SYSDATETIMEOFFSET() AND [expiration] > SYSDATETIMEOFFSET()
```

The Container Apps scale rule (for the Terraform, which comes later), using KEDA's SQL Server scaler (`mssql`):

```hcl
template {
  min_replicas = 0
  max_replicas = 10   # the cost ceiling; at least 6 so one 30-second video's segments run at once

  custom_scale_rule {
    name             = "media-process-queue"
    custom_rule_type = "mssql"
    metadata = {
      query       = "SELECT COUNT(*) FROM [messaging].[media.process] WITH (NOLOCK) WHERE [visible] <= SYSDATETIMEOFFSET() AND [expiration] > SYSDATETIMEOFFSET()"
      targetValue = "1"   # one job per replica
    }
    authentication {
      secret_name       = "messaging-scaler-connection"   # a connection string to badjockeys
      trigger_parameter = "connectionString"
    }
  }
}
```

- The scaler only needs to read this one table: give it its own database user with `GRANT SELECT ON OBJECT::[messaging].[media.process]`. Use a SQL login for this user, with the connection string as a container secret (no cloud-specific sign-in, so it works the same anywhere).
- KEDA checks every 30 seconds by default; a shorter polling interval (5-10 seconds) suits fast posting. Keep the default cool-down (300 seconds) so replicas aren't stopped between a video's segment jobs and its join job.
- Scaling from zero adds a cold start (pulling the image and starting .NET). The always-on replica in busy hours mentioned in the architecture notes removes it.

## Watching the queues

For a Grafana panel or alert (dead letters should stay at 0):

```sql
SELECT t.name AS queue, p.rows AS messages
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id = 1
WHERE s.name = 'messaging' AND t.name <> 'subscriptions'
ORDER BY t.name;
```

To see why a message was dead-lettered:

```sql
SELECT id, CAST(headers AS nvarchar(max)) AS headers, CAST(body AS varchar(max)) AS body
FROM [messaging].[media.process.failed];
```

The headers are JSON; `rbs2-error-details` says what went wrong and `rbs2-source-queue` where it came from. To try a dead letter again after fixing the cause, move the row back:

```sql
BEGIN TRAN;
INSERT INTO [messaging].[media.process] ([priority], [expiration], [visible], [headers], [body])
SELECT [priority], [expiration], SYSDATETIMEOFFSET(), [headers], [body] FROM [messaging].[media.process.failed] WHERE id = @id;
DELETE FROM [messaging].[media.process.failed] WHERE id = @id;
COMMIT;
```

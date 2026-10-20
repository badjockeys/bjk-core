#!/usr/bin/env bash
# Checks the reports (scripts/sql/reporting, src/reporting) against real databases, after the smoke test has run the
# API so the badjockeys database and its queue tables exist. The idsrv database isn't in this CI, so a stand-in with
# the identity server's columns (the ones the views read) is created first.
#   1. Both sets of views and the bjk_reporting login apply cleanly (twice: they must be safe to re-run).
#   2. bjk_reporting can read every reporting view, and can't read a table.
#   3. Grafana starts with the provisioned data sources and dashboards, and its app data source connects.
# Needs SQL_CONTAINER (the SQL Server service container) and SQL_PASSWORD.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail() { echo "::error::$*"; exit 1; }
sql() { docker exec -i "$SQL_CONTAINER" /opt/mssql-tools18/bin/sqlcmd -S localhost -C -b -I "$@"; }
as_sa() { sql -U sa -P "$SQL_PASSWORD" "$@"; }
REPORTING_PASSWORD="CiReporting2026x"

echo "--- stand-in idsrv database"
as_sa <<'SQL'
IF DB_ID('idsrv') IS NULL CREATE DATABASE idsrv;
GO
USE idsrv;
IF SCHEMA_ID('auth') IS NULL EXEC('CREATE SCHEMA auth');
IF SCHEMA_ID('users') IS NULL EXEC('CREATE SCHEMA users');
GO
IF OBJECT_ID('auth.AspNetUsers') IS NULL CREATE TABLE auth.AspNetUsers (Id nvarchar(450) PRIMARY KEY, Email nvarchar(256), EmailConfirmed bit NOT NULL, TwoFactorEnabled bit NOT NULL, LockoutEnd datetimeoffset NULL);
IF OBJECT_ID('auth.AspNetUserLogins') IS NULL CREATE TABLE auth.AspNetUserLogins (LoginProvider nvarchar(450), ProviderKey nvarchar(450), ProviderDisplayName nvarchar(max), UserId nvarchar(450));
IF OBJECT_ID('auth.AspNetRoles') IS NULL CREATE TABLE auth.AspNetRoles (Id nvarchar(450) PRIMARY KEY, Name nvarchar(256));
IF OBJECT_ID('auth.AspNetUserRoles') IS NULL CREATE TABLE auth.AspNetUserRoles (UserId nvarchar(450), RoleId nvarchar(450));
IF OBJECT_ID('users.Accounts') IS NULL CREATE TABLE users.Accounts (Id uniqueidentifier PRIMARY KEY, Status nvarchar(20), CreatedAt datetimeoffset, DeactivatedAt datetimeoffset NULL, DateOfBirth date NULL, AgeCheckStatus nvarchar(20), AgeCheckMethod nvarchar(20) NULL);
IF OBJECT_ID('users.Outbox') IS NULL CREATE TABLE users.Outbox (Id uniqueidentifier PRIMARY KEY, OccurredAt datetimeoffset, PublishedAt datetimeoffset NULL);
GO
DELETE FROM users.Accounts; DELETE FROM auth.AspNetUsers;
INSERT INTO users.Accounts VALUES ('6B1C2D3E-0000-4000-8000-000000000001', 'Active', SYSDATETIMEOFFSET(), NULL, '2001-05-04', 'Passed', 'FacialAge');
INSERT INTO auth.AspNetUsers VALUES ('6b1c2d3e-0000-4000-8000-000000000001', 'x@example.test', 1, 0, NULL);
GO
SQL

echo "--- apply the views and the login (twice)"
for run in 1 2; do
  as_sa -d idsrv < scripts/sql/reporting/idsrv.sql || fail "scripts/sql/reporting/idsrv.sql failed (run $run)."
  as_sa -d badjockeys < scripts/sql/reporting/badjockeys.sql || fail "scripts/sql/reporting/badjockeys.sql failed (run $run)."
  as_sa -d master -v ReportingPassword="$REPORTING_PASSWORD" < scripts/sql/reporting/login.sql || fail "scripts/sql/reporting/login.sql failed (run $run)."
done
echo "ok  views and login apply, and re-apply"

echo "--- bjk_reporting reads every view, and nothing else"
for db in idsrv badjockeys; do
  views=$(as_sa -d "$db" -h -1 -W -Q "SET NOCOUNT ON; SELECT name FROM sys.views WHERE schema_id = SCHEMA_ID('reporting') ORDER BY name")
  [ -n "$views" ] || fail "No reporting views in $db."
  for view in $views; do
    sql -U bjk_reporting -P "$REPORTING_PASSWORD" -d "$db" -Q "SET NOCOUNT ON; SELECT TOP (1) * FROM reporting.[$view]" > /dev/null \
      || fail "bjk_reporting can't read $db.reporting.$view."
  done
  echo "ok  $db: $(wc -w <<< "$views") views readable"
done
if sql -U bjk_reporting -P "$REPORTING_PASSWORD" -d badjockeys -Q "SELECT TOP (1) * FROM posts.Posts" > /dev/null 2>&1; then
  fail "bjk_reporting could read posts.Posts: it must only see the reporting views."
fi
echo "ok  bjk_reporting can't read the tables"

echo "--- Grafana"
image=$(sed -n 's/^ *image: \(grafana\/grafana-oss:[^ ]*\)$/\1/p' docker-compose.yml)
network=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$SQL_CONTAINER")
docker run -d --name ci-grafana --network "$network" -p 3300:3000 \
  -e BJK_REPORTING_SQL_SERVER="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$SQL_CONTAINER"):1433" \
  -e BJK_REPORTING_PASSWORD="$REPORTING_PASSWORD" \
  -e GF_SECURITY_ADMIN_PASSWORD=ci-admin \
  -v "$PWD/src/reporting/grafana/provisioning:/etc/grafana/provisioning:ro" \
  -v "$PWD/src/reporting/grafana/dashboards:/etc/grafana/dashboards:ro" \
  "$image" > /dev/null
trap 'docker logs ci-grafana > grafana.log 2>&1 || true; docker rm -f ci-grafana > /dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do curl -fs http://localhost:3300/api/health > /dev/null && break; sleep 2; done
curl -fs http://localhost:3300/api/health > /dev/null || fail "Grafana didn't start (see grafana.log)."
auth=(-u admin:ci-admin)
count=$(curl -fs "${auth[@]}" "http://localhost:3300/api/search?tag=bad-jockeys" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
[ "$count" = "2" ] || fail "Expected 2 provisioned dashboards, found $count."
echo "ok  Grafana provisioned both dashboards"
for uid in bjk-app bjk-idsrv; do
  result=$(curl -s "${auth[@]}" "http://localhost:3300/api/datasources/uid/$uid/health")
  grep -q '"status":"OK"' <<< "$result" || fail "Grafana's $uid data source can't connect: $result"
  echo "ok  data source $uid connects as bjk_reporting"
done

# Every panel's query runs against its data source.
python3 - <<'PY' || fail "A dashboard query failed."
import json, glob, urllib.request, base64
token = base64.b64encode(b"admin:ci-admin").decode()
for path in sorted(glob.glob("src/reporting/grafana/dashboards/*.json")):
    dash = json.load(open(path))
    for panel in dash["panels"]:
        for target in panel.get("targets", []):
            body = json.dumps({"queries": [dict(target, intervalMs=86400000, maxDataPoints=500)], "from": "now-90d", "to": "now"}).encode()
            request = urllib.request.Request("http://localhost:3300/api/ds/query", body, {"Content-Type": "application/json", "Authorization": f"Basic {token}"})
            try:
                result = json.load(urllib.request.urlopen(request))
            except urllib.error.HTTPError as error:
                raise SystemExit(f"{dash['title']} / {panel['title']}: HTTP {error.code} {error.read().decode()[:400]}")
            error = result["results"]["A"].get("error")
            if error:
                raise SystemExit(f"{dash['title']} / {panel['title']}: {error}")
    print(f"ok  {dash['title']}: every panel's query runs")
PY

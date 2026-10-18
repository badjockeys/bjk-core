# Running Bad Jockeys locally

This guide gets the whole platform running on your machine:

| Piece | Repo | Runs on | Address |
|---|---|---|---|
| SQL Server | bjk-identity-server (`docker-compose.yml`) | Docker | `localhost,1433` |
| RabbitMQ | bjk-core (`docker-compose.yml`) | Docker | `localhost:5672`, dashboard http://localhost:15672 |
| Identity server (sign-in + User module) | bjk-identity-server | .NET | https://localhost:5001 |
| API (Media and later modules) | bjk-core, `src/BJK.Core.Api` | .NET | https://localhost:5101 |
| Web app | bjk-core, `src/web` | Node.js (Next.js) | http://localhost:3000 |
| File storage | Cloudflare R2, shared dev buckets | Cloudflare | no local copy |

> **Status (18 Oct 2026):** the identity server runs today. The API host (`src/BJK.Core.Api`) and the web app (`src/web`) are the next things being built. Until they land, steps 7 and 8 describe how they will run, and you can complete everything else now: the prerequisites, Docker, user secrets and R2 keys.

One SQL Server holds both databases:

| Database | Used by | Schemas |
|---|---|---|
| `idsrv` | Identity server | `auth` (accounts), `idsrv` (tokens, keys), `users` (profiles) |
| `badjockeys` | API | `media`, and one schema per module added later |

Neither app needs you to create its database. Each one creates its database and applies schema changes when it starts, and refuses any change that would delete data (see [Database changes](#database-changes)).

## 1. Install the prerequisites

These steps are for macOS. Windows and Linux use the same tools.

| Tool | Version | Install | Check |
|---|---|---|---|
| Homebrew | latest | https://brew.sh | `brew --version` |
| Git | any recent | `brew install git` | `git --version` |
| .NET SDK | 10.0.100 or later | `brew install --cask dotnet-sdk`, or https://dotnet.microsoft.com/download | `dotnet --version` |
| Node.js | 24 LTS or later | `brew install node@24`, or `nvm install 24` | `node --version` |
| Docker Desktop | latest | `brew install --cask docker`, then open it once | `docker compose version` |
| GitHub CLI (optional) | latest | `brew install gh` | `gh --version` |

Then:

1. **Trust the HTTPS development certificate**, so the browser and the apps accept `https://localhost`:

   ```bash
   dotnet dev-certs https --trust
   ```

2. **Turn on Rosetta in Docker Desktop if you have an Apple Silicon Mac.** Go to **Settings → General → "Use Rosetta for x86_64/amd64 emulation on Apple Silicon"**. SQL Server only ships for x86-64.

3. **Install an editor:**
   - **Rider**, or **VS Code** with the **C# Dev Kit** extension, for the .NET code.
   - **VS Code**, or WebStorm, for the web app.

4. **Install a SQL tool:** VS Code's **SQL Server (mssql)** extension, Rider's database window, or DataGrip.

5. **Install ffmpeg (optional for now).** The media processing worker needs it, but that worker isn't built yet:

   ```bash
   brew install ffmpeg
   ```

## 2. Get the code

All four repos sit side by side in one folder:

```bash
mkdir -p ~/Git/GitHub/badjockeys && cd ~/Git/GitHub/badjockeys
git clone https://github.com/badjockeys/bjk-core.git
git clone https://github.com/badjockeys/bjk-identity-server.git
git clone https://github.com/badjockeys/bjk-modules.git
git clone https://github.com/badjockeys/bjk-mobile.git
```

The default branch is `master`. All work happens on `feature/*` branches and is merged by pull request.

## 3. Give NuGet access to the Bad Jockeys package feed

The modules (`BJK.Modules.*`) are private NuGet packages on GitHub Packages, so restoring them needs a GitHub token.

1. **Create the token.** On GitHub, go to **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**. Tick only **`read:packages`**, then copy the token.

2. **Store it as an environment variable.** Add this line to `~/.zshrc`, then open a new terminal:

   ```bash
   export NuGetPackageSourceCredentials_badjockeys="Username=<your GitHub username>;Password=<token>"
   ```

   NuGet uses the variable for the `badjockeys` source in each repo's `nuget.config`, so the token never goes into a repo.

3. **Start your editor from that terminal** (for example `open -a Rider`). Otherwise, log out and back in so the editor sees the variable.

## 4. Start SQL Server and RabbitMQ

Each repo has a git-ignored `.env` file for its local Docker passwords. Choose your own passwords.

**SQL Server** comes from the identity server repo:

```bash
cd ~/Git/GitHub/badjockeys/bjk-identity-server
cp .env.example .env
# edit .env: BJK_SQL_PASSWORD=<8+ characters with upper case, lower case, a digit and a symbol>
docker compose up -d
```

**RabbitMQ** comes from this repo:

```bash
cd ~/Git/GitHub/badjockeys/bjk-core
cp .env.example .env
# edit .env: BJK_RABBITMQ_PASSWORD=<any password>
docker compose up -d
```

Check that both containers show **healthy**:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
# bjk-sql        Up ... (healthy)
# bjk-rabbitmq   Up ... (healthy)
```

You can see the RabbitMQ dashboard at http://localhost:15672. Sign in as user `bjk` with your `.env` password.

| Command (run in the repo that owns the container) | Does |
|---|---|
| `docker compose stop` | Stops the container and keeps the data |
| `docker compose up -d` | Starts it again |
| `docker compose down -v` | Removes the container **and its data**, so you start fresh |

## 5. Get Cloudflare R2 keys for the dev buckets

Photos and videos are stored in Cloudflare R2 in every environment, including your machine. Developers share one pair of dev buckets, but each developer has their own keys.

| Bucket | Holds | Access |
|---|---|---|
| `bjk-dev-originals` | Files exactly as uploaded (kept for 90 days) | Private |
| `bjk-dev-public` | Processed files: 720p video, WebP photos, thumbnails | Public, served by Cloudflare |

Ask whoever administers the Cloudflare account to do this, or do it yourself if you have access:

1. In the Cloudflare dashboard, go to **R2 → Manage R2 API tokens → Create API token**.
2. Set the permission to **Object Read & Write**, and limit it to the two `bjk-dev-*` buckets.
3. Copy these three values. Cloudflare shows the secret only once.
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID**, which is also part of the endpoint `https://<account id>.r2.cloudflarestorage.com`
4. Note the public bucket's URL. It's under **R2 → bjk-dev-public → Settings → Public access**, and is either an `r2.dev` address or a custom domain.

The code reaches R2 through its S3-compatible API, using the `AWSSDK.S3` client. Cloudflare recommends this client for .NET, and nothing is sent to AWS.

Two pieces of bucket setup are done once by an administrator, not by each developer, and will move into Terraform:

- **CORS on `bjk-dev-originals`.** It must allow `PUT` from `http://localhost:3000` so the browser can upload directly.
- **A lifecycle rule** that deletes originals after 90 days.

## 6. Load your settings into user secrets

The repos' `appsettings` files hold no environment settings. On your machine, settings come from .NET **user secrets**. These are stored in your home folder, never in a repo, and they load only when the app runs in Development. Each repo has a `user-secrets.template.json` that shows every setting and its format.

### Identity server

```bash
cd ~/Git/GitHub/badjockeys/bjk-identity-server
cp user-secrets.template.json user-secrets.json        # git-ignored
# edit user-secrets.json: put your SQL password from bjk-identity-server/.env into the connection string
dotnet user-secrets set --project src/BJK.Idsrv.Host < user-secrets.json
```

The format is:

```json
{
  "ConnectionStrings": {
    "IdentityDatabase": "Server=localhost,1433;Database=idsrv;User Id=sa;Password=<BJK_SQL_PASSWORD from your .env>;TrustServerCertificate=True;MultipleActiveResultSets=true"
  },
  "Email": {
    "FromAddress": "no-reply@badjockeys.local",
    "PasswordResetUrl": "http://localhost:3000/reset-password"
  },
  "Captcha": {
    "TurnstileSecretKey": "1x0000000000000000000000000000000AA"
  }
}
```

The CAPTCHA key is Cloudflare's public test key, which always passes. The identity server's own guide (`bjk-identity-server/docs/local-development.md`) explains it, along with the email placeholder and the test clients.

### API

```bash
cd ~/Git/GitHub/badjockeys/bjk-core
cp user-secrets.template.json user-secrets.json        # git-ignored
# edit user-secrets.json: SQL password, RabbitMQ password and your R2 keys
dotnet user-secrets set --project src/BJK.Core.Api < user-secrets.json
dotnet user-secrets list --project src/BJK.Core.Api    # check they're all there
```

The format is:

```json
{
  "ConnectionStrings": {
    "AppDatabase": "Server=localhost,1433;Database=badjockeys;User Id=sa;Password=<BJK_SQL_PASSWORD from bjk-identity-server/.env>;TrustServerCertificate=True;MultipleActiveResultSets=true"
  },
  "Authentication": {
    "Authority": "https://localhost:5001"
  },
  "Cors": {
    "AllowedOrigins": [ "http://localhost:3000" ]
  },
  "Media": {
    "Storage": {
      "ServiceUrl": "https://<cloudflare account id>.r2.cloudflarestorage.com",
      "AccessKeyId": "<your R2 access key id>",
      "SecretAccessKey": "<your R2 secret access key>",
      "OriginalsBucket": "bjk-dev-originals",
      "PublicBucket": "bjk-dev-public",
      "PublicBaseUrl": "https://<public URL of bjk-dev-public>"
    },
    "Queue": {
      "ConnectionUri": "amqp://bjk:<BJK_RABBITMQ_PASSWORD from bjk-core/.env>@localhost:5672",
      "QueueName": "media.process"
    }
  }
}
```

| Setting | What it is |
|---|---|
| `ConnectionStrings:AppDatabase` | The main app database `badjockeys`, on the same SQL Server as `idsrv` |
| `Authentication:Authority` | The identity server that issues the tokens the API accepts |
| `Cors:AllowedOrigins` | The web app's address, so the browser can call the API |
| `Media:Storage:*` | Your R2 keys and the dev buckets (step 5) |
| `Media:Queue:*` | Local RabbitMQ; the queue for processing jobs is created automatically |

Some settings are optional:

| Setting | Default |
|---|---|
| `MediatR:LicenseKey` | Unset. Without it MediatR logs a licence warning. |
| `Media:MaxVideoBytes` | 500 MB |
| `Media:MaxImageBytes` | 25 MB |
| `Media:MaxVideoDurationSeconds` | 300 |
| `Media:UploadUrlLifetime` | `00:15:00` |
| `Media:OriginalRetention` | `90.00:00:00` |

To change one setting later:

```bash
dotnet user-secrets set "Media:Storage:AccessKeyId" "<new key>" --project src/BJK.Core.Api
```

### Web app

Next.js doesn't use .NET user secrets. It reads a git-ignored `src/web/.env.local` instead, and its template is `src/web/.env.local.example`. The exact keys will be confirmed when the web app is built; expect something like:

```bash
API_BASE_URL=https://localhost:5101
IDSRV_AUTHORITY=https://localhost:5001
IDSRV_CLIENT_ID=bjk-web
AUTH_SECRET=<any long random string: openssl rand -base64 32>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

`1x00000000000000000000AA` is Cloudflare's public test **site** key, which always passes. It pairs with the test **secret** key in the identity server.

### Adding a setting

If you add a setting, add it to `user-secrets.template.json` (or `.env.local.example`) in the same pull request, so everyone else knows to load it.

## 7. Run the back end

Start the apps in this order. Each one needs its own terminal, or you can use Rider's compound run configuration.

```bash
# 1. Identity server: https://localhost:5001
cd ~/Git/GitHub/badjockeys/bjk-identity-server
dotnet run --project src/BJK.Idsrv.Host --launch-profile https

# 2. API: https://localhost:5101
cd ~/Git/GitHub/badjockeys/bjk-core
dotnet run --project src/BJK.Core.Api --launch-profile https
```

The first time each app starts, it creates its database and logs each schema being built, for example `MediaDbContext: applying migrations ...`. On later starts, each schema logs `database schema is up to date`.

To check they're running:

- Identity server: https://localhost:5001/.well-known/openid-configuration returns JSON.
- API: https://localhost:5101/health returns `Healthy`.

## 8. Run the web app

```bash
cd ~/Git/GitHub/badjockeys/bjk-core/src/web
cp .env.local.example .env.local      # first time only
npm install                           # first time, and after package.json changes
npm run dev
```

Then open http://localhost:3000.

## Trying it end to end

Until the web app's sign-in page exists, you can test with the `.http` files and the identity server's local test clients:

1. **Create a user and sign in.** Use `bjk-identity-server/src/BJK.Idsrv.Host/BJK.Idsrv.Host.http`, sending the requests from top to bottom. The sign-in returns an access token.
2. **Try the Media endpoints.** Use `bjk-core/src/BJK.Core.Api/BJK.Core.Api.http` with that token:
   1. `POST /api/media/uploads` returns a signed upload URL.
   2. `PUT` your file to that URL. It goes straight to R2, not through the API.
   3. `POST /api/media/{id}/complete` queues the processing job. You'll see it appear on the `media.process` queue in the RabbitMQ dashboard.
   4. `GET /api/media/mine` lists your uploads.

The Media endpoints need the `bjk.media` scope. The identity server's local client will offer it once the media scopes are added there.

## Data and handy queries

To look at the data, connect your SQL tool with these settings:

- Server: `localhost,1433`
- User: `sa`
- Password: from `bjk-identity-server/.env`
- Tick **Trust server certificate**

```sql
USE idsrv;
SELECT Id, Email, DisplayName, IsDeleted FROM users.Users;    -- Id is the same as auth.AspNetUsers.Id
SELECT Id, Email, LockoutEnd FROM auth.AspNetUsers;

USE badjockeys;
SELECT Id, UserId, MediaType, Status, OriginalFileName, CreatedAt FROM media.Media ORDER BY CreatedAt DESC;
```

Every person has one id. A user's profile id equals their sign-in account id (the `sub` in their token). It's also the `{userId}` folder in R2 keys: `{userId}/{mediaId}/original.mp4`.

## Database changes

The apps apply schema changes when they start. A migration that would drop a table, column or schema, or delete rows, **stops the app from starting** and lists what it would remove. To run one deliberately, review it, then set `Database:AllowDestructiveMigrations` to `true` for that one run.

Module tables and migrations live in **bjk-modules**. The API picks up a change when you move it to a newer `BJK.Modules.*` package version in `Directory.Packages.props`. Every push to a bjk-modules feature branch publishes a preview version (`0.x.y-ci.<run>`), so you can test a change before it's merged.

To start from empty databases:

```bash
cd ~/Git/GitHub/badjockeys/bjk-identity-server && docker compose down -v && docker compose up -d
```

## Troubleshooting

- **`NU1301` or `401 Unauthorized` on restore.** The NuGet token isn't set in this terminal, or has expired (step 3). Check with `echo $NuGetPackageSourceCredentials_badjockeys`.
- **`Connection string '...' is not configured` or `The ... field is required`.** Your user secrets aren't loaded (step 6), or the app isn't running in Development. The `https` launch profile sets Development.
- **`Login failed for user 'sa'`.** The password in your user secret doesn't match `bjk-identity-server/.env`. If you changed `.env` after the container was first created, SQL Server still has the old password: run `docker compose down -v` (this deletes local data), then `docker compose up -d`.
- **`A network-related or instance-specific error`.** SQL Server isn't running or isn't healthy yet. Run `docker ps`, then `docker compose logs sql` in bjk-identity-server.
- **`None of the specified endpoints were reachable` (RabbitMQ).** RabbitMQ isn't running, or the password in `Media:Queue:ConnectionUri` doesn't match `bjk-core/.env`.
- **The browser upload fails with a CORS error.** The dev originals bucket doesn't allow `PUT` from `http://localhost:3000` (see step 5).
- **`SignatureDoesNotMatch` or `InvalidAccessKeyId` from R2.** The R2 keys are wrong, or the token isn't scoped to the dev buckets.
- **The API returns `401` with a valid-looking token.** Check that `Authentication:Authority` is `https://localhost:5001`, that the identity server is running, and that you ran `dotnet dev-certs https --trust`.
- **The SQL container keeps restarting on an Apple Silicon Mac.** Turn on Rosetta in Docker Desktop (step 1).
- **A port is already in use (1433, 5672, 15672, 5001, 5101 or 3000).** Stop whatever is using it (`lsof -i :<port>`), or change the left-hand port in the compose file and the matching setting.

# Running Bad Jockeys locally

This guide gets the whole platform running on your machine:

| Piece | Repo | Runs on | Address |
|---|---|---|---|
| SQL Server (also holds the message queues) | bjk-core (`docker-compose.yml`) | Docker, group `bad-jockeys` | `localhost,1433` |
| Identity server (sign-in + User module) | bjk-identity-server | .NET | https://localhost:5001 |
| API (Media, Profiles, Posts, Email and SMS modules) | bjk-core, `src/BJK.Core.Api` | .NET | https://localhost:5101 |
| Media worker (converts uploads with ffmpeg) | bjk-core, `src/BJK.Core.MediaWorker` | .NET + ffmpeg | no address, reads the queue |
| Web app | bjk-core, `src/web` | Node.js (Next.js) | http://localhost:3000 |
| File storage | bjk-core (`docker-compose.yml`): S3Mock, standing in for Cloudflare R2 | Docker, group `bad-jockeys` | http://localhost:9090 |
| Reports (Grafana) | bjk-core (`docker-compose.yml`, `src/reporting`) | Docker, group `bad-jockeys` | http://localhost:3300 |

> **Status (19 Oct 2026):** everything in the table runs: the identity server, the API, the media worker and the web app (`src/web`).

One SQL Server holds both databases:

| Database | Used by | Schemas |
|---|---|---|
| `idsrv` | Identity server | `auth` (accounts), `idsrv` (tokens, keys), `users` (profiles) |
| `badjockeys` | API, media worker | `media`, `profiles`, `posts` (one schema per module), `messaging` (the queues) |

## Quick start: one command

On a new computer, one script installs everything and sets it all up. It only needs the script itself: download it from GitHub (signed in, open `scripts/setup/setup.sh` or `scripts/setup/setup.ps1` in bjk-core and use **Download raw file**), or use it from a bjk-core you've already cloned. The commands below are run from bjk-core; for a downloaded copy, run it from wherever you saved it (`bash setup.sh`, or `powershell -ExecutionPolicy Bypass -File setup.ps1`).

| Computer | Run |
|---|---|
| Windows 10 or 11 | `powershell -ExecutionPolicy Bypass -File scripts\setup\setup.ps1` |
| Mac | `bash scripts/setup/setup.sh` |

It's safe to run again, and skips whatever is already done. Each run also pulls the latest code into every repo that's on `master` with no uncommitted changes (repos on another branch, or with work in progress, are left alone and listed), and restarts itself if that brought a newer version of the script. To upgrade the tools to their latest versions too, run it with `--upgrade` (Mac) or `-Upgrade` (Windows); that restarts Docker Desktop, so local SQL Server and S3Mock stop until the setup starts them again.

It:

1. installs whatever tools are missing (Git, GitHub CLI, .NET 10 SDK, Node.js 24, Docker Desktop, ffmpeg, VS Code) with winget on Windows or Homebrew on a Mac, plus WSL 2 on Windows and Rosetta on Apple Silicon;
2. starts Docker Desktop;
3. signs you in to GitHub in your browser. That sign-in also gives access to the private `BJK.Modules` packages, so there's no token to create;
4. clones the four repos side by side (next to this bjk-core, or into `~/Git/GitHub/badjockeys` on a Mac and `%USERPROFILE%\Git\badjockeys` on Windows);
5. runs the project setup, `scripts/setup-local.mjs` (below);
6. opens `bjk-core/badjockeys.code-workspace` in VS Code.

Then in VS Code: **Terminal → Run Task… → "Run Bad Jockeys"**, and open http://localhost:3000.

Expect to approve a few things: Windows UAC prompts or your Mac password for installs, Docker Desktop's terms the first time it opens, the GitHub sign-in in your browser, and trusting the HTTPS certificate. If Windows has to turn on WSL 2, it asks you to restart; run the script again afterwards. On Linux, install the tools with your package manager ([step 1](#1-install-the-prerequisites)), then run `bash setup.sh`.

### The project setup on its own

`scripts/setup-local.mjs` is the part that sets up the project once the tools are there. Run it on its own with **Terminal → Run Task… → "Set up (one-off)"** in VS Code, or `node scripts/setup-local.mjs` in bjk-core. It:

- checks the tools, and access to the package feed. It uses the `NuGetPackageSourceCredentials_badjockeys` variable if you've set one ([step 3](#3-give-nuget-access-to-the-bad-jockeys-package-feed)); otherwise it takes your GitHub CLI sign-in and saves it in your user-level `NuGet.Config`, so every terminal and editor can restore the packages;
- creates your git-ignored config files from the templates, with your own SQL password and secrets (`bjk-core/.env`, `bjk-identity-server/user-secrets.json`, `bjk-core/user-secrets.json`, `src/web/.env.local`); files you already have are left alone;
- trusts the HTTPS development certificate and exports it for Node.js;
- starts SQL Server and S3Mock in Docker (the `bad-jockeys` group, replacing the old layout's two groups if they're there) and waits for SQL Server to be healthy;
- loads the .NET user secrets (replacing what was there for the identity server and the API);
- downloads the face and number plate blurring models into `bjk-core/.local/models` (git-ignored), checking each file's SHA-256;
- builds the .NET apps and installs the web app's packages.

`node scripts/setup-local.mjs --config-only` just creates the config files.

To debug, use VS Code's **Run and Debug** panel instead: pick **"Bad Jockeys"** and press F5 to start SQL Server and S3Mock in Docker (opening Docker Desktop first if it's closed, and waiting for it), then build and start all four with the debugger attached (breakpoints work in the .NET code and in the web app's server code), and the web app opens in your browser when it's ready. Shift+F5 stops them all. Each app is also there on its own ("Identity server", "API", "Media worker", "Web app"), to restart just one. The web app and the media worker wait for the apps they depend on, as with the task. The .NET ones also make sure Docker is running first, so they work on their own too. If Docker can't be started (say it's still updating), it stops with a message saying so, before any app tries to connect. "Run Bad Jockeys" (Terminal → Run Task…) does the same without the debugger, Docker check included.

"Run Bad Jockeys" starts the identity server, the API, the media worker and the web app, each in its own terminal. Nothing starts before what it needs: the web app waits until the identity server and the API answer, and the media worker waits for the API (which creates the database and queues it reads). Started on its own without them, each waits up to 5 minutes, then says which app to start. Other tasks: "Start Docker services" and "Stop Docker services". Steps 1 to 8 below explain everything the scripts do, if you'd rather do it by hand or something goes wrong.

Neither app needs you to create its database. Each one creates its database and applies schema changes when it starts, and refuses any change that would delete data (see [Database changes](#database-changes)).

## 1. Install the prerequisites

macOS, Windows and Linux use the same tools. The commands in this guide are for macOS's terminal; on Windows, use PowerShell, where `~` and `cp` work the same.

| Tool | Version | macOS | Windows | Check |
|---|---|---|---|---|
| Homebrew (macOS only) | latest | https://brew.sh | | `brew --version` |
| Git | any recent | `brew install git` | `winget install Git.Git` | `git --version` |
| .NET SDK | 10.0.100 or later | `brew install --cask dotnet-sdk` | `winget install Microsoft.DotNet.SDK.10` | `dotnet --version` |
| Node.js | 24 LTS or later | `brew install node@24`, or `nvm install 24` | `winget install OpenJS.NodeJS.LTS` | `node --version` |
| Docker Desktop | latest | `brew install --cask docker`, then open it once | `winget install Docker.DockerDesktop` (uses WSL 2), then open it once | `docker compose version` |
| ffmpeg | any recent | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `ffmpeg -version` |
| GitHub CLI (optional) | latest | `brew install gh` | `winget install GitHub.cli` | `gh --version` |

On Windows, open a new terminal after installing so the tools are on your `PATH`.

Then:

1. **Trust the HTTPS development certificate**, so the browser and the apps accept `https://localhost`:

   ```bash
   dotnet dev-certs https --trust
   ```

2. **Turn on Rosetta in Docker Desktop if you have an Apple Silicon Mac.** (Windows and Intel Macs run SQL Server directly.) Go to **Settings → General → "Use Rosetta for x86_64/amd64 emulation on Apple Silicon"**. SQL Server only ships for x86-64.

3. **Install an editor:**
   - **Rider**, or **VS Code** with the **C# Dev Kit** extension, for the .NET code.
   - **VS Code**, or WebStorm, for the web app.

4. **Install a SQL tool:** VS Code's **SQL Server (mssql)** extension, Rider's database window, or DataGrip.

5. **ffmpeg** (in the table above) is what the media worker uses to convert videos and photos.

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

> `scripts/setup/setup.ps1`, `scripts/setup/setup.sh` and `scripts/setup-local.mjs` do this for you from your GitHub CLI sign-in (`gh auth login --scopes read:packages`). Use the steps below only if you'd rather manage your own token.

1. **Create the token.** On GitHub, go to **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**. Tick only **`read:packages`**, then copy the token.

2. **Store it as an environment variable.** On macOS, add this line to `~/.zshrc`, then open a new terminal:

   ```bash
   export NuGetPackageSourceCredentials_badjockeys="Username=<your GitHub username>;Password=<token>"
   ```

   On Windows, run this once in PowerShell, then open a new terminal (and restart VS Code):

   ```powershell
   [Environment]::SetEnvironmentVariable("NuGetPackageSourceCredentials_badjockeys", "Username=<your GitHub username>;Password=<token>", "User")
   ```

   NuGet uses the variable for the `badjockeys` source in each repo's `nuget.config`, so the token never goes into a repo.

3. **Start your editor from that terminal** (for example `code bjk-core/badjockeys.code-workspace` or `open -a Rider`). Otherwise, log out and back in so the editor sees the variable.

## 4. Start SQL Server and file storage

Both run in Docker from bjk-core's `docker-compose.yml`, as one group called **bad-jockeys** (that's the name Docker Desktop shows, with the two containers inside). Its `.env` file (git-ignored, next to the compose file) holds your own local SQL password:

```bash
cd ~/Git/GitHub/badjockeys/bjk-core
cp .env.example .env
# edit .env: BJK_SQL_PASSWORD=<8+ characters with upper case, lower case, a digit and a symbol>
docker compose up -d --wait      # returns once SQL Server is healthy (about 30 seconds the first time)
```

The setup script, "Run Bad Jockeys" and F5 all do this for you, opening Docker Desktop first if it's closed.

> **Moving from the old layout:** SQL Server used to come from bjk-identity-server's own compose file, in a separate Docker group. The scripts remove the two old groups (`bjk-identity-server` and `bjk-core`) the first time they start `bad-jockeys`, and carry your SQL password over from `bjk-identity-server/.env`. The new group starts with empty databases and storage; the old data stays in Docker volumes until you delete it (the script prints the `docker volume rm` command).

There's no message broker to run: the queues are tables in the `messaging` schema of `badjockeys`, created by the API on its first start (see [messaging.md](messaging.md)):

| Queue | From → to | What |
|---|---|---|
| `[messaging].[media.process]` | API → media workers | Process an upload (and, for longer videos, each segment) |
| `[messaging].[bjk-core.media-events]` (topic `bjk.media`) | API and workers → API | Media ready or failed, to publish posts made while it was processing |
| `[messaging].[bjk-core.user-events]` (topic `bjk.users`) | Identity server → API | A user deactivated, reactivated or was deleted |

| Command (in bjk-core) | Does |
|---|---|
| `docker compose stop` | Stops both and keeps the data |
| `docker compose up -d --wait` | Starts them again |
| `docker compose down -v` | Removes the containers **and all local data** (databases, queues, uploaded files), so you start fresh |

## 5. Local file storage

Photos and videos live in Cloudflare R2 in the cloud environments. On your machine you don't need a Cloudflare account: **S3Mock**, the second container in the `bad-jockeys` group (step 4), speaks the same S3 API, so the API and the worker can't tell the difference. It starts on http://localhost:9090 with both buckets created.

| Bucket | Holds | Access |
|---|---|---|
| `bjk-dev-originals` | Files exactly as uploaded | Private: only reachable with a signed link from the API |
| `bjk-dev-public` | Processed files: 720p video, WebP photos, thumbnails | Public: http://localhost:9090/bjk-dev-public/... |

How an upload works on your machine:

1. The web app asks the API for an upload link. The API signs a link to `http://localhost:9090/bjk-dev-originals/{userId}/{mediaId}/original.jpg`.
2. The browser `PUT`s the file straight to S3Mock. It never passes through the API.
3. The web app tells the API the upload is complete. The API puts a job on the `media.process` queue.
4. The media worker downloads the original, converts it with ffmpeg, strips metadata such as GPS, writes the results to `bjk-dev-public`, and marks the media `Ready`.
5. The web app shows the processed file from `http://localhost:9090/bjk-dev-public/...`.

S3Mock doesn't check keys, so the `local` keys in the template work as they are. Files survive `docker compose stop` and restarts; `docker compose down -v` deletes them, together with the databases, so the two always stay in step.

### Using Cloudflare R2 instead (later)

Once there's a Cloudflare account, you can point your user secrets at shared dev buckets instead. Create an R2 API token with **Object Read & Write** limited to the `bjk-dev-*` buckets, then set `Media:Storage:ServiceUrl` to `https://<account id>.r2.cloudflarestorage.com`, the two keys to the token's values, and `PublicBaseUrl` to the public bucket's URL. The dev originals bucket also needs a CORS rule allowing `PUT` from `http://localhost:3000`, and a lifecycle rule that deletes originals after 90 days. Both will move into Terraform.

## 6. Load your settings into user secrets

The repos' `appsettings` files hold no environment settings. On your machine, settings come from .NET **user secrets**. These are stored in your home folder, never in a repo, and they load only when the app runs in Development. Each repo has a `user-secrets.template.json` that shows every setting and its format.

### Identity server

```bash
cd ~/Git/GitHub/badjockeys/bjk-identity-server
cp user-secrets.template.json user-secrets.json        # git-ignored
# edit user-secrets.json: your SQL password from bjk-core/.env (in both connection strings)
dotnet user-secrets set --project src/BJK.Idsrv.Host < user-secrets.json
```

The format is:

```json
{
  "ConnectionStrings": {
    "IdentityDatabase": "Server=localhost,1433;Database=idsrv;User Id=sa;Password=<BJK_SQL_PASSWORD from bjk-core/.env>;TrustServerCertificate=True;MultipleActiveResultSets=true",
    "Messaging": "Server=localhost,1433;Database=badjockeys;User Id=sa;Password=<BJK_SQL_PASSWORD from bjk-core/.env>;TrustServerCertificate=True"
  },
  "Email": {
    "FromAddress": "no-reply@badjockeys.local",
    "PasswordResetUrl": "http://localhost:3000/reset-password"
  },
  "Captcha": {
    "TurnstileSecretKey": "1x0000000000000000000000000000000AA"
  },
  "Messaging": {
    "ConnectionStringName": "Messaging",
    "CreateTables": false
  }
}
```

The identity server writes user events straight into the API's queue table in `badjockeys` (`ConnectionStrings:Messaging`). Until the API has started once and created it, the events wait in the identity server's outbox. The CAPTCHA key is Cloudflare's public test key, which always passes. The identity server's own guide (`bjk-identity-server/docs/local-development.md`) explains it, along with the email placeholder and the test clients.

### API

```bash
cd ~/Git/GitHub/badjockeys/bjk-core
cp user-secrets.template.json user-secrets.json        # git-ignored
# edit user-secrets.json: your SQL password (the storage settings already point at S3Mock)
dotnet user-secrets set --project src/BJK.Core.Api < user-secrets.json
dotnet user-secrets list --project src/BJK.Core.Api    # check they're all there
```

The format is:

```json
{
  "ConnectionStrings": {
    "AppDatabase": "Server=localhost,1433;Database=badjockeys;User Id=sa;Password=<BJK_SQL_PASSWORD from bjk-core/.env>;TrustServerCertificate=True;MultipleActiveResultSets=true"
  },
  "Authentication": {
    "Authority": "https://localhost:5001"
  },
  "Cors": {
    "AllowedOrigins": [ "http://localhost:3000" ]
  },
  "Media": {
    "Storage": {
      "ServiceUrl": "http://localhost:9090",
      "AccessKeyId": "local",
      "SecretAccessKey": "local",
      "OriginalsBucket": "bjk-dev-originals",
      "PublicBucket": "bjk-dev-public",
      "PublicBaseUrl": "http://localhost:9090/bjk-dev-public/"
    },
    "Queue": {
      "QueueName": "media.process"
    },
    "Processing": {
      "FfmpegPath": "ffmpeg",
      "FfprobePath": "ffprobe"
    }
  },
  "Captcha": {
    "TurnstileSecretKey": "1x0000000000000000000000000000000AA"
  },
  "Safety": {
    "RequireAgeVerification": false
  },
  "Messaging": {
    "PollingInterval": "00:00:01",
    "UserEventsQueue": "bjk-core.user-events",
    "MediaEventsQueue": "bjk-core.media-events"
  }
}
```

| Setting | What it is |
|---|---|
| `ConnectionStrings:AppDatabase` | The main app database `badjockeys`, on the same SQL Server as `idsrv` |
| `Authentication:Authority` | The identity server that issues the tokens the API accepts |
| `Cors:AllowedOrigins` | The web app's address, so the browser can call the API |
| `Media:Storage:*` | Local S3Mock and its two buckets (step 5), or R2 later |
| `Media:Queue:QueueName` | The queue for processing jobs; created automatically |
| `Media:Processing:FfmpegPath`, `FfprobePath` | Where ffmpeg is. `ffmpeg` and `ffprobe` work if they're on your `PATH`; otherwise use the full path, e.g. `/opt/homebrew/bin/ffmpeg` |
| `Captcha:TurnstileSecretKey` | Cloudflare's test secret, for the public report form |
| `Safety:RequireAgeVerification` | `false` locally, so writes don't need the identity server's `age_verified` claim |
| `Messaging:*` | Optional. The queues are tables in `AppDatabase` (schema `messaging`), created automatically. `UserEventsQueue` receives account deactivations, reactivations and deletions from the identity server; `MediaEventsQueue` receives media ready/failed for Posts |

Some settings are optional:

| Setting | Default |
|---|---|
| `MediatR:LicenseKey` | Unset. Without it MediatR logs a licence warning. |
| `Media:MaxVideoBytes` | 150 MB |
| `Media:MaxImageBytes` | 25 MB |
| `Media:MaxVideoDurationSeconds` | 30 |
| `Media:UploadUrlLifetime` | `00:15:00` |
| `Media:UnusedOriginalRetention` | `1.00:00:00` (24 hours; originals are deleted once a post is published) |
| `Email:Provider`, `SMS:Provider` | `Log`: emails and texts are written to the console, not sent |
| `Media:Processing:MaxConcurrentJobs` | 1 |
| `Media:Redaction:FaceModelPath`, `PlateModelPath` | Unset: blurring can't run, so every upload goes to `NeedsReview`. The setup script downloads the models to `bjk-core/.local/models` and sets these for you. By hand: `pipelines/scripts/download-redaction-models.sh ~/bjk-models` (macOS and Linux), then point these at the two `.onnx` files |
| `Media:Processing:VideoHeight`, `VideoCrf` | 720, 23 |
| `Media:Processing:ImageMaxSize`, `ThumbnailMaxSize` | 2048, 640 pixels |

The media worker shares the API's user secrets (same `UserSecretsId`), so you load them once.

To change one setting later:

```bash
dotnet user-secrets set "Media:Storage:AccessKeyId" "<new key>" --project src/BJK.Core.Api
```

### Web app

Next.js doesn't use .NET user secrets. It reads a git-ignored `src/web/.env.local` instead; the template, with every
setting explained, is `src/web/.env.local.example`:

```bash
APP_URL=http://localhost:3000
API_BASE_URL=https://localhost:5101
IDSRV_AUTHORITY=https://localhost:5001
IDSRV_CLIENT_ID=bjk-web
IDSRV_CLIENT_SECRET=local-web-secret
AUTH_SECRET=<any long random string: openssl rand -base64 32>
TURNSTILE_SITE_KEY=1x00000000000000000000AA
MEDIA_ORIGINS=http://localhost:9090
UPLOAD_ORIGINS=http://localhost:9090
```

| Setting | What it is |
|---|---|
| `APP_URL` | The web app's address. It must match the identity server's `Clients:Web:RedirectUris` (`http://localhost:3000/api/auth/callback/bjk`) |
| `API_BASE_URL` | The API, on its `https` address. Not `http://localhost:5100`: the API redirects http to https, and Node.js drops the sign-in token when following a redirect, so signed-in calls would get 401. Node.js trusts the dev certificate through `NODE_EXTRA_CA_CERTS` (below) |
| `IDSRV_AUTHORITY`, `IDSRV_CLIENT_ID`, `IDSRV_CLIENT_SECRET` | The identity server and the `bjk-web` client. The secret is `Clients:Web:Secret` from the identity server's user secrets |
| `AUTH_SECRET` | Encrypts the session cookie holding the user's tokens |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile on the public report form. `1x00000000000000000000AA` is the public test **site** key, which always passes; it pairs with the test **secret** key in the API's `Captcha:TurnstileSecretKey` |
| `MEDIA_ORIGINS`, `UPLOAD_ORIGINS` | Where photos and videos are shown from and uploaded to, for the Content-Security-Policy (S3Mock locally). `UPLOAD_ORIGINS` is also allowed for images and video, because sensitive media for age-verified members are signed links to the storage endpoint |
| `MAP_TILE_URL`, `MAP_ATTRIBUTION` | Optional. Map tiles for the incident pin and the incident map (`/map`); OpenStreetMap's public tiles by default. Heavy production use needs a tile provider (OpenStreetMap's tile usage policy doesn't allow it): pick one and set both values |

None of these reach the browser, so the same container image works in every environment.

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

# 3. Media worker (start the API once first: it creates the database)
cd ~/Git/GitHub/badjockeys/bjk-core
dotnet run --project src/BJK.Core.MediaWorker --launch-profile worker
```

The first time each app starts, it creates its database and logs each schema being built, for example `MediaDbContext: applying migrations ...`. On later starts, each schema logs `database schema is up to date`.

To check they're running:

- Identity server: https://localhost:5001/.well-known/openid-configuration returns JSON.
- API: https://localhost:5101/health returns `Healthy`.

### API reference

The API reference isn't a document anyone writes: NSwag generates it from the controllers and their XML comments every time the API starts, so it always matches the code. In Development:

- **Swagger UI:** https://localhost:5101/api-docs, to browse every endpoint and try calls. Use **Authorize** with an access token from the identity server.
- **OpenAPI document:** https://localhost:5101/openapi/v1.json, to import into Postman or generate a client.

Each CI run also attaches the document as the `openapi` artifact. In other environments it's off unless `ApiDocs:Enabled` is `true`.

The web app's API client is generated from the same controllers. Every Debug build of `src/BJK.Core.Api` rewrites `src/web/src/lib/generated/api.ts` (settings in `src/BJK.Core.Api/nswag.json`); never edit that file by hand. When you change an endpoint or a DTO in bjk-modules and update core to the new packages, build the API and commit the regenerated file with your change: CI fails if it's out of date. `src/web/src/lib/api-client.ts` wraps it to add the caller's token, caching and `ApiError`.

## 8. Run the web app

You need Node.js 24 (step 1). The first time:

```bash
cd ~/Git/GitHub/badjockeys/bjk-core/src/web
cp .env.local.example .env.local      # then set AUTH_SECRET (openssl rand -base64 32)
npm ci                                # installs exactly what package-lock.json says; again after it changes

# Node.js doesn't read the system certificate store, so give it the .NET development certificate for https://localhost:5001
dotnet dev-certs https --export-path ~/.aspnet/dev-cert.pem --format PEM --no-password
```

Then, with the identity server, the API and the media worker running (step 7):

```bash
NODE_EXTRA_CA_CERTS=~/.aspnet/dev-cert.pem npm run dev
```

On Windows (PowerShell): `$env:NODE_EXTRA_CA_CERTS="$HOME\.aspnet\dev-cert.pem"; npm run dev`. The "Web app" task in VS Code sets it for you.

Open http://localhost:3000. **Join** goes to the identity server's sign-up page (email, password and date of birth),
then back to the web app to create your profile. Posting and commenting need a confirmed email address: the
confirmation link is in the identity server's console. The age check is only needed to view posts tagged sensitive;
locally it uses development stand-ins that always pass (`AgeAssurance` in the identity server's user secrets).

| Command (in `src/web`) | Does |
|---|---|
| `npm run dev` | Runs the app with hot reload on http://localhost:3000 |
| `npm run lint`, `npm run format:check`, `npm run typecheck` | ESLint, Prettier and TypeScript, as in CI |
| `npm test` | Unit and component tests (Vitest and Testing Library) |
| `npm run build && npm run e2e` | End-to-end tests in a browser (Playwright). They start `e2e/mock-server.mjs`, a stand-in for the identity server, the API and storage, so nothing else needs to be running. First run `npx playwright install chromium` |
| `docker build -t bjk-core-web .` | The container image (Node.js 24, standalone output, runs as a non-root user) |

### How the web app fits together

- **Sign-in** is OpenID Connect with PKCE against the identity server, as the confidential client `bjk-web`. The
  web server swaps the code for tokens and keeps them in an encrypted, httpOnly session cookie, so scripts in the
  browser never see them. It refreshes the access token a minute before it expires (refresh tokens are one-time).
  Sign-in, sign-up, the age check, two-step, password and deactivation pages all belong to the identity server.
- **Pages** are rendered on the web server, which calls the API with the user's token. Post pages carry Open Graph
  and X card tags (title, area name, category and the blurred thumbnail), so shared links get a preview.
- **Uploads** go straight from the browser to storage: the web server asks the API for a signed link
  (`POST /api/media/uploads`), the browser `PUT`s the file to S3Mock (or R2) with a progress bar, then the web server
  tells the API it's there. Photos are shrunk in the browser first; videos are trimmed to at most 30 seconds and
  shrunk to 720p with [Mediabunny](https://mediabunny.dev) (WebCodecs), or uploaded as they are if the browser can't.
- **Security:** a Content-Security-Policy with a fresh nonce on every page, no framing, a strict referrer policy,
  and every change goes through a server action or a form post that checks it came from our own pages.

## Trying it end to end

The quickest way is the web app (step 8). To try the API directly, use the `.http` files and the identity server's local test clients:

1. **Create a user and sign in.** Use `bjk-identity-server/src/BJK.Idsrv.Host/BJK.Idsrv.Host.http`, sending the requests from top to bottom. The sign-in returns an access token.
2. **Try the API.** Use `bjk-core/src/BJK.Core.Api/BJK.Core.Api.http` with that token. For example, uploading:
   1. `POST /api/media/uploads` returns a signed upload URL.
   2. `PUT` your file to that URL. It goes straight to storage (S3Mock), not through the API.
   3. `POST /api/media/{id}/complete` queues the processing job: a row in `[messaging].[media.process]` until the worker finishes it.
   4. Within a few seconds the worker logs the job and the media turns `Ready`. `GET /api/media/mine` lists your uploads, and the processed file is in `bjk-dev-public`.

Ask for the API's scopes when you sign in with the identity server's local test client: `scope=openid bjk.media bjk.profiles bjk.posts`. Each module checks its own scope.

Posting and commenting also need a confirmed email address (confirm it from the link in the identity server's console).

## Example users and posts

The setup fills a fresh install with example data, so the feed, map and notifications have something in them. Each run replaces it. To refresh it without the rest of the setup, run `node scripts/sql/example-data/seed.mjs` from bjk-core. That needs SQL Server and S3Mock running, and the identity server and API to have started once.

It adds 8 example users and 26 posts around Prescot, Liverpool, Warrington, Manchester, Leeds and London. The posts come with reactions, comments and replies, vehicle details, and enough posts close together for the heat map. The photos are placeholder dashcam frames marked "Example clip", uploaded to S3Mock.

- **Sign in as an example user:** for example `dave@example.test` (@dashcam_dave) or `priya@example.test` (@pedal_power_priya), password `BadJockeys!2026`. They're all adults who have passed the age check, with confirmed emails.
- **Your own account** (`aaron.greenhalgh@badjockey.com`; change `OWNER_EMAIL` in `scripts/sql/example-data/data.mjs`) gets Premium+ through `Plans:Overrides` in the API's user secrets. Once it has a profile, Dashcam Dave also tags it as a passenger on one post: you'll see it under **Approve tags** and in the bell. If you sign up after the setup, run the setup again.
- **What it touches:** only rows whose ids start `e0000000`.
- **The SQL** is `scripts/sql/example-data/seed.sql`. After changing `data.mjs`, regenerate it with `node scripts/sql/example-data/build-sql.mjs`.

There are no videos, so Reels stays empty.

## Data and handy queries

To look at the data, connect your SQL tool with these settings:

- Server: `localhost,1433`
- User: `sa`
- Password: from `bjk-core/.env`
- Tick **Trust server certificate**

```sql
USE idsrv;
SELECT Id, Email, DisplayName, IsDeleted FROM users.Users;    -- Id is the same as auth.AspNetUsers.Id
SELECT Id, Email, LockoutEnd FROM auth.AspNetUsers;

USE badjockeys;
SELECT Id, UserId, MediaType, Status, OriginalFileName, CreatedAt FROM media.Media ORDER BY CreatedAt DESC;
```

Every person has one id. A user's profile id equals their sign-in account id (the `sub` in their token). It's also the `{userId}` folder in storage keys: `{userId}/{mediaId}/original.mp4`.

## Reports

Two Grafana dashboards, at **http://localhost:3300** (no sign-in needed to view; `admin` / `admin` to edit). F5 ("Bad Jockeys") and the task "Run Bad Jockeys" open them in your browser once Grafana is up, alongside the web app:

- **Identity server:** accounts now (active, deactivated, email confirmed, two-step on, locked out, age-checked, under 18), sign-ups and deactivations per day, age bands, how people sign in (password or Google, Apple, Facebook), age checks, staff roles, and account changes still waiting to reach the app.
- **Bad Jockeys** (the home page): posts now and per day, people active in the last 30 days, features in use (drafts, area alerts, passenger tags), posts by type, top places, when incidents happen, uploads and processing times, faces and plates blurred, queues and failed jobs, comments, reactions and reel plays, reports (per day, open and overdue, decision times) and moderation actions.

How it fits together:

- **Counts only.** Grafana reads only the `reporting` schema in each database: views that count and group (`scripts/sql/reporting/idsrv.sql` and `badjockeys.sql`). They never return emails, names, handles, ids, dates of birth or report details. Place names are the public ones shown on posts.
- **Read-only login.** Grafana signs in as `bjk_reporting`, which can read those views and nothing else, not even the tables behind them. Its password is `BJK_REPORTING_PASSWORD` in `bjk-core/.env`; the setup creates it.
- **Grafana** runs in the `bad-jockeys` Docker group. Its data sources and dashboards come from `src/reporting/grafana` (provisioned, so they can't drift). To change a dashboard, edit it in Grafana as admin, then **Export → Save to file** and replace the JSON in `src/reporting/grafana/dashboards`; edits made only in Grafana are lost when it restarts.
- **After pulling changes to the views**, or if the setup couldn't apply them (the identity server and API must each have started once, so both databases exist): `node scripts/sql/reporting/apply.mjs`.
- **Adding a report:** add or change a view in the matching `scripts/sql/reporting/*.sql` (counts only, `CREATE OR ALTER VIEW reporting.<Name>`), apply it, then add a panel. CI applies every view, checks `bjk_reporting` can read each one but not the tables, starts Grafana and runs every panel's query.
- **Logs and errors aren't here:** those are monitoring, which goes to Grafana Cloud (OpenTelemetry) once deployed.

When deployed, Grafana is its own container behind Cloudflare Access, with Google sign-in limited to badjockeys.com; `bjk_reporting` is a contained database user in each Azure SQL database, its password a container secret.

## Database changes

The apps apply schema changes when they start. A migration that would drop a table, column or schema, or delete rows, **stops the app from starting** and lists what it would remove. To run one deliberately, review it, then set `Database:AllowDestructiveMigrations` to `true` for that one run.

Module tables and migrations live in **bjk-modules**. The API picks up a change when you move it to a newer `BJK.Modules.*` package version in `Directory.Packages.props`. Every push to a bjk-modules feature branch publishes a preview version (`0.x.y-ci.<run>`), so you can test a change before it's merged.

To start from empty databases (this also empties the local file storage):

```bash
cd ~/Git/GitHub/badjockeys/bjk-core && docker compose down -v && docker compose up -d --wait
```

## Troubleshooting

- **`NU1301` or `401 Unauthorized` on restore.** The NuGet token isn't set in this terminal, or has expired (step 3). Check with `echo $NuGetPackageSourceCredentials_badjockeys`.
- **`Connection string '...' is not configured` or `The ... field is required`.** Your user secrets aren't loaded (step 6), or the app isn't running in Development. The `https` launch profile sets Development.
- **`Login failed for user 'sa'`.** The password in your user secret doesn't match `bjk-core/.env`. If you changed `.env` after the container was first created, SQL Server still has the old password: in bjk-core run `docker compose down -v` (this deletes local data), then `docker compose up -d --wait`.
- **`A network-related or instance-specific error`.** SQL Server isn't running or isn't healthy yet. Run `docker ps`, then `docker compose logs sql` in bjk-core.
- **A job or event doesn't arrive.** Look in the queue tables (`SELECT * FROM [messaging].[media.process]`) and their `.failed` tables; [messaging.md](messaging.md) shows how to read why a message was dead-lettered.
- **An upload stays at `Processing`.** The media worker isn't running, or it can't find ffmpeg: check its console for `ffmpeg` errors, and set `Media:Processing:FfmpegPath` to the full path (`which ffmpeg`).
- **An upload goes to `Failed`.** The file isn't a video or photo ffmpeg can read, or it's over the size or length limits. The worker logs the reason.
- **`Connection refused` on port 9090.** S3Mock isn't running: `docker compose up -d --wait` in bjk-core.
- **`port is already allocated` for 1433 or 9090.** Something else holds the port, often a container from the old layout. The scripts remove those; by hand: `docker ps`, then `docker rm -f <the container>`.
- **The browser upload fails with a CORS error.** The storage doesn't allow `PUT` from `http://localhost:3000` (for R2, see step 5).
- **`SignatureDoesNotMatch` or `InvalidAccessKeyId` from R2.** The R2 keys are wrong, or the token isn't scoped to the dev buckets.
- **The API returns `401` with a valid-looking token.** Check that `Authentication:Authority` is `https://localhost:5001`, that the identity server is running, and that you ran `dotnet dev-certs https --trust`.
- **The SQL container keeps restarting on an Apple Silicon Mac.** Turn on Rosetta in Docker Desktop (step 1).
- **Docker Desktop on Windows says WSL 2 is missing or out of date.** Run `wsl --install` (or `wsl --update`) in an administrator PowerShell, restart, then open Docker Desktop again.
- **`'ffmpeg' is not recognized` on Windows.** Open a new terminal after installing it, or set `Media:Processing:FfmpegPath` and `FfprobePath` to the full paths (`where.exe ffmpeg`).
- **The web app says `unable to verify the first certificate` or `self-signed certificate` when signing in.** Node.js doesn't trust the .NET development certificate: export it and start the web app with `NODE_EXTRA_CA_CERTS` (step 8).
- **Signing in comes back with "Signing in didn't work".** Check the web app's console. Usually `IDSRV_CLIENT_SECRET` doesn't match the identity server's `Clients:Web:Secret`, or `APP_URL` doesn't match `Clients:Web:RedirectUris`.
- **A port is already in use (1433, 9090, 5001, 5101 or 3000).** Stop whatever is using it (`lsof -i :<port>`), or change the left-hand port in the compose file and the matching setting.

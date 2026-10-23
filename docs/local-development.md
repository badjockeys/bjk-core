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
| Logs, traces and metrics (Elasticsearch, Kibana and Elastic's OpenTelemetry collector) | bjk-core (`docker-compose.yml`, `src/observability`) | Docker, group `bad-jockeys` | Kibana http://localhost:5601; OTLP on `localhost:4317` / `4318` |

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
- creates your git-ignored config files from the templates, with your own SQL password and secrets (`bjk-core/.env`, the identity server's and the API's .NET user secrets, `src/web/.env.local`); files you already have are left alone;
- trusts the HTTPS development certificate and exports it for Node.js;
- starts SQL Server, S3Mock, Elasticsearch, Kibana and the OpenTelemetry collector in Docker (the `bad-jockeys` group, replacing the old layout's two groups and the old Grafana containers if they're there) and waits until they're all ready;
- downloads the face and number plate blurring models into `bjk-core/.local/models` (git-ignored), checking each file's SHA-256;
- builds the .NET apps and installs the web app's packages.

`node scripts/setup-local.mjs --config-only` just creates the config files.

To debug, use VS Code's **Run and Debug** panel instead: pick **"Bad Jockeys"** and press F5 to start SQL Server and S3Mock in Docker (opening Docker Desktop first if it's closed, and waiting for it; Elasticsearch, Kibana and the collector start alongside without holding things up, and Kibana opens in your browser when it's ready), then build and start all four with the debugger attached (breakpoints work in the .NET code and in the web app's server code), and the web app opens in your browser when it's ready. Shift+F5 stops them all. Each app is also there on its own ("Identity server", "API", "Media worker", "Web app"), to restart just one. The web app and the media worker wait for the apps they depend on, as with the task. The .NET ones also make sure Docker is running first, so they work on their own too. If Docker can't be started (say it's still updating), it stops with a message saying so, before any app tries to connect. "Run Bad Jockeys" (Terminal → Run Task…) does the same without the debugger, Docker check included.

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
| ffmpeg, with the H.264 and WebP encoders | any recent | `brew install ffmpeg ffmpeg-full` (Homebrew's plain `ffmpeg` has no WebP encoder) | `winget install Gyan.FFmpeg` | `ffmpeg -hide_banner -encoders \| grep -E "libx264\|libwebp"` |
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

5. **ffmpeg** (in the table above) is what the media worker uses to convert videos (H.264) and photos (WebP). On a Mac, Homebrew's plain `ffmpeg` can't make WebP, so the setup also installs `ffmpeg-full`. That one isn't on your `PATH`, so the setup writes its full path into your user secrets (`Media:Processing:FfmpegPath` and `FfprobePath`, and the other ffmpeg settings).

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

Accepted files: videos in MP4, MOV, M4V, 3GP, WebM, MKV or AVI, and photos in JPEG, PNG, HEIC/HEIF, WebP, AVIF, GIF, TIFF or BMP. An animated GIF becomes a still of its first frame.

The web app uploads a file as soon as it's chosen, so uploads can be left behind (a closed tab, a photo removed before posting). Once an hour the API deletes uploads over `Media:UnusedOriginalRetention` (24 hours) old that aren't in a post, a draft or an avatar: all their files go, and the record is marked `Deleted`. Taking a photo out of a saved draft deletes it straight away, unless a post or another draft uses it.

S3Mock doesn't check keys, so the `local` keys in the template work as they are. Files survive `docker compose stop` and restarts; `docker compose down -v` deletes them, together with the databases, so the two always stay in step.

### Using Cloudflare R2 instead (later)

Once there's a Cloudflare account, you can point your user secrets at shared dev buckets instead. Create an R2 API token with **Object Read & Write** limited to the `bjk-dev-*` buckets, then set `Media:Storage:ServiceUrl` to `https://<account id>.r2.cloudflarestorage.com`, the two keys to the token's values, and `PublicBaseUrl` to the public bucket's URL. The dev originals bucket also needs a CORS rule allowing `PUT` from `http://localhost:3000`, and a lifecycle rule that deletes originals after 90 days. Both will move into Terraform.

## 6. Your settings: .NET user secrets

The repos' `appsettings` files hold no environment settings. On your machine, settings come from .NET **user secrets**. They're stored in your home folder, never in a repo, and they load only when the app runs in Development. Each repo has a `user-secrets.template.json` showing every setting and its format; the template's values are blank (`""`) except plain local settings like addresses and thresholds. The setup writes your own copy **straight into the user secrets**, filling in only what it knows or makes itself (your SQL password, generated keys, model paths, Turnstile's test keys); supplier keys you'd get yourself (SendGrid, Twilio, Yoti, social sign-in) stay empty, and after that it only adds or renames settings, never overwrites yours.

**To view or change them**, open the app's secrets file:

- **VS Code:** install Microsoft's **C# Dev Kit** extension, then right-click `src/BJK.Core.Api/BJK.Core.Api.csproj` (or `bjk-identity-server/src/BJK.Idsrv.Host/BJK.Idsrv.Host.csproj`) → **Manage User Secrets**. Without the extension the command says `csdevkit.manageUserSecrets not found`; open the file directly instead: `code ~/.microsoft/usersecrets/bjk-core-api/secrets.json`.
- **Rider:** right-click the project → **Tools → .NET User Secrets**. **Visual Studio:** right-click the project → **Manage User Secrets**.
- **The files:** the API and the media worker share `bjk-core-api` (`~/.microsoft/usersecrets/bjk-core-api/secrets.json` on a Mac, `%APPDATA%\Microsoft\UserSecrets\bjk-core-api\secrets.json` on Windows); the identity server is `bjk-identity-server`.

Edit, save, and restart the app; there's nothing to load. It's ordinary JSON in sections, like `appsettings.json`.

**Before 22 Oct 2026** the setup kept a copy in `bjk-core/user-secrets.json` and `bjk-identity-server/user-secrets.json` and loaded it each run, which overwrote changes made with Manage User Secrets. The next setup run moves those copies into the user secrets (renaming them `user-secrets.json.moved`, no longer used) and tidies the secrets into sections.

### Identity server

The settings and their format are in `bjk-identity-server/user-secrets.template.json`. The identity server writes user events straight into the API's queue table in `badjockeys` (`ConnectionStrings:BadJockeysDatabase` in its user secrets). Until the API has started once and created it, the events wait in the identity server's outbox. The CAPTCHA keys are empty in the template; the setup puts in Cloudflare's public test keys, which always pass. `Admin:BootstrapEmails` starts empty: add your email once you've registered. The identity server's own guide (`bjk-identity-server/docs/local-development.md`) explains it, along with the email placeholder and the test clients.

### API

The format is below (`user-secrets.template.json`). Every value you'd get from a supplier account (SendGrid, Twilio, Turnstile, push and classifier endpoints) is empty `""`, and so is everything the setup knows or makes: the SQL password (`Password=;`), the model paths and the viewer key secret. The setup fills those in your copy; supplier keys stay empty locally, and each feature falls back to its local stand-in.

```json
{
  "ConnectionStrings": {
    "BadJockeysDatabase": "Server=localhost,1433;Database=badjockeys;User Id=sa;Password=;TrustServerCertificate=True;MultipleActiveResultSets=true"
  },
  "Authentication": {
    "//": "The identity server.",
    "Authority": "https://localhost:5001"
  },
  "Cors": {
    "//": "The web app, which calls the API from the browser.",
    "AllowedOrigins": [
      "http://localhost:3000"
    ]
  },
  "Media": {
    "Storage": {
      "//": "S3Mock locally, Cloudflare R2 when deployed.",
      "ServiceUrl": "http://localhost:9090",
      "AccessKeyId": "local",
      "SecretAccessKey": "local",
      "OriginalsBucket": "bjk-dev-originals",
      "PublicBucket": "bjk-dev-public",
      "PublicBaseUrl": "http://localhost:9090/bjk-dev-public/"
    },
    "Processing": {
      "FfmpegPath": "ffmpeg",
      "FfprobePath": "ffprobe"
    },
    "Redaction": {
      "//": "Face and number plate blurring (YuNet models), plus head blurring for everyone a person detector (YOLOX) finds, run by the media worker. FaceDetectionSize: faces are searched in a copy scaled to this many pixels (small faces are found far better enlarged). Head blurs never send media to review. BlurPlateAreas: the person detector also finds vehicles, and where no plate was found on one, its lower middle (where the plate is) is blurred; this catches UK plates the plate model misses, like white front plates in headlight glare, and never sends media to review. The setup downloads the models and sets the paths; without them every upload waits for review. The rest are the defaults: detections below MinConfidence are ignored, from ConfidentAt they're blurred without review; frames are analysed every DetectEveryNthFrame at most DetectionMaxSize px. ReviewEverything true sends every upload to a moderator (live at launch). ExecutionProvider Cpu (Cuda only on a GPU worker image).",
      "FaceModelPath": "",
      "PlateModelPath": "",
      "PersonModelPath": "",
      "FaceMinConfidence": 0.5,
      "FaceConfidentAt": 0.5,
      "PlateMinConfidence": 0.5,
      "PlateConfidentAt": 0.8,
      "FaceTrackConfidence": 0.3,
      "PlateTrackConfidence": 0.3,
      "HeadMinConfidence": 0.4,
      "HeadTrackConfidence": 0.25,
      "BlurPlateAreas": true,
      "VehicleMinConfidence": 0.3,
      "VehicleTrackConfidence": 0.2,
      "FaceDetectionSize": 1440,
      "BoxPadding": 0.25,
      "DetectEveryNthFrame": 5,
      "MaxMissedDetections": 3,
      "PlateTiles": true,
      "RemoveAudio": true,
      "ReviewEverything": false,
      "VideoTimeout": "00:25:00",
      "InferenceThreads": 0,
      "DetectionMaxSize": 640,
      "ExecutionProvider": "Cpu",
      "CudaDeviceId": 0
    },
    "SensitiveDetection": {
      "//": "Nudity and graphic content checks (CLIP), on when ModelPath is set; the setup downloads the model and sets it. Without it a stand-in that flags mostly red pictures runs locally. Graphic content at or above Threshold is marked sensitive (shown blurred, queued for a moderator); nudity at or above NudityThreshold is held for a moderator. SampleEvery: score every Nth analysed video frame.",
      "ModelPath": "",
      "Threshold": 0.35,
      "NudityThreshold": 0.3,
      "SampleEvery": 3
    },
    "KnownImages": {
      "//": "Checking uploads against known illegal images (PDQ, SHA-256, MD5 hashes in SQL). Locally only the harmless test entries (scripts/sql/safety-test). Always on when deployed.",
      "Enabled": true,
      "RefreshInterval": "00:05:00",
      "PdqMaxDistance": 31,
      "PdqMinQuality": 50,
      "SyncInterval": "06:00:00"
    }
  },
  "Email": {
    "//": "SendGrid sends when SendGrid:ApiKey is set; empty (locally) = emails are written to the console. For live values see 'Going live' in docs/local-development.md.",
    "FromAddress": "no-reply@badjockeys.local",
    "SendGrid": {
      "ApiKey": ""
    }
  },
  "SMS": {
    "//": "Twilio sends when its settings are set; empty (locally) = texts are written to the console.",
    "Twilio": {
      "AccountSid": "",
      "ApiKeySid": "",
      "ApiKeySecret": "",
      "MessagingServiceSid": ""
    }
  },
  "Captcha": {
    "//": "Turnstile, for the public report form (it sends X-Captcha-Token). Required: empty, the setup puts in Cloudflare's public test secret, which accepts every token.",
    "TurnstileSecretKey": ""
  },
  "Screening": {
    "//": "Text screening of posts and comments: the built-in keyword list always runs. Endpoint (optional) adds a classifier service (e.g. Detoxify); empty = keywords only. Scores from FlagThreshold publish but are flagged; from HoldThreshold they're held for review.",
    "Endpoint": "",
    "FlagThreshold": 0.5,
    "HoldThreshold": 0.8,
    "Timeout": "00:00:03"
  },
  "BlockedUrls": {
    "//": "Web addresses that can't be posted (the list is in SQL; locally the test entries). How often each API copy reloads the list, and how often it's synced from its sources.",
    "RefreshInterval": "00:05:00",
    "SyncInterval": "06:00:00"
  },
  "Reels": {
    "//": "Daily reel plays per UK day: signed out and Free (Premium is unlimited). ViewerKeySecret hashes signed-out viewers (secret; the setup makes one).",
    "DailyPlays": {
      "Anonymous": 10,
      "Free": 25
    },
    "ViewerKeySecret": ""
  },
  "Heatmap": {
    "//": "Map squares with fewer than MinCellCount incidents are hidden. History in days by plan.",
    "MinCellCount": 3,
    "HistoryDays": {
      "Free": 7,
      "Premium": 365,
      "PremiumPlus": 1826
    }
  },
  "Plans": {
    "//": "Billing isn't built: until the identity server issues the plan claim, give accounts a plan here (user id -> free | premium | premium_plus). The setup adds yours as premium_plus.",
    "Overrides": {}
  },
  "Notifications": {
    "//": "AppUrl: the web app's address, for links in notification emails. Push: web push (VAPID) keys, on when both are set; the setup makes a pair for this computer. Live: one pair per environment, never changed (see 'Going live').",
    "AppUrl": "http://localhost:3000",
    "Push": {
      "PublicKey": "",
      "PrivateKey": "",
      "Subject": "mailto:support@badjockeys.com"
    }
  },
  "Queues": {
    "//": "Optional; defaults shown. The queues are tables in the messaging schema of BadJockeysDatabase (see docs/messaging.md).",
    "PollingInterval": "00:00:01",
    "UserEvents": "bjk-core.user-events",
    "MediaEvents": "bjk-core.media-events",
    "MediaProcessing": "media.process"
  }
}
```

There are no provider switches: a service is used when its settings are filled in. When they're empty, your machine uses a stand-in (and the log says so), and a deployed environment refuses to start, naming the setting.

| Setting | What it is |
|---|---|
| `ConnectionStrings:BadJockeysDatabase` | The main app database `badjockeys`, on the same SQL Server as `idsrv` |
| `Authentication:Authority` | The identity server that issues the tokens the API accepts |
| `Cors:AllowedOrigins` | The web app's address, so the browser can call the API |
| `Media:Storage:*` | Local S3Mock and its two buckets (step 5), or R2 later |
| `Media:Processing:FfmpegPath`, `FfprobePath` | Where ffmpeg is. `ffmpeg` and `ffprobe` work if they're on your `PATH`; otherwise use the full path, e.g. `/opt/homebrew/bin/ffmpeg` |
| `Media:Redaction:FaceModelPath`, `PlateModelPath`, `PersonModelPath` | The blurring models (set by the setup). Without them every upload goes to `NeedsReview` |
| `Media:SensitiveDetection:*` | The CLIP model for the nudity and graphic content checks (set by the setup; without it a stand-in that flags mostly red pictures runs locally), and its thresholds |
| `Media:Redaction:BlurPlateAreas`, `VehicleMinConfidence`, `VehicleTrackConfidence` | Blur the lower middle of every vehicle the person detector finds when no plate was found on it (the plate model misses many UK plates, such as white front plates at night). Never holds uploads for review |
| `Media:Redaction:*` (the rest) | How blurring decides: confidence thresholds, how often frames are analysed, `ReviewEverything` (false locally, true live at launch), CPU or GPU |
| `Media:KnownImages:*`, `BlockedUrls:*` | The known illegal image check and blocked web addresses: on, with the harmless test entries locally (see "Online safety checks") |
| `Screening:*` | Text screening: the keyword list, plus a classifier when `Endpoint` is set (empty locally) |
| `Email:SendGrid:ApiKey` | Empty: emails are written to the console, not sent. Set: SendGrid sends them |
| `SMS:Twilio:*` | Empty: texts are written to the console. Set: Twilio sends them |
| `Captcha:TurnstileSecretKey` | Empty in the template. It's required even locally, so the setup puts in Cloudflare's public test secret (accepts every token), for the public report form |
| `Reels:*`, `Heatmap:*`, `Plans:Overrides` | Daily plays and the viewer key secret (made by the setup); the heat map's limits; plans for test accounts until billing exists (the setup gives yours Premium+) |
| `Notifications:AppUrl`, `Notifications:Push:*` | The web app's address for email links; this computer's web push key pair (made by the setup) |
| `Queues:*` | Optional. The queues are tables in `BadJockeysDatabase` (schema `messaging`), created automatically. `UserEvents` receives account deactivations, reactivations and deletions from the identity server; `MediaEvents` receives media ready/failed for Posts; `MediaProcessing` holds the worker's jobs |

**Older settings.** If your user secrets were made before 21 Oct 2026, the setup renames its settings for you (`AppDatabase` → `BadJockeysDatabase`, `Messaging` → `Queues`, the `Provider` and `Enabled` switches removed) and does the same for the identity server's once that repo is up to date.

Some settings are optional:

| Setting | Default |
|---|---|
| `MediatR:LicenseKey` | Unset. Without it MediatR logs a licence warning. |
| `Media:MaxVideoBytes` | 150 MB |
| `Media:MaxImageBytes` | 25 MB |
| `Media:MaxVideoDurationSeconds` | 30 |
| `Media:UploadUrlLifetime` | `00:15:00` |
| `Media:UnusedOriginalRetention` | `1.00:00:00` (24 hours; originals are deleted once a post is published, and uploads nothing uses are deleted after this long) |
| `Media:Processing:MaxConcurrentJobs` | 1 |
| `Media:Processing:VideoHeight`, `VideoCrf` | 720, 23 |
| `Media:Processing:ImageMaxSize`, `ThumbnailMaxSize` | 2048, 640 pixels |

The media worker shares the API's user secrets (same `UserSecretsId`), so one file covers both. Change settings with Manage User Secrets (above); `dotnet user-secrets set` works too, but it rewrites the whole file with flat `Section:Key` names (the setup tidies them back into sections next time).

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

If you add a setting, add it to `user-secrets.template.json` (or `.env.local.example`) in the same pull request, so everyone else knows to load it. If live needs a different value, add it to [Going live](#going-live) as well.

### Going live

On your machine nothing needs a supplier account: S3Mock stands in for R2, email and texts go to the console (no SendGrid or Twilio keys), the CAPTCHA uses Cloudflare's test keys, and maps use OpenStreetMap's public tiles. These are what a deployed environment must change. Secrets are container secrets; everything else is a container setting (Terraform). Nothing needs a cloud-specific service such as Key Vault. Nested keys become environment variables with `__`, e.g. `Email__SendGrid__ApiKey`. The identity server's list is in its README.

**Outside Development the apps refuse to start** until every required setting below is set to a live value (no missing or empty keys, test keys, http addresses or `<...>` placeholders), listing everything that's missing at once. `--check-settings` runs the same check without starting: e.g. `dotnet BJK.Core.Api.dll --check-settings` with an environment's settings exits 1 and lists the problems. The deploy pipeline runs it before deploying.

**API and media worker** (they share their settings):

| Setting | Live value | Still needed |
|---|---|---|
| `ConnectionStrings:BadJockeysDatabase` (secret) | Azure SQL `badjockeys` with the API's own SQL login, `Encrypt=True` | The live server |
| `MediatR:LicenseKey` (secret) | The licence key | Get one |
| `Authentication:Authority` | The identity server, e.g. `https://auth.badjockeys.com` | The live domain |
| `Cors:AllowedOrigins` | The web app, e.g. `https://badjockeys.com` | The live domain |
| `ApiDocs:Enabled` | `false`, unless the API reference should be public | |
| `Email:SendGrid:ApiKey` (secret) | **Required**: a key with Mail Send only (without it emails are only logged) | A SendGrid account |
| `Email:FromAddress`, `Email:ReplyToAddress`, `Email:LogoUrl` | e.g. `no-reply@badjockeys.com` (verified domain), `support@badjockeys.com`, a PNG logo URL | Domain verified in SendGrid |
| `SMS:Twilio:AccountSid`, `ApiKeySid`, `ApiKeySecret` (secret), `MessagingServiceSid` | **Required**. An API key rather than the auth token; a Messaging Service rather than one number | A Twilio account; the UK sender ID registered |
| `Media:Storage:ServiceUrl` | `https://<account id>.r2.cloudflarestorage.com` | A Cloudflare account |
| `Media:Storage:AccessKeyId`, `SecretAccessKey` (secrets) | An R2 token with Object Read & Write on the live buckets only | A Cloudflare account |
| `Media:Storage:OriginalsBucket`, `PublicBucket`, `SensitiveBucket` | e.g. `bjk-live-originals` (CORS `PUT` from the web app, 90-day deletion rule), `bjk-live-public`, `bjk-live-sensitive` (private) | The buckets (Terraform) |
| `Media:Storage:VaultBucket` | e.g. `bjk-live-vault`: private, CORS `PUT` and `GET` from the web app, **no** deletion rule | The vault: people's originals for up to 3 years. Optional: without it the vault uses the sensitive bucket, which then needs the same CORS rule |
| `Media:Storage:PublicBaseUrl` | The public bucket's domain behind Cloudflare, e.g. `https://media.badjockeys.com/` | The domain |
| `Media:Processing:FfmpegPath`, `FfprobePath` | Paths in the worker image, e.g. `/usr/bin/ffmpeg` | |
| `Media:Redaction:FaceModelPath`, `PlateModelPath`, `PersonModelPath` | Paths to the three models in the worker image (set by its Dockerfile) | The models in the image |
| `Media:Redaction:ReviewEverything` | `true` at launch, so a moderator checks every upload | |
| `Media:SensitiveDetection:ModelPath` | **Required**: the CLIP model's path in the worker image (the image sets it) | |
| `Media:SensitiveDetection:Threshold`, `NudityThreshold` | Optional: 0.35 and 0.3; tune from the recorded scores | |
| `Media:KnownImages:Enabled` | Must not be `false` (on by default) | **IWF membership** for the real hash list (until then only moderators' hashes are checked) |
| IWF Hash List and URL List | Synced into SQL by the worker and API once an adapter is written against the IWF's API | **IWF membership**, and their API details and test credentials |
| `Captcha:TurnstileSecretKey` (secret) | The real Turnstile widget's secret | A Cloudflare account |
| `Screening:Endpoint` | Optional: a classifier service (e.g. Detoxify); without it the built-in keyword list only | Optional |
| `Reels:ViewerKeySecret` (secret) | A long random string (`openssl rand -base64 48`) | |
| `Plans:Overrides` | Empty | **Stripe billing** (not built yet) |
| `Notifications:AppUrl`, `Posts:AppUrl` | The web app, e.g. `https://badjockeys.com` | The live domain |
| `Notifications:Push:PublicKey`, `PrivateKey` (secret) | **Required**: a VAPID key pair made once per environment and never changed (changing it stops every phone's push subscription). Make one with `node -e "const k=require('crypto').generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});console.log(Buffer.concat([Buffer.from([4]),Buffer.from(k.x,'base64url'),Buffer.from(k.y,'base64url')]).toString('base64url'),k.d)"` (public key first) | |
| `Notifications:Push:Subject` | `mailto:support@badjockeys.com` (the default): who push services contact about problems | |
| `Posts:ReportsInbox` (from bjk-modules #30) | `support@badjockeys.com` (the default) | The mailbox must exist |
| `Heatmap:VehicleMinCellCount`, `Heatmap:ModelFilterMinSpanKm` | Optional: defaults 5 and 10 | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The Elastic Cloud project's managed OTLP endpoint (https) | **An Elastic Cloud Serverless Observability project** |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | |
| `OTEL_EXPORTER_OTLP_HEADERS` (secret) | `Authorization=ApiKey <key>`, an ingest-only API key from the project | **An Elastic Cloud Serverless Observability project** |

The API also needs outbound HTTPS to `api.postcodes.io` (place names; no key).

**Web app** (container settings; the names are the same as in `.env.local`):

| Setting | Live value | Still needed |
|---|---|---|
| `APP_URL` | e.g. `https://badjockeys.com` | The live domain |
| `API_BASE_URL` | e.g. `https://api.badjockeys.com` | The live domain |
| `IDSRV_AUTHORITY` | e.g. `https://auth.badjockeys.com` | The live domain |
| `IDSRV_CLIENT_SECRET` (secret) | The identity server's `Clients:Web:Secret` | |
| `AUTH_SECRET` (secret) | `openssl rand -base64 32`; changing it signs everyone out | |
| `IDSRV_ALLOW_HTTP` | `false` (never true outside the end-to-end tests) | |
| `TURNSTILE_SITE_KEY` | The real Turnstile widget's site key | A Cloudflare account |
| `MEDIA_ORIGINS`, `UPLOAD_ORIGINS` | The public media domain, and `https://<account id>.r2.cloudflarestorage.com` | A Cloudflare account |
| `MAP_TILE_URL`, `MAP_ATTRIBUTION` | A tile provider's URL and attribution (OpenStreetMap's public tiles aren't allowed for heavy use) | **A map tile provider** |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_EXPORTER_OTLP_HEADERS` (secret) | The same as the API's | **An Elastic Cloud Serverless Observability project** |

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
locally it uses the real head-turn check and stand-ins for Yoti that answer age 30 (`AgeAssurance` in the identity server's user secrets).

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
- **The right panel** (desktop) shows **Category trends**: each type of bad driving with a sparkline, its total and
  the change on the previous period (`GET /api/trends/categories`), with a date range picker (7 days, 30 days, 90 days,
  12 months, custom). The ranges follow the heat map's plan limits (Free and visitors: 7 days; Premium: 12 months;
  Premium +: 5 years), and Premium can narrow it to an area around a place. Signed-out answers are cached for five
  minutes.
- **Report to the police:** under your own post, a pop-up confirms where it happened (England or Wales, Scotland or
  Northern Ireland, guessed from the pin) and says where to send the footage: the National Dash Cam Safety Portal in
  England and Wales, or call 101 in Scotland and Northern Ireland. It asks for the original, unedited file (ours is
  blurred and silent) within 7 to 14 days. Nothing is sent or recorded by us. The composer no longer asks whether it
  was reported; older posts still show their answer.
- **Vault:** in Account, **Vault** (`/account/vault`; your profile's Vault tab links there) lists your original
  clips, laid out like Instagram's Saved screen: collections (**All clips**, **From your posts**, **Uploaded**; `?c=`)
  as tiles of four, each opening to a grid of three across, and a clip opens on its own to download, delete or
  **Post it** (`/post/new?vault={id}`: the composer fetches the clip and adds it as if you'd chosen it). Thumbnails are
  15-minute links from `GET /api/vault/previews`. At the top, **Save my posts' originals automatically** (on by
  default; `PUT /api/vault/settings`): off, a post's originals are deleted once it's published and clips already kept
  stay. You can also add clips you haven't posted (+, uploaded straight to the vault bucket,
  `POST /api/vault/uploads`). Free keeps clips 30 days in 2 GB, Premium 12 months in 25 GB, Premium + 3 years in
  100 GB. Only you can see it; the originals aren't blurred.
- **Sharing to other apps:** on your own video post, the ⋯ menu's **Download for TikTok, Reels and Shorts** asks the
  API for a vertical copy (`POST`/`GET /api/media/{id}/share-copy`; the media worker makes it from the blurred, silent
  video, with a watermark and end card), then offers the download and a caption to paste with the link back. Only the
  poster can download it; photos and sensitive posts can't. Post links shared anywhere show the video in the preview
  (`og:video`), except for sensitive posts.
- **Hashtags** in posts' titles and descriptions link to the tag's page (`/tag/m62`, from
  `GET /api/posts?hashtag=`). Typing `#` in the composer suggests tags, most used first (`GET /api/hashtags`). The
  right panel's **Trending** card lists the hashtags and towns with the most posts today against their usual level
  (`GET /api/trends`), and is hidden when nothing is trending.
- **New posts without reloading:** the first page of a feed (Home's tabs, categories, hashtags and profiles) checks
  for new posts every 30 seconds while the tab is open, and when the reader comes back to it. New ones show as an
  "N new posts" pill at the top instead of moving the feed; tapping it scrolls up and loads them. On phones, pulling
  down from the top does the same (the browser's own pull-to-refresh is off on those pages). Older posts load as you
  near the bottom.
- **Home timelines:** **For you** (`/`, ranked, boosted near your home area; visitors see only this), **Following**
  (`/following`) and your **custom timelines** (`/t/{id}`, made on `/timelines`: one or more types of bad driving,
  optionally near a place; Free 1, Premium 5, Premium + 10), as tabs at the top of Home. The old category tabs are
  gone; category pages (`/c/{slug}`) open from Category trends.
- **Following:** Follow buttons on profiles and in the right panel's **Who to follow** (adults who posted most in the last 90 days near your home area, or where you post, else across the UK);
- **Categories:** 13 groups (Parking, Speeding, Overtaking, ...) of 74 subcategories, each group with its own "Other"
  (signed off 23 Oct 2026; the list is `src/web/src/lib/categories.ts`, a copy of `IncidentTaxonomy` in
  BJK.Modules). A post has up to 3 subcategories, picked in the composer by searching ("pave" finds "Parked on the
  pavement") or by opening a group; the first is the main one, and its own vote ("Was the pavement blocked?") goes
  on the post. `/c/parking` is a whole group's feed and `/c/parked-on-the-pavement` one subcategory's. The heat map
  and timelines filter by whole groups or single subcategories.
- **Following:** Follow buttons on profiles and in the right panel's **Who to follow** (adults near your home area);
  profiles show follower and following counts, with lists at `/u/{handle}/followers` and `/following`. A post's ⋯
  menu can limit comments to people you follow. The optional mobile number lives on the identity server
  (Account → Mobile number).
- **Post analytics:** under your own post, **Analytics** opens graphs of views (and local views), reactions, comments
  and shares since posting: hour by hour for 48 hours, then day by day, then week by week after 90 days, with a table
  view. Premium and Premium + only; on Free the graphs are blurred with a link to Premium (the API sends no points).
- **Your cars:** Account → **Your cars** (`/account/cars`) keeps up to 5 household cars (make, model, colour and a
  nickname; never a registration). The post form's **Filmed from** picks one, and the post shows "Filmed from:
  Dave's Golf". Renaming a car renames it on its posts.
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

## Communities

Communities (`/communities` in the web app; `api/communities` in the Posts module) are groups around a place or a topic. To try them locally:

- **Start one** at `/communities/new`. Only Premium and Premium+ members can, up to 5 each. Your own account has Premium+ locally (see Example users and posts), or set a plan for another user through `Plans:Overrides`.
- **Public or private.** Anyone can read a public community and join straight away. A private one is ask-to-join: an admin or moderator approves the request under **Manage community → Requests**. Under-18s can join public communities only and can't run one.
- **Area.** An optional place and radius (5, 10, 15, 25 or 50 km). When a member posts something inside it, the post form recommends the community and ticks it; the post stays public either way.
- **Sharing posts:** when posting, or later from your own post's ⋯ menu (**Share to a community**). Only your own posts, into communities you've joined. It doesn't copy the post: it stays one public post, also listed in each community, with the same reactions and comments.
- **Inside:** posts shared into it, and text discussions with replies. Authors and the community's admins and moderators can remove them; anyone can report them.
- **Invitations:** admins and moderators invite people by @handle under **Manage community → Invited**. The invitee gets a notification and accepts or declines on the community's page (a private one too, if they're an adult).
- **Notifications:** a request to join goes to the community's admins and moderators, an approval to the person who asked, an invitation to the invitee, and a reply to the discussion's author. Each one opens the community page and can be turned off in the notification settings.
- **Example data:** six communities (see Example users and posts).

The e2e mock server (`src/web/e2e/mock-server.mjs`) seeds three communities, so the web tests cover joining, discussions and sharing from the post form.

## Online safety checks

What runs on your machine, and what doesn't. The setup prints the same summary at the end.

| Check | On your machine | Deployed |
|---|---|---|
| Face and number plate blurring | On (YuNet models, downloaded by the setup) | On |
| Nudity | On (CLIP model, downloaded by the setup). Scores at or above 0.3 hold the upload for a moderator | On |
| Graphic content (blood, injuries) | On (the same CLIP run). Scores at or above 0.35 mark it sensitive: shown blurred, queued for a moderator | On |
| Known illegal images | On, against **test entries only**: the hashes of `scripts/sql/safety-test/known-image-test.png` | Moderators' hashes; the **IWF Hash List** once we're members |
| Blocked web addresses | On, against **one test entry**: `blocked-url-test.example` | Moderators' entries; the **IWF URL List** once we're members |
| Threats, slurs and abuse in text | Built-in keyword list (the Detoxify classifier isn't run locally) | Keyword list, plus Detoxify if `Screening:Endpoint` is set |
| Personal details in text | On (plates, phone numbers, emails, street addresses, social handles) | On |
| Links in posts | On: web addresses in a post's title, description or place name are refused | On |
| No vehicle in the photos or video | On (the vehicle detector that blurs plate areas). A post where nothing shows a vehicle is held for a moderator | On |
| "Not about driving" and spam reports | On: 3 established members, or 1 Trusted reporter, hold the post for a moderator; 2 removals in 30 days pause posting for 7 days (`Safety:OffTopic`) | On |

**Nothing on your machine is ever checked against the real IWF lists**, and nothing needs to be kept up to date here: the lists live in SQL (`media.KnownImageHashes`, `posts.BlockedUrls`) and, when deployed, a sync job fetches each provider's list over its API every 6 hours. Locally the only entries are the `Test` rows the setup adds.

**Try it.**

- **Known image:** post `scripts/sql/safety-test/known-image-test.png` (a yellow and black "TEST IMAGE" card; it's harmless). The upload fails with "This file can't be posted.", nothing is published, and the match appears in `badjockeys.media.KnownImageMatches` (and `GET /api/admin/known-images/matches` as an admin). A resized or re-saved copy is caught too, by its perceptual hash. Uploads are checked by the media worker, so it must be running.
- **Blocked address:** write a post or comment containing `blocked-url-test.example/anything`. It's held for review (only you see it) with the label `blocked_url`.
- **Nudity and graphic content:** the scores of every upload are in `badjockeys.media.Media` (`NudityScore`, `SensitiveScore`). Don't test with real explicit or gory pictures; ordinary dashcam footage should score near 0.
- **No vehicle:** post a photo with no vehicle in it (a picture of a room or a pet). Once it's processed, the post shows "A moderator is checking your post" and is in the held queue with the label `no_vehicle`. `VehicleFrames` in `badjockeys.media.Media` is 0 for it (null if vehicle detection was off).
- **Links:** a post titled "Cheap dashcams at dashcams.shop" is refused with "Links can't be included in posts". The post form says so before sending.
- **Re-add the test entries** (for example after resetting the database): `node scripts/sql/safety-test/seed.mjs`.

**IWF test environment.** The IWF doesn't publish a public sandbox for its lists. When we join, ask them for test credentials and a test feed (or a set of test hashes and URLs) for DEV and QA, so the first real sync isn't in production. The code is ready for that: each list is a "source" with its own sync, and DEV and QA can point at the test feed while production uses the live one. Until then, DEV and QA use the same `Test` entries as your machine.

If you change `known-image-test.png`, update the two hashes in `scripts/sql/safety-test/seed.mjs`: the SHA-256 (`shasum -a 256`) and the PDQ hash (upload the new picture and read `PerceptualHashes` for it in `badjockeys.media.Media`).

## AI suggestions (removed)

The owner removed every AI suggestion on 22 Oct 2026, for good: "Suggest a description", the "Looks like: ..." type chips and the trim screen's suggested 30 seconds. The trim screen starts on the first 30 seconds. The setup removes their old settings (`Media:Describe`, `Posts:TypeSuggestions`, `Queues:MediaDescriptions`) from your user secrets, and Ollama is no longer used. CLIP stays in the media worker for the nudity and graphic content checks.

## Example users and posts

The setup fills a fresh install with example data, so the feed, map and notifications have something in them. Each run replaces it. To refresh it without the rest of the setup, run `node scripts/sql/example-data/seed.mjs` from bjk-core. That needs SQL Server and S3Mock running, and the identity server and API to have started once.

It adds 108 example members and 300 posts across the UK, mostly around Merseyside, Manchester, Leeds and London. It takes about a minute: the first run also makes six short placeholder clips with ffmpeg (kept in `.local/example-videos`).

- **Posts:** every category, with vehicle details, and enough posts close together for the heat map. About half have photos (2 to 6 placeholder dashcam frames marked "Example clip") and the rest have one 8-second placeholder clip, so Reels has plenty in it. That follows the posting rule: up to 10 photos or one video.
- **Activity:** reactions on posts and comments (Like, Heart, Angry, Shocked), comments and replies (every member has written both), "Who's at fault?" and "How bad was it?" votes, followed posts, bookmarks, follows between members, views (some local, some from signed-out visitors) and shares.
- **Posts:** most subcategories (made from `taxonomy.mjs`, the same list as the app's), with vehicle details, and enough posts close together for the heat map. About half have photos (2 to 6 placeholder dashcam frames marked "Example clip") and the rest have one 8-second placeholder clip, so Reels has plenty in it. That follows the posting rule: up to 10 photos or one video.
- **Activity:** reactions on posts and comments (Like, Angry, Shocked, Laugh), comments and replies (every member has written both), votes (each post's own question, from its main subcategory), followed posts, bookmarks, follows between members, views (some local, some from signed-out visitors) and shares.
- **Members:** home areas (so local views and area alerts work), badges (all founding members, 8 trusted reporters, 18 local regulars), and a few with their own vote closing time. Some votes have closed, and the ones that closed in the last day get their results sent the first time the API's VoteResults job runs, so a few "Voting has closed" notifications turn up.
- **Sign in as an example member:** for example `dave@example.test` (@dashcam_dave) or `priya@example.test` (@pedal_power_priya), password `BadJockeys!2026`. The generated members are `<handle>@example.test`; the seed prints the first few, and `SELECT Email FROM idsrv.auth.AspNetUsers WHERE Id LIKE 'e0000000%'` lists them all. They're all adults who have passed the age check, with confirmed emails.
- **Your own account** (`aaron.greenhalgh@badjockey.com`; change `OWNER_EMAIL` in `scripts/sql/example-data/data.mjs`) gets Premium+ through `Plans:Overrides` in the API's user secrets. Once it has a profile, Dashcam Dave tags it as a passenger on one post (you'll see it under **Approve tags** and in the bell), it follows the hand-written members and a few more, and about 20 members follow it. If you sign up after the setup, run the setup again.
- **Communities:** Knowsley Road Watch, Manchester Road Watch and London Riders (public, with an area), Leeds School Run (private, with requests waiting), Cyclists UK (a public topic) and HGV Drivers (a private topic), each run by a hand-written member, with members from inside their area, posts shared into them, discussions and replies. Your own account is a moderator of Leeds School Run, so **Manage community → Requests** has people waiting. If you've already made a community with one of those names locally, the example one's address gets `-example` on the end.
- **Your own account** (`aaron.greenhalgh@badjockey.com`; change `OWNER_EMAIL` in `scripts/sql/example-data/data.mjs`) gets Premium+ through `Plans:Overrides` in the API's user secrets. Once it has a profile, Dashcam Dave tags it as a passenger on one post (you'll see it under **Approve tags** and in the bell), it follows the hand-written members and a few more, and about 20 members follow it, so tagging a passenger shows them first as you type (try `Da` for Dashcam Dave). If you sign up after the setup, run the setup again.
- **What it touches:** only rows whose ids start `e0000000`, and what other people did to them.
- **Changing it:** the hand-written members and posts are in `data.mjs`; `generate.mjs` grows them into the full set from a fixed random seed, so every run makes exactly the same data. `build-sql.mjs` turns that into SQL, which `seed.mjs` runs. To run the SQL by hand instead, write it to `seed.sql` (not committed) with `node scripts/sql/example-data/build-sql.mjs`.
- **CI** applies the example data twice to its own database and checks the row counts (`pipelines/scripts/example-data-check.sh`), so a schema change that would break it fails there.

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

The counts-only `reporting` views behind the reports are kept and applied locally; there's no local report viewer (Grafana was removed on 21 Oct 2026). When deployed, **Power BI** reads them (Live only, after launch).

- **Counts only.** The views in the `reporting` schema of each database (`scripts/sql/reporting/idsrv.sql` and `badjockeys.sql`) count and group. They never return emails, names, handles, ids, dates of birth or report details. Place names are the public ones shown on posts.
- **Read-only login.** Reports sign in as `bjk_reporting`, which can read those views and nothing else, not even the tables behind them. Locally its password is `BJK_REPORTING_PASSWORD` in `bjk-core/.env`; the setup creates it. To look at a view, connect your SQL tool as `bjk_reporting` (or `sa`) and `SELECT * FROM reporting.<Name>`.
- **After pulling changes to the views**, or if the setup couldn't apply them (the identity server and API must each have started once, so both databases exist): `node scripts/sql/reporting/apply.mjs`.
- **Adding a report:** add or change a view in the matching `scripts/sql/reporting/*.sql` (counts only, `CREATE OR ALTER VIEW reporting.<Name>`) and apply it. CI applies every view twice and checks `bjk_reporting` can read each one but not the tables.
- **Incidents (23 Oct 2026).** `reporting.Incidents` is a live view with one row per live incident and subcategory. It has the UK date, hour and weekday, a square of about 1 km, the public place name, the group and subcategory, the vehicle, after dark, reported to police, video or photo, and its reaction, comment and view counts. It has no ids, authors, text or exact pins.
  - **Counting:** count incidents with `WHERE IsMainType = 1`, since each incident has exactly one main subcategory; count all rows to count by subcategory.
  - **Lookup:** `reporting.Subcategories` is a view listing the 74 subcategories and 13 groups with their names (written into the view, so `reporting` holds views only). When `IncidentTaxonomy` in BJK.Modules changes, regenerate its list.
  - **Who reads it:** Ask Bad Jockeys, the AI chat, reads these two through `bjk_chat`, which can read nothing else. Locally its password is `BJK_CHAT_PASSWORD` in `bjk-core/.env`. The reports can read them too.
  - **If it gets slow** (lots of posts, lots of chat questions), it can become a table refreshed on a schedule, with the same name and columns, so the chat needs no change.
  - **CI checks** there are 74 subcategories, that every live post appears with exactly one main subcategory, and that `bjk_chat` can't read anything else.
- `reporting.PostsByType` counts every subcategory on a post, not just the main one, and `reporting.IncidentTimes` is in UK time (both fixed 23 Oct 2026).

## Logs, traces and metrics

The identity server, the API, the media worker and the web app's server send their logs, traces and metrics through **OpenTelemetry** to **Elastic**. Locally that's three containers in the `bad-jockeys` Docker group, all version 9.5.5 on Elastic's free licence:

| Container | What it does | Address |
|---|---|---|
| `otel-collector` | Elastic's OpenTelemetry collector (EDOT): receives from the apps and writes to Elasticsearch, adding the service summaries Kibana shows (`src/observability/edot-collector.yml`) | OTLP on `localhost:4317` (gRPC) and `4318` (HTTP) |
| `elasticsearch` | Stores everything, in the `elastic-data` volume, so it survives restarts | http://localhost:9200 |
| `kibana` | Search and charts | **http://localhost:5601** |

The apps find the collector through `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` (the .NET apps' `launchSettings.json`, the web app's `.env.local`). Sign in to Kibana as **`elastic`** with `BJK_ELASTIC_PASSWORD` from `bjk-core/.env`; the setup creates it, along with `BJK_KIBANA_SYSTEM_PASSWORD` (the `kibana_system` user the Kibana server uses behind the scenes; you never sign in with it) and `BJK_KIBANA_ENCRYPTION_KEY` (for saved alert rules). An older `.env` gets them (and has `BJK_KIBANA_PASSWORD` renamed to `BJK_KIBANA_SYSTEM_PASSWORD`) the next time you run the setup or press F5. Never change them afterwards: Elasticsearch keeps the password it first started with. If you must, `docker compose down` and `docker volume rm bad-jockeys_elastic-data bad-jockeys_kibana-data` first (this deletes the stored logs).

F5 ("Bad Jockeys") and the task "Run Bad Jockeys" start the apps as soon as SQL Server is ready, start the Elastic containers alongside (Kibana takes a minute or two the first time; progress in `.local/elastic-start.log`), and open Kibana when it answers. Elasticsearch needs about 1.5 GB of memory and Kibana about 1 GB, so give Docker Desktop at least 6 GB.

In Kibana:

- **Observability → Applications → Service inventory:** each app (`bjk-identity-server`, `bjk-core-api`, `bjk-media-worker`, `bjk-web`) with throughput, latency and error rate; open one for its slowest endpoints, errors and individual traces (a request's path through the app, its SQL calls and outgoing calls, with timings).
- **Discover** (or **Observability → Logs**): search any app's logs, e.g. `service.name : "bjk-core-api" and severity_text : "Error"`. A log line's trace id links to its trace.
- **Observability → Alerts → Manage rules:** alert rules, e.g. error rate or failed jobs. The free licence only offers the server log and index connectors locally; email and Teams alerts are set up in Elastic Cloud.

Logs never contain emails, names or IP addresses, URLs' query string values are redacted, and SQL text isn't recorded. Apps started by the setup, or without `OTEL_EXPORTER_OTLP_ENDPOINT`, send nothing.

When deployed, there's no collector of ours: the apps send straight to **Elastic Cloud**'s managed OTLP endpoint (Serverless Observability). Only `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL` (`http/protobuf`) and `OTEL_EXPORTER_OTLP_HEADERS` (`Authorization=ApiKey <key>`, a secret) change, and outside Development the .NET apps refuse to start without an https address. Alerts there notify by email or Teams.

## Database changes

The apps apply schema changes when they start. A migration that would drop a table, column or schema, or delete rows, **stops the app from starting** and lists what it would remove. To run one deliberately, review it, then set `Database:AllowDestructiveMigrations` to `true` for that one run.

Module tables and migrations live in **bjk-modules**. The API picks up a change when you move it to a newer `BJK.Modules.*` package version in `Directory.Packages.props`. Every push to a bjk-modules feature branch publishes a preview version (`0.x.y-ci.<run>`), so you can test a change before it's merged.

To start from empty databases (this also empties the local file storage):

```bash
cd ~/Git/GitHub/badjockeys/bjk-core && docker compose down -v && docker compose up -d --wait
```

## Troubleshooting

- **`NU1301` or `401 Unauthorized` on restore.** The NuGet token isn't set in this terminal, or has expired (step 3). Check with `echo $NuGetPackageSourceCredentials_badjockeys`.
- **`Connection string '...' is not configured` or `The ... field is required`.** Your user secrets are missing (run the setup; step 6), or the app isn't running in Development. The `https` launch profile sets Development.
- **`Login failed for user 'sa'`.** The password in your user secret doesn't match `bjk-core/.env`. If you changed `.env` after the container was first created, SQL Server still has the old password: in bjk-core run `docker compose down -v` (this deletes local data), then `docker compose up -d --wait`.
- **`A network-related or instance-specific error`.** SQL Server isn't running or isn't healthy yet. Run `docker ps`, then `docker compose logs sql` in bjk-core.
- **A job or event doesn't arrive.** Look in the queue tables (`SELECT * FROM [messaging].[media.process]`) and their `.failed` tables; [messaging.md](messaging.md) shows how to read why a message was dead-lettered.
- **Photos fail with `Encoder not found` (`image.webp`).** Your ffmpeg has no WebP encoder: Homebrew's plain `ffmpeg` doesn't. Run the setup again; it installs `ffmpeg-full` and points your user secrets at it. Then restart the media worker.
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

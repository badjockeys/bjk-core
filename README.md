# bjk-core

The Bad Jockeys web app (Next.js) and API host (ASP.NET Core), built as two containers from this repo, plus the Terraform and deploy pipelines.

| Folder | Holds |
|---|---|
| `src/BJK.Core.Api` | The API host. It registers the `BJK.Modules.*` packages from bjk-modules at startup. |
| `src/web` | The Next.js web app |
| `infra/terraform/azure` | Infrastructure as code |
| `pipelines` | Build and deploy scripts used by `.github/workflows` |
| `scripts/setup/setup.ps1`, `scripts/setup/setup.sh` | Complete local setup on Windows or a Mac: tools, GitHub sign-in, repos, then `scripts/setup-local.mjs` |
| `scripts` | `setup-local.mjs`: the project part of the local setup (config, Docker, secrets, models, build) |
| `docs` | Guides. Start with [docs/local-development.md](docs/local-development.md). |

## Running it locally

One script installs the tools and sets everything up on a new computer: `powershell -ExecutionPolicy Bypass -File scripts\setup\setup.ps1` on Windows, `bash scripts/setup/setup.sh` on a Mac. Then, in the VS Code workspace it opens (`badjockeys.code-workspace`), run the task **"Run Bad Jockeys"**. The [local development guide](docs/local-development.md) has the details.

## The API

`src/BJK.Core.Api` hosts the Media, Profiles, Posts, Email and SMS modules. It accepts access tokens from bjk-identity-server for the `bjk-api` audience, and creates and migrates its database (`badjockeys`) on start. Run it with `dotnet run --project src/BJK.Core.Api --launch-profile https` after loading your user secrets (see the guide). Then https://localhost:5101/health should return `Healthy`, and `src/BJK.Core.Api/BJK.Core.Api.http` has example requests.

`src/BJK.Core.MediaWorker` is the media processing worker. It takes jobs off the `media.process` queue, blurs faces and number plates, converts each upload with ffmpeg (720p H.264 video, or WebP photos up to 2048 pixels, plus a thumbnail, with metadata such as GPS stripped), and publishes the results. Its image includes the blurring models. It needs ffmpeg installed and shares the API's user secrets. Run it with `dotnet run --project src/BJK.Core.MediaWorker --launch-profile worker`.

On your machine, SQL Server and file storage (S3Mock, standing in for Cloudflare R2, so no Cloudflare account is needed) run in Docker from this repo's `docker-compose.yml`, as one group called `bad-jockeys` (`docker compose up -d --wait`).

Jobs and events between the API, the media workers and the identity server go through durable queues stored in SQL Server (the `messaging` schema of `badjockeys`), not a separate broker: see [docs/messaging.md](docs/messaging.md), which also has the media worker's scaling rule.

## The web app

`src/web` is the Next.js web app (App Router, React Server Components, TypeScript). It renders pages on its own
server, so shared links get previews and search engines can read posts, and it talks to the API from that server: the
browser never sees access tokens. Sign-in, sign-up, the age check and account security are the identity server's own
pages; the web app redirects there (OpenID Connect with PKCE, client `bjk-web`) and keeps the tokens in an encrypted,
httpOnly session cookie. Photos and videos upload straight from the browser to storage with signed links, and videos
are trimmed to 30 seconds and shrunk to 720p in the browser first.

Pages beyond the feed and posts:

- **Reels** (`/reels`, screens 27 and 29): a full-screen vertical feed of video posts (swipe, scroll or the arrow keys).
  The reel in view plays muted and loops, and after 3 seconds it's reported as played (`POST /api/reels/{id}/play`).
  Daily allowance: 10 logged out, 25 on Free, unlimited on Premium; the counter shows "N of 25 free today" and the last
  slide is the daily-limit sheet (Premium £19.99/year or £2.49/month; "Get Premium" goes to `/premium`, which says
  subscriptions are coming soon). Logged-out viewers are counted by a random id in a signed, httpOnly cookie
  (`bjk_viewer`, set by `src/proxy.ts`, signed with `AUTH_SECRET`), sent to the API as `X-Viewer-Id`.
- **Incident map** (`/map`, screen 28, members only): Leaflet with the API's grid cells drawn as squares shaded from
  #E6F7FC to #00B5E5 to #00607F, filters (category, period, time of day, weekdays/weekends; locked with a "Premium"
  label on the Free plan, which shows the last 7 days) and the figures for a tapped area. Tiles come from
  `MAP_TILE_URL` (OpenStreetMap's public tiles by default, with attribution). **Heavy production use needs a tile
  provider**: OpenStreetMap's tile usage policy doesn't allow it, so choose one (e.g. a paid OSM-based provider) and set
  `MAP_TILE_URL` and `MAP_ATTRIBUTION`.
- **Sensitive posts** (bjk-modules #17): everyone gets them, but until a member has verified their age the media is a
  blurred preview with "Sensitive content — Injuries or a serious crash" and "Verify your age to view" (the identity
  server's age check, then back to the same page) or, logged out, "Sign in to view". Authors see their own. Signed links
  to the real files expire after about 10 minutes (`linksExpireAt`), so pages fetch fresh ones shortly before. Feeds
  show photos' 1080 px copy (`feedUrl`); the full image opens on tap.

Run it with `npm run dev` in `src/web` after copying `.env.local.example` to `.env.local` (see the guide, step 8).
`npm run lint`, `npm run typecheck`, `npm test` (Vitest) and `npm run e2e` (Playwright, against a mock identity
server and API in `e2e/mock-server.mjs`) are the checks CI runs. `src/web/Dockerfile` builds the container
(`docker build -t bjk-core-web src/web`).

CI builds the API, worker and web container images, runs `pipelines/scripts/smoke-test.sh` and runs the web app's checks and end-to-end tests on every pull request. The smoke test runs against SQL Server and S3Mock (in place of Cloudflare R2), with `pipelines/scripts/fake-issuer.py` signing tokens in place of the identity server.


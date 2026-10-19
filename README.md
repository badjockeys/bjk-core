# bjk-core

The Bad Jockeys web app (Next.js) and API host (ASP.NET Core), built as two containers from this repo, plus the Terraform and deploy pipelines.

| Folder | Holds |
|---|---|
| `src/BJK.Core.Api` | The API host. It registers the `BJK.Modules.*` packages from bjk-modules at startup. |
| `src/web` | The Next.js web app |
| `infra/terraform/azure` | Infrastructure as code |
| `pipelines` | Build and deploy scripts used by `.github/workflows` |
| `docs` | Guides. Start with [docs/local-development.md](docs/local-development.md). |

## The API

`src/BJK.Core.Api` hosts the Media, Profiles, Posts, Email and SMS modules. It accepts access tokens from bjk-identity-server for the `bjk-api` audience, and creates and migrates its database (`badjockeys`) on start. Run it with `dotnet run --project src/BJK.Core.Api --launch-profile https` after loading your user secrets (see the guide). Then https://localhost:5101/health should return `Healthy`, and `src/BJK.Core.Api/BJK.Core.Api.http` has example requests.

`src/BJK.Core.MediaWorker` is the media processing worker. It takes jobs off the `media.process` queue, blurs faces and number plates, converts each upload with ffmpeg (720p H.264 video, or WebP photos up to 2048 pixels, plus a thumbnail, with metadata such as GPS stripped), and publishes the results. Its image includes the blurring models. It needs ffmpeg installed and shares the API's user secrets. Run it with `dotnet run --project src/BJK.Core.MediaWorker --launch-profile worker`.

On your machine, file storage is S3Mock in Docker (`docker compose up -d`), standing in for Cloudflare R2, so no Cloudflare account is needed.

Jobs and events between the API, the media workers and the identity server go through durable queues stored in SQL Server (the `messaging` schema of `badjockeys`), not a separate broker: see [docs/messaging.md](docs/messaging.md), which also has the media worker's scaling rule.

## The web app

`src/web` is the Next.js web app (App Router, React Server Components, TypeScript). It renders pages on its own
server, so shared links get previews and search engines can read posts, and it talks to the API from that server: the
browser never sees access tokens. Sign-in, sign-up, the age check and account security are the identity server's own
pages; the web app redirects there (OpenID Connect with PKCE, client `bjk-web`) and keeps the tokens in an encrypted,
httpOnly session cookie. Photos and videos upload straight from the browser to storage with signed links, and videos
are trimmed to 30 seconds and shrunk to 720p in the browser first.

Run it with `npm run dev` in `src/web` after copying `.env.local.example` to `.env.local` (see the guide, step 8).
`npm run lint`, `npm run typecheck`, `npm test` (Vitest) and `npm run e2e` (Playwright, against a mock identity
server and API in `e2e/mock-server.mjs`) are the checks CI runs. `src/web/Dockerfile` builds the container
(`docker build -t bjk-core-web src/web`).

CI builds the API, worker and web container images, runs `pipelines/scripts/smoke-test.sh` and runs the web app's checks and end-to-end tests on every pull request. The smoke test runs against SQL Server and S3Mock (in place of Cloudflare R2), with `pipelines/scripts/fake-issuer.py` signing tokens in place of the identity server.


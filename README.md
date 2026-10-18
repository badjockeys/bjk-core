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

CI builds the container image and runs `pipelines/scripts/smoke-test.sh` on every pull request. The test runs against SQL Server, RabbitMQ and MinIO (in place of Cloudflare R2), with `pipelines/scripts/fake-issuer.py` signing tokens in place of the identity server.


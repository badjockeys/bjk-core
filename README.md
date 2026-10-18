# bjk-core

The Bad Jockeys web app (Next.js) and API host (ASP.NET Core), built as two containers from this repo, plus the Terraform and deploy pipelines.

| Folder | Holds |
|---|---|
| `src/BJK.Core.Api` | The API host. It registers the `BJK.Modules.*` packages from bjk-modules at startup. |
| `src/web` | The Next.js web app |
| `infra/terraform/azure` | Infrastructure as code |
| `pipelines` | Build and deploy scripts used by `.github/workflows` |
| `docs` | Guides. Start with [docs/local-development.md](docs/local-development.md). |

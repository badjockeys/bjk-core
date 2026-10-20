# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f src/BJK.Core.Api/Dockerfile --secret id=nuget,env=NuGetPackageSourceCredentials_badjockeys -t bjk-core-api .
# The secret is the same "Username=...;Password=<token with read:packages>" value developers use (docs/local-development.md).
# It's only mounted for the restore step and never stored in the image.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo
COPY global.json nuget.config Directory.Build.props Directory.Packages.props ./
COPY src/BJK.Core.Api/BJK.Core.Api.csproj src/BJK.Core.Api/
RUN --mount=type=secret,id=nuget,env=NuGetPackageSourceCredentials_badjockeys \
    dotnet restore src/BJK.Core.Api/BJK.Core.Api.csproj
COPY src/BJK.Core.Api/ src/BJK.Core.Api/
RUN dotnet publish src/BJK.Core.Api/BJK.Core.Api.csproj --configuration Release --no-restore --output /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
# Settings come from environment variables (Container Apps secrets in Azure), never from files in the image.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "BJK.Core.Api.dll"]

# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f src/BJK.Core.MediaWorker/Dockerfile --secret id=nuget,env=NuGetPackageSourceCredentials_badjockeys -t bjk-core-media-worker .
# The secret is only mounted for the restore step and never stored in the image (see the API's Dockerfile).

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo
COPY global.json nuget.config Directory.Build.props Directory.Packages.props ./
COPY src/BJK.Core.MediaWorker/BJK.Core.MediaWorker.csproj src/BJK.Core.MediaWorker/
RUN --mount=type=secret,id=nuget,env=NuGetPackageSourceCredentials_badjockeys \
    dotnet restore src/BJK.Core.MediaWorker/BJK.Core.MediaWorker.csproj
COPY src/BJK.Core.MediaWorker/ src/BJK.Core.MediaWorker/
RUN dotnet publish src/BJK.Core.MediaWorker/BJK.Core.MediaWorker.csproj --configuration Release --no-restore --output /app
# The face and number plate detection models for automatic blurring and the CLIP model for the nudity and graphic
# content check (pinned, SHA-256 checked; MIT and Apache 2.0).
COPY pipelines/scripts/download-redaction-models.sh /tmp/
RUN sh /tmp/download-redaction-models.sh /opt/bjk/models

FROM mcr.microsoft.com/dotnet/runtime:10.0
# ffmpeg and ffprobe do the conversions. Debian's build includes libx264 (video) and libwebp (photos).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app ./
COPY --from=build /opt/bjk/models /opt/bjk/models
ENV Media__Redaction__FaceModelPath=/opt/bjk/models/face_detection_yunet_2026may.onnx \
    Media__Redaction__PlateModelPath=/opt/bjk/models/license_plate_detection_lpd_yunet_2023mar.onnx \
    Media__SensitiveDetection__ModelPath=/opt/bjk/models/clip-vit-b32-vision-quantized.onnx
# Settings come from environment variables (Container Apps secrets in Azure), never from files in the image.
USER $APP_UID
ENTRYPOINT ["dotnet", "BJK.Core.MediaWorker.dll"]

#!/usr/bin/env bash
# End-to-end smoke test for the API host, run by CI against real SQL Server (which also holds the message queues,
# schema messaging) and S3Mock (standing in for Cloudflare R2), with fake-issuer.py standing in for bjk-identity-server.
#
# Also runs the media worker (src/BJK.Core.MediaWorker) with real ffmpeg and the blurring models, so uploads are
# processed for real.
#
# Covers: startup migrations; token validation (issuer, audience, expiry, token type, scopes); profiles; uploads to
# object storage; the processing queue; posts, reactions, comments and reports; moderation rights; data export; the
# user lifecycle events from the identity server (deactivate, reactivate, delete); reels (daily limits by plan) and the
# incident heat map (suppression, entitlements); and a restart.
set -euo pipefail

PROJECT=${PROJECT:-src/BJK.Core.Api}
WORKER_PROJECT=${WORKER_PROJECT:-src/BJK.Core.MediaWorker}
WORKER_LOG=${WORKER_LOG:-worker.log}
PUBLIC_BUCKET=${Media__Storage__PublicBucket:-bjk-ci-public}
BASE_URL=${BASE_URL:-http://localhost:5100}
ISSUER_URL=${ISSUER_URL:-http://localhost:5999}
APP_LOG=${APP_LOG:-app.log}
S3_ENDPOINT=${S3_ENDPOINT:-http://localhost:9090}
ORIGINALS_BUCKET=${Media__Storage__OriginalsBucket:-bjk-ci-originals}

APP_PID=""
WORKER_PID=""
PASSED=()
: > "$APP_LOG"
: > "$WORKER_LOG"

# ---------- helpers ----------

fail() { echo "::error::$1"; exit 1; }

on_exit() {
  local status=$?
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; fi
  if [ -n "$WORKER_PID" ]; then kill "$WORKER_PID" 2>/dev/null || true; fi
  if [ $status -ne 0 ]; then
    echo "::error title=App log (last 40 lines)::$(tail -40 "$APP_LOG" | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
    echo "::error title=Worker log (last 40 lines)::$(tail -40 "$WORKER_LOG" | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
  fi
}
trap on_exit EXIT

start_app() {
  env "$@" dotnet run --project "$PROJECT" --configuration Release --no-build --no-launch-profile >> "$APP_LOG" 2>&1 &
  APP_PID=$!
  for _ in $(seq 1 60); do
    if curl -fs "$BASE_URL/health" > /dev/null 2>&1; then echo "ok  app is healthy"; return; fi
    kill -0 "$APP_PID" 2>/dev/null || fail "The app exited during startup."
    sleep 2
  done
  fail "The app didn't become healthy within 2 minutes."
}

stop_app() {
  kill "$APP_PID"
  wait "$APP_PID" 2>/dev/null || true
  APP_PID=""
}

start_worker() {
  DOTNET_ENVIRONMENT=Development dotnet run --project "$WORKER_PROJECT" --configuration Release --no-build --no-launch-profile >> "$WORKER_LOG" 2>&1 &
  WORKER_PID=$!
  sleep 5
  kill -0 "$WORKER_PID" 2>/dev/null || fail "The media worker exited during startup."
  echo "ok  media worker is running"
}

stop_worker() {
  kill "$WORKER_PID"
  wait "$WORKER_PID" 2>/dev/null || true
  WORKER_PID=""
}

pass() { echo "ok  $1"; PASSED+=("$1"); }

# token JSON  -> prints an access token from the stand-in issuer
token() { curl -fs -X POST "$ISSUER_URL/token" -d "$1" | jq -r .access_token; }

# request METHOD PATH [JSON_BODY] [BEARER_TOKEN]  -> sets STATUS and RESPONSE
request() {
  local method=$1 path=$2 body=${3:-} bearer=${4:-}
  local args=(-s -o response.json -w '%{http_code}' -X "$method" "$BASE_URL$path")
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  if [ -n "$bearer" ]; then args+=(-H "Authorization: Bearer $bearer"); fi
  STATUS=$(curl "${args[@]}")
  RESPONSE=$(cat response.json)
}

expect() {
  local expected=$1 label=$2
  [ "$STATUS" = "$expected" ] || fail "$label: expected HTTP $expected, got $STATUS. Response: $RESPONSE"
  pass "$label ($STATUS)"
}

json() { jq -r "$1" <<< "$RESPONSE"; }

body() { jq -cn "$@"; }

sql() {
  docker exec "$SQL_CONTAINER" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SQL_PASSWORD" -C \
    -d badjockeys -h -1 -W -Q "SET NOCOUNT ON; $1" | tr -d '\r' | sed '/^$/d'
}

expect_sql() {
  local query=$1 expected=$2 label=$3 actual
  actual=$(sql "$query" | head -1)
  [ "$actual" = "$expected" ] || fail "$label: expected $expected, got $actual"
  pass "$label ($actual)"
}

# wait_for COMMAND EXPECTED LABEL  - polls for up to 60 seconds (for background work)
wait_for() {
  local command=$1 expected=$2 label=$3 actual=""
  for _ in $(seq 1 30); do
    actual=$(eval "$command" 2>/dev/null | head -1 || true)
    if [ "$actual" = "$expected" ]; then pass "$label ($actual)"; return; fi
    sleep 2
  done
  fail "$label: expected $expected, last saw '$actual'."
}

# queue_messages QUEUE  - messages in a queue table (waiting, being worked on, or waiting for a retry)
queue_messages() { sql "SELECT CASE WHEN OBJECT_ID('[messaging].[$1]') IS NULL THEN -1 ELSE (SELECT COUNT(*) FROM [messaging].[$1]) END"; }

# user_event TYPE USER_ID  - publishes a user lifecycle event as the identity server does: a row (Rebus's JSON headers,
# the event as JSON) in every queue subscribed to the bjk.users topic
user_event() {
  local id payload headers queues
  id=$(cat /proc/sys/kernel/random/uuid)
  payload=$(body --arg id "$id" --arg user "$2" --arg type "$1" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{eventId: $id, userId: $user, type: $type, occurredAt: $at}')
  headers=$(body --arg id "$id" '{"rbs2-msg-id": $id, "rbs2-msg-type": "UserLifecycleEvent", "rbs2-content-type": "application/json;charset=utf-8", "rbs2-intent": "pub"}')
  queues=$(sql "SELECT [address] FROM [messaging].[subscriptions] WHERE [topic] = 'bjk.users'")
  [ -n "$queues" ] || fail "Nothing subscribes to bjk.users, so the $1 event would go nowhere."
  while read -r queue; do
    sql "INSERT INTO $queue ([headers], [body], [priority], [visible], [expiration])
         VALUES (CAST('$headers' AS varbinary(max)), CAST('$payload' AS varbinary(max)), 0, SYSDATETIMEOFFSET(), DATEADD(year, 1, SYSDATETIMEOFFSET()))" > /dev/null
  done <<< "$queues"
}

s3() { aws --endpoint-url "$S3_ENDPOINT" s3api "$@"; }

USER_A=$(cat /proc/sys/kernel/random/uuid)
USER_B=$(cat /proc/sys/kernel/random/uuid)
MODERATOR=$(cat /proc/sys/kernel/random/uuid)
USER_PLUS=$(cat /proc/sys/kernel/random/uuid)   # Premium + through Plans:Overrides (billing isn't built yet)
ALL_SCOPES='["bjk.media", "bjk.profiles", "bjk.posts"]'

# ---------- first start: databases and schemas are created ----------

# One free reel a day for logged-out viewers, so the daily limit is reached with the one video in this test.
start_app Reels__DailyPlays__Anonymous=1 "Plans__Overrides__$USER_PLUS=premium_plus"
for context in MediaDbContext ProfilesDbContext PostsDbContext; do
  grep -q "$context: applying migrations" "$APP_LOG" || fail "Expected $context to apply its migrations on first start."
done
pass "media, profiles and posts schemas created on first start"
expect_sql "SELECT COUNT(*) FROM sys.schemas WHERE name IN ('media', 'profiles', 'posts')" 3 "three module schemas in badjockeys"
wait_for "grep -c \"Reading the 'bjk-core.user-events' queue\" $APP_LOG" 1 "reading the user lifecycle events queue"
wait_for "grep -c \"Reading the 'bjk-core.media-events' queue\" $APP_LOG" 1 "reading the media events queue"
expect_sql "SELECT COUNT(*) FROM [messaging].[subscriptions] WHERE [topic] IN ('bjk.users', 'bjk.media')" 2 "the API's queues subscribe to bjk.users and bjk.media"
expect_sql "SELECT COUNT(*) FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name = 'messaging' AND t.name IN ('bjk-core.user-events', 'bjk-core.user-events.failed', 'bjk-core.media-events', 'bjk-core.media-events.failed')" 4 "queue and dead-letter tables created in the messaging schema"

# ---------- who may call ----------

request GET /api/posts
expect 200 "anyone can read the feed"
request GET /api/profiles/nobody
expect 404 "unknown profile is not found"
request GET /api/media/mine
expect 401 "my uploads need a token"
request POST /api/profiles "$(body '{handle: "nope", displayName: "Nope"}')"
expect 401 "creating a profile needs a token"

TOKEN_A=$(token "$(body --arg s "$USER_A" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc}')")
TOKEN_B=$(token "$(body --arg s "$USER_B" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc}')")

request GET /api/media/mine "" "$(token "$(body --arg s "$USER_A" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc, aud: "bjk-identity"}')")"
expect 401 "a token for another audience is refused"
request GET /api/media/mine "" "$(token "$(body --arg s "$USER_A" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc, lifetime: -600}')")"
expect 401 "an expired token is refused"
request GET /api/media/mine "" "$(token "$(body --arg s "$USER_A" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc, typ: "JWT"}')")"
expect 401 "an ID token (typ JWT) is refused"
request GET /api/media/mine "" "$(token "$(body --arg s "$USER_A" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc, iss: "https://evil.example.com"}')")"
expect 401 "a token from another issuer is refused"
request GET /api/media/mine "" "${TOKEN_A%?}x"
expect 401 "a token with a broken signature is refused"
request POST /api/profiles "$(body '{handle: "noscope", displayName: "No Scope"}')" \
  "$(token "$(body --arg s "$USER_A" '{sub: $s, scope: ["bjk.media"]}')")"
expect 403 "a token without bjk.profiles can't create a profile"
request GET /api/media/mine "" "$TOKEN_A"
expect 200 "a valid token is accepted"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE_URL/api/posts" \
  -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST')
CORS=$(curl -s -D - -o /dev/null -X OPTIONS "$BASE_URL/api/posts" -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: POST' | grep -i '^access-control-allow-origin:' | tr -d '\r' || true)
[ -n "$CORS" ] || fail "CORS: the web app's origin wasn't allowed."
pass "the web app's origin is allowed by CORS"
CORS=$(curl -s -D - -o /dev/null -X OPTIONS "$BASE_URL/api/posts" -H 'Origin: https://evil.example.com' \
  -H 'Access-Control-Request-Method: POST' | grep -i '^access-control-allow-origin:' || true)
[ -z "$CORS" ] || fail "CORS: another origin was allowed."
pass "other origins are refused by CORS"

# ---------- profiles ----------

request GET /api/profiles/me "" "$TOKEN_A"
expect 404 "no profile before creating one"
request POST /api/profiles "$(body '{handle: "RoadHog", displayName: "Road Hog", location: "Leeds"}')" "$TOKEN_A"
expect 201 "user A creates a profile"
[ "$(json .handle)" = "roadhog" ] || fail "Expected the handle to be stored lower-case, got $(json .handle)"
[ "$(json .id)" = "$USER_A" ] || fail "Expected the profile id to be the token's sub."
pass "profile id is the account id, handle stored lower-case"
request GET /api/profiles/handles/roadhog/availability
[ "$(json .available)" = "false" ] || fail "Expected roadhog to be taken: $RESPONSE"
pass "a taken handle shows as unavailable"
request POST /api/profiles "$(body '{handle: "dashcam_dave", displayName: "Dave"}')" "$TOKEN_B"
expect 201 "user B creates a profile"
request GET /api/profiles/roadhog
expect 200 "anyone can view a profile"

# ---------- uploads, processed by the media worker ----------

# The harmless test image goes on the known-image list before the worker starts (it loads the list at startup).
sql "INSERT media.KnownImageHashes (Id, Kind, Value, Source, Reference, AddedAt) VALUES (NEWID(), 'Sha256', '$(sha256sum scripts/sql/safety-test/known-image-test.png | cut -d' ' -f1)', 'Test', 'smoke test', SYSDATETIMEOFFSET())"

start_worker
pass "media worker starts"

# A real photo, with a GPS tag the worker must strip, and a real 3-second dashcam-shaped video.
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=3000x2000 -frames:v 1 photo.jpg
exiftool -q -overwrite_original -GPSLatitude=53.8 -GPSLatitudeRef=N -GPSLongitude=1.55 -GPSLongitudeRef=W photo.jpg \
  || echo "::warning::exiftool missing; the photo has no GPS tag to strip."
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1920x1080:rate=60 -f lavfi -i sine=frequency=440 -t 3 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac clip.mp4

# upload FILE CONTENT_TYPE TOKEN  -> sets MEDIA_ID after requesting a link, uploading and completing
upload() {
  local file=$1 type=$2 bearer=$3 size url
  size=$(stat -c %s "$file")
  request POST /api/media/uploads "$(body --arg n "$(basename "$file")" --arg t "$type" --argjson s "$size" '{fileName: $n, contentType: $t, sizeBytes: $s}')" "$bearer"
  expect 201 "request an upload link for $(basename "$file")"
  MEDIA_ID=$(json .mediaId)
  url=$(json .upload.url)
  [[ "$url" == *"$USER_A/$MEDIA_ID/"* ]] || fail "Expected the storage key to start with {userId}/{mediaId}: $url"
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Content-Type: $type" --data-binary @"$file" "$url")
  expect 200 "upload $(basename "$file") straight to object storage with the signed link"
}

upload photo.jpg image/jpeg "$TOKEN_A"
pass "storage key is {userId}/{mediaId}/..."
request POST "/api/media/$MEDIA_ID/complete" "" "$TOKEN_B"
[ "$STATUS" = 403 ] || [ "$STATUS" = 404 ] || fail "Someone else completed user A's upload: HTTP $STATUS"
pass "another user can't complete the upload ($STATUS)"
request GET "/api/media/$MEDIA_ID" "" "$TOKEN_B"
[ "$STATUS" = 403 ] || [ "$STATUS" = 404 ] || fail "Others could see the media before it was ready: HTTP $STATUS"
pass "others can't see the media before it's ready ($STATUS)"
request POST "/api/media/$MEDIA_ID/complete" "" "$TOKEN_A"
expect 202 "complete the photo upload"
PHOTO_ID=$MEDIA_ID
expect_sql "SELECT CASE WHEN EXISTS (SELECT 1 FROM [messaging].[media.process] WHERE CAST([body] AS varchar(max)) LIKE '%$PHOTO_ID%') OR EXISTS (SELECT 1 FROM media.Media WHERE Id = '$PHOTO_ID' AND Status <> 'Processing') THEN 'queued' ELSE 'missing' END" queued "the photo's job is on the media.process queue"

upload clip.mp4 video/mp4 "$TOKEN_A"
request POST "/api/media/$MEDIA_ID/complete" "" "$TOKEN_A"
expect 202 "complete the video upload"
VIDEO_ID=$MEDIA_ID

# processed ID LABEL  - waits for the worker to finish (Ready, or NeedsReview when blurring wasn't sure), then has a
# moderator approve anything held for review, so it's Ready either way
MEDIA_MOD_TOKEN=$(token "$(body --arg s "$MODERATOR" '{sub: $s, scope: ["bjk.media", "bjk.media.manage"], role: ["Moderator"], amr: ["pwd", "mfa"]}')")
processed() {
  local id=$1 label=$2 status=""
  for _ in $(seq 1 60); do
    status=$(sql "SELECT Status FROM media.Media WHERE Id = '$id'" | head -1)
    [ "$status" = Ready ] || [ "$status" = NeedsReview ] && break
    sleep 2
  done
  case "$status" in
    Ready) pass "$label (Ready)" ;;
    NeedsReview)
      request GET "/api/admin/media/$id/review" "" "$MEDIA_MOD_TOKEN"
      echo "::notice title=Held for review::$label: $(jq -c '{reviewReasons, facesBlurred, platesBlurred}' response.json 2>/dev/null || head -c 300 response.json)"
      pass "$label (NeedsReview: automatic blurring wasn't sure)"
      request POST "/api/admin/media/$id/approve" "" "$MEDIA_MOD_TOKEN"
      expect 200 "a moderator approves it"
      wait_for "sql \"SELECT Status FROM media.Media WHERE Id = '$id'\"" Ready "and it's Ready" ;;
    *) fail "$label: expected Ready or NeedsReview, last saw '$status'." ;;
  esac
}
processed "$PHOTO_ID" "the worker processes the photo"
processed "$VIDEO_ID" "the worker processes the video"

for id in "$PHOTO_ID" "$VIDEO_ID"; do
  for column in PlaybackKey ThumbnailKey; do
    key=$(sql "SELECT $column FROM media.Media WHERE Id = '$id'")
    s3 head-object --bucket "$PUBLIC_BUCKET" --key "$key" > /dev/null || fail "Expected $key in the public bucket."
  done
done
pass "processed files and thumbnails are in the public bucket"

PHOTO_KEY=$(sql "SELECT PlaybackKey FROM media.Media WHERE Id = '$PHOTO_ID'")
s3 get-object --bucket "$PUBLIC_BUCKET" --key "$PHOTO_KEY" photo-out > /dev/null
[ "$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width -of csv=p=0 photo-out)" = "webp,2048" ] \
  || fail "Expected a 2048-pixel WebP photo: $(ffprobe -v error -show_entries stream=codec_name,width,height -of csv=p=0 photo-out)"
pass "photo is a 2048-pixel WebP"
if command -v exiftool > /dev/null && [ -n "$(exiftool -q -GPSLatitude photo-out)" ]; then
  fail "The published photo still has its GPS location."
fi
pass "published photo has no GPS location"

VIDEO_KEY=$(sql "SELECT PlaybackKey FROM media.Media WHERE Id = '$VIDEO_ID'")
s3 get-object --bucket "$PUBLIC_BUCKET" --key "$VIDEO_KEY" video-out > /dev/null
VIDEO_INFO=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,height -of csv=p=0 video-out)
[ "$VIDEO_INFO" = "h264,720" ] || fail "Expected 720p H.264 video, got $VIDEO_INFO"
pass "video is 720p H.264"
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 video-out)
[ "$(awk -F/ '{ printf "%d", ($2 ? $1 / $2 : $1) + 0.5 }' <<< "$FPS")" -le 30 ] || fail "Expected at most 30 frames a second, got $FPS"
pass "video is capped at 30 frames a second"

request GET "/api/media/$PHOTO_ID" "" "$TOKEN_B"
expect 200 "others can see the media once it's ready"

# ---------- online safety: a known image is blocked ----------

upload scripts/sql/safety-test/known-image-test.png image/png "$TOKEN_A"
request POST "/api/media/$MEDIA_ID/complete" "" "$TOKEN_A"
expect 202 "complete the upload of the known test image"
KNOWN_ID=$MEDIA_ID
wait_for "sql \"SELECT Status FROM media.Media WHERE Id = '$KNOWN_ID'\"" Failed "the known test image is blocked"
expect_sql "SELECT FailureReason FROM media.Media WHERE Id = '$KNOWN_ID'" "This file can't be posted." "the uploader isn't told why"
expect_sql "SELECT COUNT(*) FROM media.KnownImageMatches WHERE MediaId = '$KNOWN_ID'" 1 "the match is recorded"
expect_sql "SELECT CASE WHEN PlaybackKey IS NULL THEN 'none' ELSE 'published' END FROM media.Media WHERE Id = '$KNOWN_ID'" none "nothing is published"
expect_sql "SELECT CASE WHEN NudityScore IS NULL THEN 'missing' ELSE 'scored' END FROM media.Media WHERE Id = '$PHOTO_ID'" scored "photos are scored for nudity"
# The rest of the test posts the processed photo, not the blocked test image.
MEDIA_ID=$PHOTO_ID

wait_for "queue_messages media.process" 0 "no jobs left on the queue"
expect_sql "SELECT COUNT(*) FROM [messaging].[media.process.failed]" 0 "no jobs in the dead-letter table"

# Browsers upload straight to storage, so it must answer a CORS preflight. Cloudflare R2 does once configured;
# this reports whether the local stand-in (S3Mock) does too.
PREFLIGHT=$(curl -s -D - -o /dev/null -X OPTIONS "$S3_ENDPOINT/$ORIGINALS_BUCKET/cors-check" \
  -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type' \
  | grep -i '^access-control-allow-origin:' | tr -d '\r' || true)
if [ -n "$PREFLIGHT" ]; then
  echo "::notice title=S3Mock CORS::S3Mock allows browser uploads from http://localhost:3000 ($PREFLIGHT)"
else
  echo "::warning title=S3Mock CORS::S3Mock didn't answer the CORS preflight; the web app will need a dev upload proxy."
fi

# ---------- posts ----------

POST_BODY=$(body --arg m "$MEDIA_ID" --arg at "$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ)" \
  '{title: "Undertaking on the M62", description: "Lorry undertakes at junction 26.", category: "DangerousOvertaking", incidentAt: $at, latitude: 53.7457, longitude: -1.7181, placeName: "M62 J26", mediaIds: [$m]}')
request POST /api/posts "$POST_BODY" "$(token "$(body --arg s "$USER_A" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc, email_verified: false}')")"
expect 400 "posting needs a confirmed email"
[ "$(json '.errors.Email[0]')" = "Confirm your email address before posting." ] || fail "Expected the confirm-email message: $RESPONSE"
request POST /api/posts "$POST_BODY" "$TOKEN_B"
[ "$STATUS" -ge 400 ] || fail "User B posted user A's media: HTTP $STATUS"
pass "can't post someone else's media ($STATUS)"
request POST /api/posts "$POST_BODY" "$TOKEN_A"
expect 201 "user A posts the incident"
POST_ID=$(json .id)
[ "$(json .author.handle)" = "roadhog" ] || fail "Expected the author's handle on the post: $RESPONSE"
pass "post shows the author's handle"

request GET /api/posts
[ "$(json .totalCount)" = "1" ] || fail "Expected 1 post in the feed: $RESPONSE"
pass "the post is in the public feed"
expect_sql "SELECT CASE WHEN OriginalDeletedAt IS NULL THEN 0 ELSE 1 END FROM media.Media WHERE Id = '$MEDIA_ID'" 1 \
  "the uploaded original is deleted once the post is published"
ORIGINAL_KEY=$(sql "SELECT OriginalKey FROM media.Media WHERE Id = '$MEDIA_ID'")
if s3 head-object --bucket "$ORIGINALS_BUCKET" --key "$ORIGINAL_KEY" > /dev/null 2>&1; then
  fail "The published photo's original is still in storage."
fi
pass "and removed from storage"
request PUT "/api/posts/$POST_ID/reaction" "$(body '{type: "Angry"}')" "$TOKEN_B"
expect 204 "user B reacts"
request POST "/api/posts/$POST_ID/comments" "$(body '{body: "Shocking driving."}')" "$TOKEN_B"
expect 201 "user B comments"
COMMENT_ID=$(json .id)
request POST "/api/posts/$POST_ID/reports" "$(body '{reason: "PersonalInformation", details: "Number plate visible"}')" "$TOKEN_B"
expect 204 "user B reports the post"
request GET "/api/posts/$POST_ID" "" "$TOKEN_B"
[ "$(json .reactions.Angry)" = "1" ] && [ "$(json .commentCount)" = "1" ] && [ "$(json .myReaction)" = "Angry" ] \
  || fail "Expected 1 Angry reaction, 1 comment and my reaction: $RESPONSE"
pass "post shows the reaction, the comment count and my reaction"

# ---------- reels and the incident heat map ----------

VIDEO_POST_BODY=$(body --arg m "$VIDEO_ID" --arg at "$(date -u -d '-3 hours' +%Y-%m-%dT%H:%M:%SZ)" \
  '{title: "Close pass on the A64", category: "ClosePass", incidentAt: $at, latitude: 53.9590, longitude: -1.0815, placeName: "A64, York", mediaIds: [$m]}')
request POST /api/posts "$VIDEO_POST_BODY" "$TOKEN_A"
expect 201 "user A posts the video"
VIDEO_POST_ID=$(json .id)
expect_sql "SELECT CAST(HasVideo AS int) FROM posts.Posts WHERE Id = '$VIDEO_POST_ID'" 1 "the video post is a reel"

VIEWER='X-Viewer-Id: smoke-viewer-0001'
reels() { STATUS=$(curl -s -o response.json -w '%{http_code}' "$@"); RESPONSE=$(cat response.json); }
reels -H "$VIEWER" "$BASE_URL/api/reels"
expect 200 "logged-out viewers get reels"
[ "$(json '.items | length')" = "1" ] && [ "$(json '.items[0].id')" = "$VIDEO_POST_ID" ] \
  || fail "Expected only the video post in reels: $RESPONSE"
[ "$(json .dailyPlayLimit)" = "1" ] && [ "$(json .playsRemainingToday)" = "1" ] \
  || fail "Expected 1 play left of 1 (Reels:DailyPlays:Anonymous=1): $RESPONSE"
pass "reels are video posts only, with today's allowance"
reels -X POST -H "$VIEWER" "$BASE_URL/api/reels/$VIDEO_POST_ID/play"
expect 200 "a play is recorded after 3 seconds"
[ "$(json .counted)" = "true" ] && [ "$(json .playsRemainingToday)" = "0" ] || fail "Expected the play to count: $RESPONSE"
reels -X POST -H "$VIEWER" "$BASE_URL/api/reels/$VIDEO_POST_ID/play"
expect 200 "replaying today's reel is free"
[ "$(json .counted)" = "false" ] || fail "Expected the replay not to count: $RESPONSE"
reels -H "$VIEWER" "$BASE_URL/api/reels"
expect 403 "no reels left today"
[ "$(json .code)" = "daily_limit" ] && [ "$(json .resetsAt)" != "null" ] || fail "Expected code daily_limit and resetsAt: $RESPONSE"
pass "the daily limit says when it resets"
reels -H "X-Viewer-Id: smoke-viewer-0002" "$BASE_URL/api/reels"
expect 200 "another logged-out viewer has their own allowance"
reels -X POST -H "$VIEWER" "$BASE_URL/api/reels/$POST_ID/play"
expect 404 "photo posts aren't reels"
expect_sql "SELECT SUM(Plays) FROM posts.ReelPlayDailyCounts WHERE PostId = '$VIDEO_POST_ID'" 1 "plays are counted per post and day"

request GET /api/reels "" "$TOKEN_B"
[ "$(json .dailyPlayLimit)" = "25" ] || fail "Expected 25 a day on the Free plan: $RESPONSE"
pass "Free members get 25 reels a day"
request GET /api/reels "" "$(token "$(body --arg s "$USER_B" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc, plan: "premium"}')")"
[ "$(json .playsRemainingToday)" = "null" ] && [ "$(json .dailyPlayLimit)" = "null" ] || fail "Expected unlimited reels on Premium: $RESPONSE"
pass "Premium (plan claim) is unlimited"

BBOX="-2.0,53.0,-0.5,54.5"
request GET "/api/heatmap?bbox=$BBOX&zoom=8"
expect 401 "the heat map needs signing in"
request GET "/api/heatmap?bbox=$BBOX&zoom=8&categories=ClosePass" "" "$TOKEN_B"
expect 200 "a Free member gets the heat map"
[ "$(json .access.plan)" = "Free" ] && [ "$(json .access.filtersIgnored)" = "true" ] && [ "$(json .minCellCount)" = "3" ] \
  || fail "Expected the Free teaser with filters ignored: $RESPONSE"
[ "$(json '.cells | length')" = "0" ] || fail "Expected cells under 3 incidents to be hidden: $RESPONSE"
pass "the Free teaser hides small cells and ignores filters"
request GET "/api/heatmap/area?bbox=$BBOX" "" "$TOKEN_B"
expect 200 "area figures"
[ "$(json .suppressed)" = "true" ] && [ "$(json .total)" = "null" ] || fail "Expected area figures under 3 incidents to be hidden: $RESPONSE"
pass "area figures under 3 incidents are hidden"
request GET "/api/heatmap/export.csv?bbox=$BBOX" "" "$TOKEN_B"
expect 403 "CSV export isn't on the Free plan"
TOKEN_PLUS=$(token "$(body --arg s "$USER_PLUS" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc}')")
request GET "/api/heatmap/export.csv?bbox=$BBOX&from=2024-01-01" "" "$TOKEN_PLUS"
expect 200 "Premium + (Plans:Overrides) exports CSV"
head -1 response.json | grep -q '^from,to,centre_latitude' || fail "Expected the CSV header: $(head -c 200 response.json)"
pass "the export is aggregated cells"
request GET "/api/heatmap?bbox=$BBOX&zoom=14&from=2020-01-01&categories=ClosePass&hours=7-10&days=Weekdays" "" "$TOKEN_PLUS"
[ "$(json .access.plan)" = "PremiumPlus" ] && [ "$(json .access.historyCapped)" = "true" ] && [ "$(json .access.filtersAllowed)" = "true" ] \
  || fail "Expected Premium + with 5 years of history and filters: $RESPONSE"
pass "Premium + gets filters and 5 years of history"

# ---------- moderation ----------

MOD_SCOPES='["bjk.posts", "bjk.posts.manage"]'
request GET /api/admin/reports "" "$TOKEN_B"
expect 403 "a normal user can't see the reports queue"
request GET /api/admin/reports "" "$(token "$(body --arg s "$MODERATOR" --argjson sc "$MOD_SCOPES" '{sub: $s, scope: $sc, role: ["Moderator"], amr: ["pwd"]}')")"
expect 403 "a moderator who didn't use two-step can't see reports"
MOD_TOKEN=$(token "$(body --arg s "$MODERATOR" --argjson sc "$MOD_SCOPES" '{sub: $s, scope: $sc, role: ["Moderator"], amr: ["pwd", "mfa"]}')")
request GET /api/admin/reports "" "$MOD_TOKEN"
expect 200 "a moderator with two-step sees the reports queue"
[ "$(json .totalCount)" = "1" ] || fail "Expected 1 open report: $RESPONSE"
pass "the report is in the queue"

# ---------- download my data ----------

request GET /api/me/data-export "" "$TOKEN_A"
expect 200 "user A downloads their data"
for section in profile posts media; do
  [ "$(jq -r "has(\"$section\") or (.sections // {} | has(\"$section\"))" response.json)" = "true" ] \
    || fail "Expected a '$section' section in the export: $(head -c 400 response.json)"
done
pass "export has profile, posts and media sections"

# ---------- user lifecycle events from the identity server ----------

user_event Deactivated "$USER_A"
wait_for "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/api/profiles/roadhog" 404 "deactivated user's profile disappears"
# Profiles and Posts each handle the event from their own queue binding, so allow for them finishing apart.
wait_for "curl -s $BASE_URL/api/posts | jq -r .totalCount" 0 "deactivated user's posts are hidden from the feed"
request GET /api/profiles/handles/roadhog/availability
[ "$(json .available)" = "false" ] || fail "Expected the handle to stay reserved while deactivated: $RESPONSE"
pass "deactivated user's handle stays reserved"

user_event Reactivated "$USER_A"
wait_for "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/api/profiles/roadhog" 200 "reactivated user's profile is back"
wait_for "curl -s $BASE_URL/api/posts | jq -r .totalCount" 2 "reactivated user's posts are back in the feed"

# The original was deleted when the post was published (bjk-modules #17), so check the processed photo instead.
PLAYBACK_KEY=$(sql "SELECT PlaybackKey FROM media.Media WHERE Id = '$MEDIA_ID'")
s3 head-object --bucket "$PUBLIC_BUCKET" --key "$PLAYBACK_KEY" > /dev/null || fail "Expected the processed photo in storage before deletion."
user_event Deleted "$USER_A"
wait_for "sql \"SELECT COUNT(*) FROM profiles.Profiles WHERE Id = '$USER_A'\"" 0 "deleted user's profile is removed"
expect_sql "SELECT COUNT(*) FROM posts.Posts WHERE AuthorId = '$USER_A'" 0 "and their posts"
expect_sql "SELECT COUNT(*) FROM posts.Comments WHERE PostId = '$POST_ID'" 0 "and the comments on their posts"
expect_sql "SELECT COUNT(*) FROM media.Media WHERE UserId = '$USER_A'" 0 "and their media records"
if s3 head-object --bucket "$PUBLIC_BUCKET" --key "$PLAYBACK_KEY" > /dev/null 2>&1; then
  fail "The deleted user's photo is still in storage."
fi
pass "and their files in object storage"
expect_sql "SELECT COUNT(*) FROM profiles.Profiles WHERE Id = '$USER_B'" 1 "user B is untouched"
wait_for "queue_messages bjk-core.user-events" 0 "every user event handled and removed from the queue"
[ "$(queue_messages bjk-core.user-events.failed)" = "0" ] || fail "An event ended up in the dead-letter table."
pass "no events in the dead-letter table"

# ---------- restart: migrations keep data ----------

stop_worker
stop_app
start_app
[ "$(grep -c 'database schema is up to date' "$APP_LOG")" -ge 3 ] || fail "Expected all three schemas to be up to date on restart."
pass "all three schemas up to date on restart"
request GET /api/profiles/dashcam_dave
expect 200 "data survives the restart"

# ---------- API reference (NSwag, served in Development) ----------

curl -fs "$BASE_URL/openapi/v1.json" -o "${OPENAPI_FILE:-openapi.json}" || fail "The OpenAPI document isn't served at /openapi/v1.json."
python3 - "${OPENAPI_FILE:-openapi.json}" <<'PY' || fail "The OpenAPI document is missing endpoints."
import json, sys
doc = json.load(open(sys.argv[1]))
paths = doc.get("paths", {})
for needed in ("/api/posts", "/api/profiles/me", "/api/notifications"):
    if not any(p == needed or p.startswith(needed + "/") for p in paths):
        sys.exit(f"missing {needed}")
print(f"{len(paths)} paths")
PY
pass "OpenAPI document lists the posts, profiles and notifications endpoints"
curl -fs "$BASE_URL/api-docs/index.html" | grep -qi swagger || fail "Swagger UI isn't served at /api-docs."
pass "Swagger UI is served at /api-docs"
stop_app

# ---------- settings checks (--check-settings) ----------

# Development: the CI settings are fine, so the check passes.
dotnet run --project "$PROJECT" --configuration Release --no-build --no-launch-profile -- --check-settings > check.log 2>&1 \
  || { cat check.log; fail "--check-settings failed in Development."; }
grep -q "Settings check passed" check.log || fail "--check-settings didn't say it passed."
pass "--check-settings passes in Development"

# Anywhere else, every missing or stand-in setting is listed at once, and it exits 1 without starting.
if ASPNETCORE_ENVIRONMENT=Production dotnet run --project "$PROJECT" --configuration Release --no-build --no-launch-profile -- --check-settings > check.log 2>&1; then
  cat check.log; fail "--check-settings passed in Production with local settings."
fi
# Matched by setting name: without user secrets most are missing, and the rest are stand-ins ("must be ...").
for expected in "Email:Provider " "SMS:Provider " "Cors:AllowedOrigins:0 " "Captcha:TurnstileSecretKey " "MediatR:LicenseKey " \
  "Notifications:AppUrl "; do
  grep -qF "  $expected" check.log || { cat check.log; fail "--check-settings in Production didn't report: $expected"; }
done
pass "--check-settings in Production lists every missing setting and exits 1"

if DOTNET_ENVIRONMENT=Production dotnet run --project "$WORKER_PROJECT" --configuration Release --no-build --no-launch-profile -- --check-settings > check.log 2>&1; then
  cat check.log; fail "The media worker's --check-settings passed in Production with local settings."
fi
grep -qF "Media:Storage:SensitiveBucket is missing" check.log || { cat check.log; fail "The media worker's --check-settings didn't report the sensitive bucket."; }
pass "media worker --check-settings in Production lists what's missing"

# The API itself refuses to start in Production with local settings.
if ASPNETCORE_ENVIRONMENT=Production timeout 60 dotnet run --project "$PROJECT" --configuration Release --no-build --no-launch-profile > check.log 2>&1; then
  fail "The API started in Production with local settings."
fi
grep -qF "Email:Provider " check.log || { cat check.log; fail "The API's refusal to start didn't name the missing settings."; }
pass "API refuses to start in Production without every setting"

# ---------- summary ----------

checklist=$(printf '%s\n' "${PASSED[@]}")
message=$(printf '%s checks passed:\n%s' "${#PASSED[@]}" "$checklist")
echo "::notice title=Smoke test passed::$(sed ':a;N;$!ba;s/%/%25/g;s/\n/%0A/g' <<< "$message")"
echo "All smoke tests passed."

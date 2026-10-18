#!/usr/bin/env bash
# End-to-end smoke test for the API host, run by CI against real SQL Server, RabbitMQ and MinIO (standing in for
# Cloudflare R2), with fake-issuer.py standing in for bjk-identity-server.
#
# Covers: startup migrations; token validation (issuer, audience, expiry, token type, scopes); profiles; uploads to
# object storage; the processing queue; posts, reactions, comments and reports; moderation rights; data export; the
# user lifecycle events from the identity server (deactivate, reactivate, delete); and a restart.
set -euo pipefail

PROJECT=${PROJECT:-src/BJK.Core.Api}
BASE_URL=${BASE_URL:-http://localhost:5100}
ISSUER_URL=${ISSUER_URL:-http://localhost:5999}
APP_LOG=${APP_LOG:-app.log}
S3_ENDPOINT=${S3_ENDPOINT:-http://localhost:9000}
ORIGINALS_BUCKET=${Media__Storage__OriginalsBucket:-bjk-ci-originals}
RABBITMQ_MANAGEMENT_URL=${RABBITMQ_MANAGEMENT_URL:-http://localhost:15672}

APP_PID=""
PASSED=()
: > "$APP_LOG"

# ---------- helpers ----------

fail() { echo "::error::$1"; exit 1; }

on_exit() {
  local status=$?
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; fi
  if [ $status -ne 0 ]; then
    echo "::error title=App log (last 40 lines)::$(tail -40 "$APP_LOG" | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
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

rabbit() { curl -fs -u "$RABBITMQ_USER:$RABBITMQ_PASSWORD" "$@"; }

queue_messages() { rabbit "$RABBITMQ_MANAGEMENT_URL/api/queues/%2F/$1" | jq -r '.messages'; }

# user_event TYPE USER_ID  - publishes a user lifecycle event as the identity server would
user_event() {
  local payload
  payload=$(body --arg id "$(cat /proc/sys/kernel/random/uuid)" --arg user "$2" --arg type "$1" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{eventId: $id, userId: $user, type: $type, occurredAt: $at}')
  rabbit -X POST -H 'Content-Type: application/json' "$RABBITMQ_MANAGEMENT_URL/api/exchanges/%2F/bjk.users/publish" \
    -d "$(body --arg p "$payload" '{properties: {delivery_mode: 2, content_type: "application/json"}, routing_key: "", payload: $p, payload_encoding: "string"}')" \
    | jq -e '.routed == true' > /dev/null || fail "The $1 event wasn't routed to the API's queue."
}

s3() { aws --endpoint-url "$S3_ENDPOINT" s3api "$@"; }

USER_A=$(cat /proc/sys/kernel/random/uuid)
USER_B=$(cat /proc/sys/kernel/random/uuid)
MODERATOR=$(cat /proc/sys/kernel/random/uuid)
ALL_SCOPES='["bjk.media", "bjk.profiles", "bjk.posts"]'

# ---------- first start: databases and schemas are created ----------

start_app
for context in MediaDbContext ProfilesDbContext PostsDbContext; do
  grep -q "$context: applying migrations" "$APP_LOG" || fail "Expected $context to apply its migrations on first start."
done
pass "media, profiles and posts schemas created on first start"
expect_sql "SELECT COUNT(*) FROM sys.schemas WHERE name IN ('media', 'profiles', 'posts')" 3 "three module schemas in badjockeys"
wait_for "grep -c \"Listening for user lifecycle events on 'bjk-core.user-events'\" $APP_LOG" 1 "listening for user lifecycle events"

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

# ---------- uploads ----------

head -c 2048 /dev/urandom > photo.jpg
request POST /api/media/uploads "$(body '{fileName: "dashcam.jpg", contentType: "image/jpeg", sizeBytes: 2048}')" "$TOKEN_A"
expect 201 "request an upload link"
MEDIA_ID=$(json .mediaId)
UPLOAD_URL=$(json .upload.url)
[[ "$UPLOAD_URL" == *"$USER_A/$MEDIA_ID/"* ]] || fail "Expected the storage key to start with {userId}/{mediaId}: $UPLOAD_URL"
pass "storage key is {userId}/{mediaId}/..."
# The signature covers the host and path, not the scheme; MinIO in CI speaks plain HTTP.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: image/jpeg' --data-binary @photo.jpg "${UPLOAD_URL/https:/http:}")
expect 200 "upload straight to object storage with the signed link"
request POST "/api/media/$MEDIA_ID/complete" "" "$TOKEN_B"
[ "$STATUS" = 403 ] || [ "$STATUS" = 404 ] || fail "Someone else completed user A's upload: HTTP $STATUS"
pass "another user can't complete the upload ($STATUS)"
request POST "/api/media/$MEDIA_ID/complete" "" "$TOKEN_A"
expect 202 "complete the upload"
[ "$(json .status)" = "Processing" ] || fail "Expected Processing, got $(json .status)"
wait_for "queue_messages media.process" 1 "a processing job is on the media.process queue"

# Stand in for the media worker (not built yet): mark the photo processed.
sql "UPDATE media.Media SET Status = 'Ready', PlaybackKey = '$USER_A/$MEDIA_ID/image.webp', ThumbnailKey = '$USER_A/$MEDIA_ID/thumbnail.webp', Width = 1280, Height = 720, ProcessedAt = SYSDATETIMEOFFSET() WHERE Id = '$MEDIA_ID'" > /dev/null
request GET "/api/media/$MEDIA_ID" "" "$TOKEN_B"
expect 200 "others can see the media once it's ready"

# ---------- posts ----------

POST_BODY=$(body --arg m "$MEDIA_ID" --arg at "$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ)" \
  '{title: "Undertaking on the M62", description: "Lorry undertakes at junction 26.", category: "DangerousOvertaking", incidentAt: $at, latitude: 53.7457, longitude: -1.7181, placeName: "M62 J26", mediaIds: [$m]}')
request POST /api/posts "$POST_BODY" "$(token "$(body --arg s "$USER_A" --argjson sc "$ALL_SCOPES" '{sub: $s, scope: $sc, email_verified: false}')")"
expect 403 "posting needs a confirmed email"
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
request GET /api/posts
[ "$(json .totalCount)" = "0" ] || fail "Expected the deactivated user's post to be hidden: $RESPONSE"
pass "deactivated user's post is hidden from the feed"
request GET /api/profiles/handles/roadhog/availability
[ "$(json .available)" = "false" ] || fail "Expected the handle to stay reserved while deactivated: $RESPONSE"
pass "deactivated user's handle stays reserved"

user_event Reactivated "$USER_A"
wait_for "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/api/profiles/roadhog" 200 "reactivated user's profile is back"
request GET /api/posts
[ "$(json .totalCount)" = "1" ] || fail "Expected the post back in the feed: $RESPONSE"
pass "reactivated user's post is back in the feed"

ORIGINAL_KEY=$(sql "SELECT OriginalKey FROM media.Media WHERE Id = '$MEDIA_ID'")
s3 head-object --bucket "$ORIGINALS_BUCKET" --key "$ORIGINAL_KEY" > /dev/null || fail "Expected the original in storage before deletion."
user_event Deleted "$USER_A"
wait_for "sql \"SELECT COUNT(*) FROM profiles.Profiles WHERE Id = '$USER_A'\"" 0 "deleted user's profile is removed"
expect_sql "SELECT COUNT(*) FROM posts.Posts WHERE AuthorId = '$USER_A'" 0 "and their posts"
expect_sql "SELECT COUNT(*) FROM posts.Comments WHERE PostId = '$POST_ID'" 0 "and the comments on their posts"
expect_sql "SELECT COUNT(*) FROM media.Media WHERE UserId = '$USER_A'" 0 "and their media records"
if s3 head-object --bucket "$ORIGINALS_BUCKET" --key "$ORIGINAL_KEY" > /dev/null 2>&1; then
  fail "The deleted user's original file is still in storage."
fi
pass "and their files in object storage"
expect_sql "SELECT COUNT(*) FROM profiles.Profiles WHERE Id = '$USER_B'" 1 "user B is untouched"
[ "$(queue_messages bjk-core.user-events.failed)" = "0" ] || fail "An event ended up on the failed queue."
pass "no events on the failed queue"

# ---------- restart: migrations keep data ----------

stop_app
start_app
[ "$(grep -c 'database schema is up to date' "$APP_LOG")" -ge 3 ] || fail "Expected all three schemas to be up to date on restart."
pass "all three schemas up to date on restart"
request GET /api/profiles/dashcam_dave
expect 200 "data survives the restart"
stop_app

# ---------- summary ----------

checklist=$(printf '%s\n' "${PASSED[@]}")
message=$(printf '%s checks passed:\n%s' "${#PASSED[@]}" "$checklist")
echo "::notice title=Smoke test passed::$(sed ':a;N;$!ba;s/%/%25/g;s/\n/%0A/g' <<< "$message")"
echo "All smoke tests passed."

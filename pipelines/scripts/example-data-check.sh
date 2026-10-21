#!/usr/bin/env bash
# Checks the local example data (scripts/sql/example-data) against the database the smoke test left behind, so a
# schema change that would break the setup's example data fails here instead. Runs after the reports check, whose
# stand-in idsrv database it extends with the identity columns the example accounts fill.
#   1. The generated SQL applies cleanly, twice (a re-run must replace the data, not add to it).
#   2. The row counts match what the generator says it made.
# Needs SQL_CONTAINER (the SQL Server service container) and SQL_PASSWORD.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail() { echo "::error::$*"; exit 1; }
sql() { docker exec -i "$SQL_CONTAINER" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SQL_PASSWORD" -C -b -I "$@"; }

echo "--- stand-in idsrv columns"
sql <<'SQL'
IF DB_ID('idsrv') IS NULL CREATE DATABASE idsrv;
GO
USE idsrv;
IF SCHEMA_ID('auth') IS NULL EXEC('CREATE SCHEMA auth');
IF SCHEMA_ID('users') IS NULL EXEC('CREATE SCHEMA users');
GO
IF OBJECT_ID('auth.AspNetUsers') IS NULL CREATE TABLE auth.AspNetUsers (Id nvarchar(450) PRIMARY KEY, Email nvarchar(256), EmailConfirmed bit NOT NULL, TwoFactorEnabled bit NOT NULL, LockoutEnd datetimeoffset NULL);
IF COL_LENGTH('auth.AspNetUsers', 'UserName') IS NULL ALTER TABLE auth.AspNetUsers ADD UserName nvarchar(256), NormalizedUserName nvarchar(256),
  NormalizedEmail nvarchar(256), PasswordHash nvarchar(max), SecurityStamp nvarchar(max), ConcurrencyStamp nvarchar(max), PhoneNumber nvarchar(max),
  PhoneNumberConfirmed bit NOT NULL DEFAULT 0, LockoutEnabled bit NOT NULL DEFAULT 0, AccessFailedCount int NOT NULL DEFAULT 0;
IF OBJECT_ID('auth.AspNetUserLogins') IS NULL CREATE TABLE auth.AspNetUserLogins (LoginProvider nvarchar(450), ProviderKey nvarchar(450), ProviderDisplayName nvarchar(max), UserId nvarchar(450));
IF OBJECT_ID('auth.AspNetUserRoles') IS NULL CREATE TABLE auth.AspNetUserRoles (UserId nvarchar(450), RoleId nvarchar(450));
IF OBJECT_ID('auth.AspNetUserClaims') IS NULL CREATE TABLE auth.AspNetUserClaims (Id int IDENTITY PRIMARY KEY, UserId nvarchar(450), ClaimType nvarchar(max), ClaimValue nvarchar(max));
IF OBJECT_ID('auth.AspNetUserTokens') IS NULL CREATE TABLE auth.AspNetUserTokens (UserId nvarchar(450), LoginProvider nvarchar(450), Name nvarchar(450), Value nvarchar(max));
IF OBJECT_ID('users.Accounts') IS NULL CREATE TABLE users.Accounts (Id uniqueidentifier PRIMARY KEY, Status nvarchar(20), CreatedAt datetimeoffset, DeactivatedAt datetimeoffset NULL, DateOfBirth date NULL, AgeCheckStatus nvarchar(20), AgeCheckMethod nvarchar(20) NULL);
IF COL_LENGTH('users.Accounts', 'AgeCheckResult') IS NULL ALTER TABLE users.Accounts ADD AgeCheckResult nvarchar(20) NULL, AgeCheckRecordedAt datetimeoffset NULL, AgeCheckAttempts int NOT NULL DEFAULT 0;
SQL

echo "--- build the example data"
node --input-type=module -e '
  import { buildSql } from "./scripts/sql/example-data/build-sql.mjs";
  import { buildExampleData } from "./scripts/sql/example-data/generate.mjs";
  import { writeFileSync } from "node:fs";
  writeFileSync(process.argv[1], buildSql().sql);
  const d = buildExampleData();
  const sum = (f) => d.posts.reduce((n, p) => n + f(p), 0);
  writeFileSync(process.argv[2], JSON.stringify({
    Profiles: d.users.length, Posts: d.posts.length,
    Comments: sum((p) => p.comments.length),
    Reactions: sum((p) => Object.values(p.reactions).flat().length),
    PostVotes: sum((p) => p.votes.length),
    PostViews: sum((p) => p.views.length),
    Follows: d.follows.length, Bookmarks: d.bookmarks.length,
    VideoPosts: d.posts.filter((p) => p.video).length,
  }));
' "$RUNNER_TEMP/seed.sql" "$RUNNER_TEMP/expected.json"
echo "SQL: $(wc -c < "$RUNNER_TEMP/seed.sql") bytes"

echo "--- apply it twice"
for run in 1 2; do
  start=$(date +%s)
  if ! sql < "$RUNNER_TEMP/seed.sql" > "$RUNNER_TEMP/seed.log" 2>&1; then
    # sqlcmd prints errors as "Msg ..., Line n" followed by the message: make each an annotation.
    grep -A1 '^Msg ' "$RUNNER_TEMP/seed.log" | grep -v '^--$' | paste -d ' ' - - | head -5 | sed 's/^/::error title=Example data SQL::/' || true
    tail -5 "$RUNNER_TEMP/seed.log"
    fail "The example data SQL failed (run $run)."
  fi
  tail -3 "$RUNNER_TEMP/seed.log"
  echo "Run $run took $(( $(date +%s) - start ))s"
done

echo "--- counts"
actual=$(sql -h -1 -W -s '|' <<'SQL'
SET NOCOUNT ON;
SELECT
  (SELECT COUNT(*) FROM badjockeys.profiles.Profiles WHERE Id LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.posts.Posts WHERE Id LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.posts.Comments WHERE Id LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.posts.Reactions WHERE PostId LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.posts.PostVotes WHERE PostId LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.posts.PostViews WHERE PostId LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.profiles.Follows WHERE FollowerId LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.posts.Bookmarks WHERE PostId LIKE 'e0000000%'),
  (SELECT COUNT(*) FROM badjockeys.posts.Posts WHERE Id LIKE 'e0000000%' AND HasVideo = 1);
SQL
)
actual=$(echo "$actual" | tr -d '[:space:]')
expected=$(jq -r '[.Profiles, .Posts, .Comments, .Reactions, .PostVotes, .PostViews, .Follows, .Bookmarks, .VideoPosts] | map(tostring) | join("|")' "$RUNNER_TEMP/expected.json")
echo "Expected $expected"
echo "Actual   $actual"
[ "$actual" = "$expected" ] || fail "Example data counts don't match (profiles|posts|comments|reactions|votes|views|follows|bookmarks|videos)."
echo "Example data OK."

#!/usr/bin/env bash
# Checks the reporting views (scripts/sql/reporting) against real databases, after the smoke test has run the
# API so the badjockeys database and its queue tables exist. The idsrv database isn't in this CI, so a stand-in with
# the identity server's columns (the ones the views read) is created first.
#   1. Both sets of views and the bjk_reporting login apply cleanly (twice: they must be safe to re-run).
#   2. bjk_reporting can read every reporting view, and can't read a table.
# Needs SQL_CONTAINER (the SQL Server service container) and SQL_PASSWORD.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail() { echo "::error::$*"; exit 1; }
sql() { docker exec -i "$SQL_CONTAINER" /opt/mssql-tools18/bin/sqlcmd -S localhost -C -b -I "$@"; }
as_sa() { sql -U sa -P "$SQL_PASSWORD" "$@"; }
REPORTING_PASSWORD="CiReporting2026x"

echo "--- stand-in idsrv database"
as_sa <<'SQL'
IF DB_ID('idsrv') IS NULL CREATE DATABASE idsrv;
GO
USE idsrv;
IF SCHEMA_ID('auth') IS NULL EXEC('CREATE SCHEMA auth');
IF SCHEMA_ID('users') IS NULL EXEC('CREATE SCHEMA users');
GO
IF OBJECT_ID('auth.AspNetUsers') IS NULL CREATE TABLE auth.AspNetUsers (Id nvarchar(450) PRIMARY KEY, Email nvarchar(256), EmailConfirmed bit NOT NULL, TwoFactorEnabled bit NOT NULL, LockoutEnd datetimeoffset NULL);
IF OBJECT_ID('auth.AspNetUserLogins') IS NULL CREATE TABLE auth.AspNetUserLogins (LoginProvider nvarchar(450), ProviderKey nvarchar(450), ProviderDisplayName nvarchar(max), UserId nvarchar(450));
IF OBJECT_ID('auth.AspNetRoles') IS NULL CREATE TABLE auth.AspNetRoles (Id nvarchar(450) PRIMARY KEY, Name nvarchar(256));
IF OBJECT_ID('auth.AspNetUserRoles') IS NULL CREATE TABLE auth.AspNetUserRoles (UserId nvarchar(450), RoleId nvarchar(450));
IF OBJECT_ID('users.Accounts') IS NULL CREATE TABLE users.Accounts (Id uniqueidentifier PRIMARY KEY, Status nvarchar(20), CreatedAt datetimeoffset, DeactivatedAt datetimeoffset NULL, DateOfBirth date NULL, AgeCheckStatus nvarchar(20), AgeCheckMethod nvarchar(20) NULL);
IF OBJECT_ID('users.Outbox') IS NULL CREATE TABLE users.Outbox (Id uniqueidentifier PRIMARY KEY, OccurredAt datetimeoffset, PublishedAt datetimeoffset NULL);
GO
DELETE FROM users.Accounts; DELETE FROM auth.AspNetUsers;
INSERT INTO users.Accounts VALUES ('6B1C2D3E-0000-4000-8000-000000000001', 'Active', SYSDATETIMEOFFSET(), NULL, '2001-05-04', 'Passed', 'FacialAge');
INSERT INTO auth.AspNetUsers VALUES ('6b1c2d3e-0000-4000-8000-000000000001', 'x@example.test', 1, 0, NULL);
GO
SQL

echo "--- apply the views and the login (twice)"
for run in 1 2; do
  as_sa -d idsrv < scripts/sql/reporting/idsrv.sql || fail "scripts/sql/reporting/idsrv.sql failed (run $run)."
  as_sa -d badjockeys < scripts/sql/reporting/badjockeys.sql || fail "scripts/sql/reporting/badjockeys.sql failed (run $run)."
  as_sa -d master -v ReportingPassword="$REPORTING_PASSWORD" < scripts/sql/reporting/login.sql || fail "scripts/sql/reporting/login.sql failed (run $run)."
done
echo "ok  views and login apply, and re-apply"

echo "--- bjk_reporting reads every view, and nothing else"
for db in idsrv badjockeys; do
  views=$(as_sa -d "$db" -h -1 -W -Q "SET NOCOUNT ON; SELECT name FROM sys.views WHERE schema_id = SCHEMA_ID('reporting') ORDER BY name")
  [ -n "$views" ] || fail "No reporting views in $db."
  for view in $views; do
    sql -U bjk_reporting -P "$REPORTING_PASSWORD" -d "$db" -Q "SET NOCOUNT ON; SELECT TOP (1) * FROM reporting.[$view]" > /dev/null \
      || fail "bjk_reporting can't read $db.reporting.$view."
  done
  echo "ok  $db: $(wc -w <<< "$views") views readable"
done
if sql -U bjk_reporting -P "$REPORTING_PASSWORD" -d badjockeys -Q "SELECT TOP (1) * FROM posts.Posts" > /dev/null 2>&1; then
  fail "bjk_reporting could read posts.Posts: it must only see the reporting views."
fi
echo "ok  bjk_reporting can't read the tables"

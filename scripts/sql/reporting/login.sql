-- The read-only login Grafana uses: it can read the reporting views in both databases and nothing else (no tables,
-- no other schemas). Run as an admin; $(ReportingPassword) comes from apply.mjs. Safe to run again: it updates the
-- password. In deployed environments the password is a container secret.
SET NOCOUNT ON;
USE master;
IF SUSER_ID(N'bjk_reporting') IS NULL
    CREATE LOGIN bjk_reporting WITH PASSWORD = N'$(ReportingPassword)', CHECK_POLICY = OFF;
ELSE
    ALTER LOGIN bjk_reporting WITH PASSWORD = N'$(ReportingPassword)';
GO
USE idsrv;
IF USER_ID(N'bjk_reporting') IS NULL CREATE USER bjk_reporting FOR LOGIN bjk_reporting;
GRANT SELECT ON SCHEMA::reporting TO bjk_reporting;
GO
USE badjockeys;
IF USER_ID(N'bjk_reporting') IS NULL CREATE USER bjk_reporting FOR LOGIN bjk_reporting;
GRANT SELECT ON SCHEMA::reporting TO bjk_reporting;
GO

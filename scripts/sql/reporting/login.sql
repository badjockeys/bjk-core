-- The read-only login the reports (Power BI when deployed) use: it can read the reporting views in both databases and nothing else (no tables,
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

-- Ask AI (the AI chat) reads the incidents through this login, and nothing else: not the other
-- reporting views (reports, moderation, queues), not the tables behind them, not the identity database.
-- $(ChatPassword) comes from apply.mjs; in deployed environments it's a container secret.
USE master;
IF SUSER_ID(N'bjk_chat') IS NULL
    CREATE LOGIN bjk_chat WITH PASSWORD = N'$(ChatPassword)', CHECK_POLICY = OFF;
ELSE
    ALTER LOGIN bjk_chat WITH PASSWORD = N'$(ChatPassword)';
GO
USE badjockeys;
IF USER_ID(N'bjk_chat') IS NULL CREATE USER bjk_chat FOR LOGIN bjk_chat;
GRANT SELECT ON reporting.Incidents TO bjk_chat;
GRANT SELECT ON reporting.Subcategories TO bjk_chat;
GO

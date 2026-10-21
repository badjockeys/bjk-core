-- Reporting views for the identity server's database (idsrv). Reports (Power BI when deployed) read only these,
-- through the read-only bjk_reporting login: counts and groupings, never emails, names, ids or dates of birth. Safe
-- to run again. Applied by scripts/sql/reporting/apply.mjs (the setup does it locally).
SET NOCOUNT ON;
GO
IF SCHEMA_ID(N'reporting') IS NULL EXEC (N'CREATE SCHEMA reporting AUTHORIZATION dbo');
GO

-- One row: the state of every account now.
CREATE OR ALTER VIEW reporting.AccountSummary AS
SELECT
    COUNT(*)                                                                          AS Accounts,
    SUM(CASE WHEN a.Status = N'Active' THEN 1 ELSE 0 END)                             AS Active,
    SUM(CASE WHEN a.Status = N'Deactivated' THEN 1 ELSE 0 END)                        AS Deactivated,
    SUM(CASE WHEN u.EmailConfirmed = 1 THEN 1 ELSE 0 END)                             AS EmailConfirmed,
    SUM(CASE WHEN u.TwoFactorEnabled = 1 THEN 1 ELSE 0 END)                           AS TwoStepOn,
    SUM(CASE WHEN u.LockoutEnd > SYSUTCDATETIME() THEN 1 ELSE 0 END)                  AS LockedOut,
    SUM(CASE WHEN a.AgeCheckStatus = N'Passed' THEN 1 ELSE 0 END)                     AS AgeChecked,
    SUM(CASE WHEN a.DateOfBirth > DATEADD(year, -18, CAST(SYSUTCDATETIME() AS date)) THEN 1 ELSE 0 END) AS UnderEighteen
FROM users.Accounts a
JOIN auth.AspNetUsers u ON LOWER(u.Id) = LOWER(CONVERT(nvarchar(36), a.Id));
GO

-- New accounts per day (UTC).
CREATE OR ALTER VIEW reporting.SignUpsByDay AS
SELECT CAST(CreatedAt AS date) AS Day, COUNT(*) AS SignUps
FROM users.Accounts
GROUP BY CAST(CreatedAt AS date);
GO

-- Deactivations per day (accounts deleted after their 90 days no longer appear).
CREATE OR ALTER VIEW reporting.DeactivationsByDay AS
SELECT CAST(DeactivatedAt AS date) AS Day, COUNT(*) AS Deactivations
FROM users.Accounts
WHERE DeactivatedAt IS NOT NULL
GROUP BY CAST(DeactivatedAt AS date);
GO

-- Age bands from the declared date of birth (13+ only can sign up).
CREATE OR ALTER VIEW reporting.AgeBands AS
WITH ages AS (
    SELECT CASE
        WHEN DateOfBirth IS NULL THEN NULL
        ELSE DATEDIFF(year, DateOfBirth, CAST(SYSUTCDATETIME() AS date))
             - CASE WHEN DATEADD(year, DATEDIFF(year, DateOfBirth, CAST(SYSUTCDATETIME() AS date)), DateOfBirth)
                         > CAST(SYSUTCDATETIME() AS date) THEN 1 ELSE 0 END
    END AS Age
    FROM users.Accounts
)
SELECT Band, SortOrder, COUNT(*) AS Accounts
FROM (
    SELECT
        CASE WHEN Age IS NULL THEN N'Not given' WHEN Age < 16 THEN N'13–15' WHEN Age < 18 THEN N'16–17'
             WHEN Age < 25 THEN N'18–24' WHEN Age < 35 THEN N'25–34' WHEN Age < 45 THEN N'35–44'
             WHEN Age < 55 THEN N'45–54' WHEN Age < 65 THEN N'55–64' ELSE N'65+' END AS Band,
        CASE WHEN Age IS NULL THEN 9 WHEN Age < 16 THEN 1 WHEN Age < 18 THEN 2 WHEN Age < 25 THEN 3
             WHEN Age < 35 THEN 4 WHEN Age < 45 THEN 5 WHEN Age < 55 THEN 6 WHEN Age < 65 THEN 7 ELSE 8 END AS SortOrder
    FROM ages
) banded
GROUP BY Band, SortOrder;
GO

-- How people sign in: password only, or a linked Google, Apple or Facebook account.
CREATE OR ALTER VIEW reporting.SignInMethods AS
SELECT Method, COUNT(*) AS Accounts
FROM (
    SELECT COALESCE(l.ProviderDisplayName, l.LoginProvider, N'Password only') AS Method
    FROM auth.AspNetUsers u
    LEFT JOIN auth.AspNetUserLogins l ON l.UserId = u.Id
) m
GROUP BY Method;
GO

-- Age checks for sensitive posts, by result and how they were done.
CREATE OR ALTER VIEW reporting.AgeChecks AS
SELECT AgeCheckStatus AS Status, COALESCE(AgeCheckMethod, N'—') AS Method, COUNT(*) AS Accounts
FROM users.Accounts
WHERE AgeCheckStatus <> N'NotChecked'
GROUP BY AgeCheckStatus, COALESCE(AgeCheckMethod, N'—');
GO

-- Staff roles (moderators and admins).
CREATE OR ALTER VIEW reporting.StaffRoles AS
SELECT r.Name AS Role, COUNT(ur.UserId) AS People
FROM auth.AspNetRoles r
LEFT JOIN auth.AspNetUserRoles ur ON ur.RoleId = r.Id
GROUP BY r.Name;
GO

-- Lifecycle events waiting to reach bjk-core (should stay near zero).
CREATE OR ALTER VIEW reporting.OutboxBacklog AS
SELECT COUNT(*) AS Waiting, MIN(OccurredAt) AS OldestAt
FROM users.Outbox
WHERE PublishedAt IS NULL;
GO

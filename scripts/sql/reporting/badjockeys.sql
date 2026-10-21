-- Reporting views for the app database (badjockeys). Reports (Power BI when deployed) read only these, through the
-- read-only bjk_reporting login: counts and groupings, never emails, handles, ids or report details. Place names
-- are the public ones shown on posts. Safe to run again. Applied by scripts/sql/reporting/apply.mjs (the setup does it locally).
SET NOCOUNT ON;
GO
IF SCHEMA_ID(N'reporting') IS NULL EXEC (N'CREATE SCHEMA reporting AUTHORIZATION dbo');
GO

-- ---------- People ----------

CREATE OR ALTER VIEW reporting.ProfilesByDay AS
SELECT CAST(CreatedAt AS date) AS Day, COUNT(*) AS Profiles
FROM profiles.Profiles
GROUP BY CAST(CreatedAt AS date);
GO

-- One row: profiles, and how many people posted, commented or reacted in the last 30 days.
CREATE OR ALTER VIEW reporting.PeopleSummary AS
SELECT
    (SELECT COUNT(*) FROM profiles.Profiles WHERE DeactivatedAt IS NULL) AS Profiles,
    (SELECT COUNT(DISTINCT AuthorId) FROM posts.Posts WHERE CreatedAt >= DATEADD(day, -30, SYSUTCDATETIME())) AS PostersLast30Days,
    (SELECT COUNT(DISTINCT AuthorId) FROM posts.Comments WHERE CreatedAt >= DATEADD(day, -30, SYSUTCDATETIME())) AS CommentersLast30Days,
    (SELECT COUNT(DISTINCT UserId) FROM posts.Reactions WHERE CreatedAt >= DATEADD(day, -30, SYSUTCDATETIME())) AS ReactorsLast30Days;
GO

-- Road user type, only as chosen on profiles (private by default; counted, never shown per person).
CREATE OR ALTER VIEW reporting.RoadUsers AS
SELECT COALESCE(RoadUser, N'Not given') AS RoadUser, COUNT(*) AS Profiles
FROM profiles.Profiles
WHERE DeactivatedAt IS NULL
GROUP BY COALESCE(RoadUser, N'Not given');
GO

-- ---------- Posts ----------

CREATE OR ALTER VIEW reporting.PostsByDay AS
SELECT
    CAST(CreatedAt AS date) AS Day,
    COUNT(*) AS Posts,
    SUM(CASE WHEN HasVideo = 1 THEN 1 ELSE 0 END) AS VideoPosts,
    SUM(CASE WHEN HasVideo = 0 THEN 1 ELSE 0 END) AS PhotoPosts
FROM posts.Posts
GROUP BY CAST(CreatedAt AS date);
GO

-- One row: posts by state now.
CREATE OR ALTER VIEW reporting.PostSummary AS
SELECT
    SUM(CASE WHEN Status = N'Published' AND MediaState = N'Ready' THEN 1 ELSE 0 END) AS Live,
    SUM(CASE WHEN Status = N'Published' AND MediaState = N'Pending' THEN 1 ELSE 0 END) AS Processing,
    SUM(CASE WHEN Status = N'HeldForReview' THEN 1 ELSE 0 END) AS HeldForReview,
    SUM(CASE WHEN Status = N'Hidden' THEN 1 ELSE 0 END) AS Hidden,
    SUM(CASE WHEN Status = N'Deleted' THEN 1 ELSE 0 END) AS Deleted,
    SUM(CASE WHEN Status = N'Published' AND IsSensitive = 1 THEN 1 ELSE 0 END) AS Sensitive,
    SUM(CASE WHEN Status = N'Published' AND VehicleType IS NOT NULL THEN 1 ELSE 0 END) AS WithVehicle,
    SUM(CASE WHEN Status = N'Published' AND ReportedToPolice = 1 THEN 1 ELSE 0 END) AS ReportedToPolice
FROM posts.Posts;
GO

-- Live posts by their main type of bad driving.
CREATE OR ALTER VIEW reporting.PostsByType AS
SELECT Category AS Type, COUNT(*) AS Posts
FROM posts.Posts
WHERE Status = N'Published'
GROUP BY Category;
GO

-- Places with the most live posts.
CREATE OR ALTER VIEW reporting.TopPlaces AS
SELECT TOP (25) PlaceName AS Place, COUNT(*) AS Posts, MAX(CreatedAt) AS LatestPost
FROM posts.Posts
WHERE Status = N'Published' AND PlaceName IS NOT NULL AND PlaceName <> N''
GROUP BY PlaceName
ORDER BY COUNT(*) DESC, MAX(CreatedAt) DESC;
GO

-- When incidents happen: weekday and hour (UTC) of the incident time.
CREATE OR ALTER VIEW reporting.IncidentTimes AS
SELECT
    DATENAME(weekday, IncidentAt) AS Weekday,
    (DATEPART(weekday, IncidentAt) + @@DATEFIRST + 5) % 7 + 1 AS WeekdayNumber, -- Monday = 1
    DATEPART(hour, IncidentAt) AS Hour,
    COUNT(*) AS Incidents
FROM posts.Posts
WHERE Status = N'Published'
GROUP BY DATENAME(weekday, IncidentAt), (DATEPART(weekday, IncidentAt) + @@DATEFIRST + 5) % 7 + 1, DATEPART(hour, IncidentAt);
GO

-- ---------- Photos and videos ----------

CREATE OR ALTER VIEW reporting.MediaByDay AS
SELECT
    CAST(CreatedAt AS date) AS Day,
    SUM(CASE WHEN MediaType = N'Video' THEN 1 ELSE 0 END) AS Videos,
    SUM(CASE WHEN MediaType = N'Image' THEN 1 ELSE 0 END) AS Photos,
    SUM(CASE WHEN Status = N'Failed' THEN 1 ELSE 0 END) AS Failed
FROM media.Media
GROUP BY CAST(CreatedAt AS date);
GO

-- Photos and videos by state now (NeedsReview: blurring wasn't sure, a moderator checks).
CREATE OR ALTER VIEW reporting.MediaStates AS
SELECT MediaType, Status, COUNT(*) AS Items
FROM media.Media
GROUP BY MediaType, Status;
GO

-- How long processing took (upload finished to processed), per day and type, in seconds.
CREATE OR ALTER VIEW reporting.ProcessingTimes AS
SELECT
    CAST(ProcessedAt AS date) AS Day,
    MediaType,
    COUNT(*) AS Items,
    AVG(CAST(DATEDIFF(millisecond, UploadedAt, ProcessedAt) AS float)) / 1000 AS AverageSeconds,
    MAX(DATEDIFF(second, UploadedAt, ProcessedAt)) AS SlowestSeconds,
    SUM(COALESCE(FacesBlurred, 0)) AS FacesBlurred,
    SUM(COALESCE(PlatesBlurred, 0)) AS PlatesBlurred
FROM media.Media
WHERE ProcessedAt IS NOT NULL AND UploadedAt IS NOT NULL
GROUP BY CAST(ProcessedAt AS date), MediaType;
GO

-- ---------- Conversation ----------

CREATE OR ALTER VIEW reporting.CommentsByDay AS
SELECT
    CAST(CreatedAt AS date) AS Day,
    SUM(CASE WHEN ParentCommentId IS NULL THEN 1 ELSE 0 END) AS Comments,
    SUM(CASE WHEN ParentCommentId IS NOT NULL THEN 1 ELSE 0 END) AS Replies,
    SUM(CASE WHEN Status = N'HeldForReview' OR IsFlagged = 1 THEN 1 ELSE 0 END) AS HeldOrFlagged
FROM posts.Comments
GROUP BY CAST(CreatedAt AS date);
GO

CREATE OR ALTER VIEW reporting.ReactionsByDay AS
SELECT Day, SUM(OnPosts) AS OnPosts, SUM(OnComments) AS OnComments
FROM (
    SELECT CAST(CreatedAt AS date) AS Day, 1 AS OnPosts, 0 AS OnComments FROM posts.Reactions
    UNION ALL
    SELECT CAST(CreatedAt AS date), 0, 1 FROM posts.CommentReactions
) r
GROUP BY Day;
GO

CREATE OR ALTER VIEW reporting.ReactionTypes AS
SELECT Type, COUNT(*) AS Reactions
FROM posts.Reactions
GROUP BY Type;
GO

CREATE OR ALTER VIEW reporting.ReelPlaysByDay AS
SELECT CAST(Day AS date) AS Day, SUM(Plays) AS Plays
FROM posts.ReelPlayDailyCounts
GROUP BY Day;
GO

-- ---------- Safety ----------

CREATE OR ALTER VIEW reporting.ReportsByDay AS
SELECT
    CAST(CreatedAt AS date) AS Day,
    COUNT(*) AS Reports,
    SUM(CASE WHEN Priority = N'Urgent' THEN 1 ELSE 0 END) AS Urgent
FROM posts.Reports
GROUP BY CAST(CreatedAt AS date);
GO

-- Open reports by what and why, and how many are past their target time (4 h urgent, 48 h otherwise).
CREATE OR ALTER VIEW reporting.OpenReports AS
SELECT
    TargetType AS Reported,
    Reason,
    Priority,
    COUNT(*) AS OpenReports,
    SUM(CASE WHEN DueAt < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS Overdue
FROM posts.Reports
WHERE Status = N'Open'
GROUP BY TargetType, Reason, Priority;
GO

-- Decided reports per week: how many, and how long a decision took on average, by priority.
CREATE OR ALTER VIEW reporting.ReportDecisions AS
SELECT
    DATEADD(day, -((DATEPART(weekday, ResolvedAt) + @@DATEFIRST + 5) % 7), CAST(ResolvedAt AS date)) AS WeekStarting,
    Priority,
    COUNT(*) AS Decided,
    AVG(CAST(DATEDIFF(minute, CreatedAt, ResolvedAt) AS float)) / 60 AS AverageHours,
    SUM(CASE WHEN ResolvedAt > DueAt THEN 1 ELSE 0 END) AS Late
FROM posts.Reports
WHERE ResolvedAt IS NOT NULL
GROUP BY DATEADD(day, -((DATEPART(weekday, ResolvedAt) + @@DATEFIRST + 5) % 7), CAST(ResolvedAt AS date)), Priority;
GO

-- Moderation actions per day, by action.
CREATE OR ALTER VIEW reporting.ModerationByDay AS
SELECT CAST(OccurredAt AS date) AS Day, Action, COUNT(*) AS Actions
FROM posts.ModerationAuditLog
GROUP BY CAST(OccurredAt AS date), Action;
GO

-- ---------- Other features ----------

-- One row: drafts waiting, and area alerts by how they're sent.
CREATE OR ALTER VIEW reporting.FeatureUse AS
SELECT
    (SELECT COUNT(*) FROM posts.Drafts) AS Drafts,
    (SELECT COUNT(DISTINCT AuthorId) FROM posts.Drafts) AS PeopleWithDrafts,
    (SELECT COUNT(*) FROM notifications.AreaSubscriptions WHERE Enabled = 1) AS AreaAlertsOn,
    (SELECT COUNT(*) FROM notifications.AreaSubscriptions WHERE Enabled = 1 AND Mode = N'Instant') AS InstantAlerts,
    (SELECT COUNT(*) FROM notifications.AreaSubscriptions WHERE Enabled = 1 AND Email = 1) AS EmailedAlerts,
    (SELECT COUNT(*) FROM posts.PostPassengers WHERE Status = N'Accepted') AS AcceptedPassengerTags;
GO

-- Queue health: messages waiting, and dead letters (the .failed tables, which should stay at 0). The API creates
-- these tables on its first start, so apply this after it has run once.
CREATE OR ALTER VIEW reporting.QueueBacklog AS
SELECT N'Photos and videos to process' AS Queue, N'Waiting' AS Kind, COUNT(*) AS Messages FROM messaging.[media.process]
UNION ALL SELECT N'Photos and videos to process', N'Failed', COUNT(*) FROM messaging.[media.process.failed]
UNION ALL SELECT N'Media ready or failed (to Posts)', N'Waiting', COUNT(*) FROM messaging.[bjk-core.media-events]
UNION ALL SELECT N'Media ready or failed (to Posts)', N'Failed', COUNT(*) FROM messaging.[bjk-core.media-events.failed]
UNION ALL SELECT N'Account changes (from the identity server)', N'Waiting', COUNT(*) FROM messaging.[bjk-core.user-events]
UNION ALL SELECT N'Account changes (from the identity server)', N'Failed', COUNT(*) FROM messaging.[bjk-core.user-events.failed];
GO

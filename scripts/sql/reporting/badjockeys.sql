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

-- The road user type was removed (22 Oct 2026).
DROP VIEW IF EXISTS reporting.RoadUsers;
GO

-- ---------- Incidents (for Ask AI and reports) ----------
-- Every live incident with all its details, one row per incident and subcategory (owner, 23 Oct 2026). Ask Bad
-- Jockeys (the AI chat) reads reporting.Incidents and reporting.Subcategories through the bjk_chat login and nothing
-- else. No ids, authors, titles, descriptions or exact pins: an incident's place is its public place name and a
-- square of about 1 km. A live view for now; if it gets slow it can become a table with the same columns.

-- The 74 subcategories of bad driving in their 13 groups (IncidentTaxonomy in BJK.Modules; regenerate this list when
-- it changes). Position = the subcategory's bit in posts.Posts.TypeFlags (0-63) and TypeFlagsHigh (64-127).
CREATE OR ALTER VIEW reporting.Subcategories AS
SELECT CAST(Position AS tinyint) AS Position, CAST(Subcategory AS nvarchar(40)) AS Subcategory,
    CAST(SubcategoryLabel AS nvarchar(80)) AS SubcategoryLabel, CAST([Group] AS nvarchar(30)) AS [Group],
    CAST(GroupLabel AS nvarchar(60)) AS GroupLabel, BitLow, BitHigh
FROM (VALUES
    (0, N'DisabledBay', N'Disabled bay, no badge showing', N'Parking', N'Parking', CAST(1 AS bigint), CAST(0 AS bigint)),
    (1, N'PavementParking', N'Parked on the pavement', N'Parking', N'Parking', CAST(2 AS bigint), CAST(0 AS bigint)),
    (2, N'DoubleYellows', N'On double yellow lines', N'Parking', N'Parking', CAST(4 AS bigint), CAST(0 AS bigint)),
    (3, N'SchoolZigZags', N'On school zig-zags', N'Parking', N'Parking', CAST(8 AS bigint), CAST(0 AS bigint)),
    (4, N'BlockingDriveway', N'Blocking a driveway or dropped kerb', N'Parking', N'Parking', CAST(16 AS bigint), CAST(0 AS bigint)),
    (5, N'BusStopOrLane', N'In a bus stop or bus lane', N'Parking', N'Parking', CAST(32 AS bigint), CAST(0 AS bigint)),
    (6, N'ParentAndChildBay', N'Parent and child bay, no child', N'Parking', N'Parking', CAST(64 AS bigint), CAST(0 AS bigint)),
    (7, N'AcrossTwoBays', N'Across two bays', N'Parking', N'Parking', CAST(128 AS bigint), CAST(0 AS bigint)),
    (8, N'EvChargingBay', N'EV charging bay, not charging', N'Parking', N'Parking', CAST(256 AS bigint), CAST(0 AS bigint)),
    (9, N'ParkingOther', N'Parking: other', N'Parking', N'Parking', CAST(512 AS bigint), CAST(0 AS bigint)),
    (10, N'SpeedingInTown', N'Speeding in a 20 or 30', N'Speeding', N'Speeding', CAST(1024 AS bigint), CAST(0 AS bigint)),
    (11, N'SpeedingFastRoad', N'Speeding on a fast road', N'Speeding', N'Speeding', CAST(2048 AS bigint), CAST(0 AS bigint)),
    (12, N'SpeedingSchool', N'Speeding past a school', N'Speeding', N'Speeding', CAST(4096 AS bigint), CAST(0 AS bigint)),
    (13, N'StreetRacing', N'Street racing', N'Speeding', N'Speeding', CAST(8192 AS bigint), CAST(0 AS bigint)),
    (14, N'SpeedingOther', N'Speeding: other', N'Speeding', N'Speeding', CAST(16384 AS bigint), CAST(0 AS bigint)),
    (15, N'OvertakeIntoOncoming', N'Into oncoming traffic', N'Overtaking', N'Overtaking', CAST(32768 AS bigint), CAST(0 AS bigint)),
    (16, N'OvertakeOnBend', N'On a bend or a crest', N'Overtaking', N'Overtaking', CAST(65536 AS bigint), CAST(0 AS bigint)),
    (17, N'OvertakeSolidWhite', N'Over solid white lines', N'Overtaking', N'Overtaking', CAST(131072 AS bigint), CAST(0 AS bigint)),
    (18, N'OvertakeAtJunction', N'At a crossing or junction', N'Overtaking', N'Overtaking', CAST(262144 AS bigint), CAST(0 AS bigint)),
    (19, N'Undertaking', N'Undertaking', N'Overtaking', N'Overtaking', CAST(524288 AS bigint), CAST(0 AS bigint)),
    (20, N'OvertakingOther', N'Overtaking: other', N'Overtaking', N'Overtaking', CAST(1048576 AS bigint), CAST(0 AS bigint)),
    (21, N'PulledOut', N'Pulled out in front', N'Junctions', N'Junctions and roundabouts', CAST(2097152 AS bigint), CAST(0 AS bigint)),
    (22, N'WrongLaneRoundabout', N'Wrong lane at a roundabout', N'Junctions', N'Junctions and roundabouts', CAST(4194304 AS bigint), CAST(0 AS bigint)),
    (23, N'RanStopOrGiveWay', N'Ran a stop or give way sign', N'Junctions', N'Junctions and roundabouts', CAST(8388608 AS bigint), CAST(0 AS bigint)),
    (24, N'BlockingYellowBox', N'Blocking a yellow box junction', N'Junctions', N'Junctions and roundabouts', CAST(16777216 AS bigint), CAST(0 AS bigint)),
    (25, N'CuttingCorner', N'Cutting a corner', N'Junctions', N'Junctions and roundabouts', CAST(33554432 AS bigint), CAST(0 AS bigint)),
    (26, N'NoSignal', N'No signal', N'Junctions', N'Junctions and roundabouts', CAST(67108864 AS bigint), CAST(0 AS bigint)),
    (27, N'JunctionsOther', N'Junctions and roundabouts: other', N'Junctions', N'Junctions and roundabouts', CAST(134217728 AS bigint), CAST(0 AS bigint)),
    (28, N'MiddleLaneHogging', N'Middle lane hogging', N'LaneDiscipline', N'Lane discipline', CAST(268435456 AS bigint), CAST(0 AS bigint)),
    (29, N'Weaving', N'Weaving through traffic', N'LaneDiscipline', N'Lane discipline', CAST(536870912 AS bigint), CAST(0 AS bigint)),
    (30, N'PushingInAtMerge', N'Pushing in at a merge', N'LaneDiscipline', N'Lane discipline', CAST(1073741824 AS bigint), CAST(0 AS bigint)),
    (31, N'StraddlingLanes', N'Straddling two lanes', N'LaneDiscipline', N'Lane discipline', CAST(2147483648 AS bigint), CAST(0 AS bigint)),
    (32, N'BusOrCycleLane', N'Driving in a bus or cycle lane', N'LaneDiscipline', N'Lane discipline', CAST(4294967296 AS bigint), CAST(0 AS bigint)),
    (33, N'LaneDisciplineOther', N'Lane discipline: other', N'LaneDiscipline', N'Lane discipline', CAST(8589934592 AS bigint), CAST(0 AS bigint)),
    (34, N'Tailgating', N'Tailgating', N'FollowingTooClose', N'Following too close', CAST(17179869184 AS bigint), CAST(0 AS bigint)),
    (35, N'BrakeTesting', N'Brake testing', N'FollowingTooClose', N'Following too close', CAST(34359738368 AS bigint), CAST(0 AS bigint)),
    (36, N'FollowingOther', N'Following too close: other', N'FollowingTooClose', N'Following too close', CAST(68719476736 AS bigint), CAST(0 AS bigint)),
    (37, N'PhoneInHand', N'Phone in hand', N'Distraction', N'Distraction', CAST(137438953472 AS bigint), CAST(0 AS bigint)),
    (38, N'EatingSmokingScreen', N'Eating, smoking or a screen', N'Distraction', N'Distraction', CAST(274877906944 AS bigint), CAST(0 AS bigint)),
    (39, N'NotLooking', N'Not looking', N'Distraction', N'Distraction', CAST(549755813888 AS bigint), CAST(0 AS bigint)),
    (40, N'DistractionOther', N'Distraction: other', N'Distraction', N'Distraction', CAST(1099511627776 AS bigint), CAST(0 AS bigint)),
    (41, N'RanRedLight', N'Ran a red light', N'RedLightsAndCrossings', N'Red lights and crossings', CAST(2199023255552 AS bigint), CAST(0 AS bigint)),
    (42, N'RanPedestrianCrossing', N'Ran a pedestrian crossing', N'RedLightsAndCrossings', N'Red lights and crossings', CAST(4398046511104 AS bigint), CAST(0 AS bigint)),
    (43, N'LevelCrossing', N'Level crossing', N'RedLightsAndCrossings', N'Red lights and crossings', CAST(8796093022208 AS bigint), CAST(0 AS bigint)),
    (44, N'WrongWayOneWay', N'Wrong way down a one-way street', N'RedLightsAndCrossings', N'Red lights and crossings', CAST(17592186044416 AS bigint), CAST(0 AS bigint)),
    (45, N'RedLightsOther', N'Red lights and crossings: other', N'RedLightsAndCrossings', N'Red lights and crossings', CAST(35184372088832 AS bigint), CAST(0 AS bigint)),
    (46, N'ClosePassCyclist', N'Close pass of a cyclist', N'VulnerableRoadUsers', N'Cyclists, pedestrians and riders', CAST(70368744177664 AS bigint), CAST(0 AS bigint)),
    (47, N'ClosePassHorse', N'Close pass of a horse rider', N'VulnerableRoadUsers', N'Cyclists, pedestrians and riders', CAST(140737488355328 AS bigint), CAST(0 AS bigint)),
    (48, N'IgnoredPedestrian', N'Ignored a pedestrian at a crossing', N'VulnerableRoadUsers', N'Cyclists, pedestrians and riders', CAST(281474976710656 AS bigint), CAST(0 AS bigint)),
    (49, N'DoorOpened', N'Car door opened into traffic', N'VulnerableRoadUsers', N'Cyclists, pedestrians and riders', CAST(562949953421312 AS bigint), CAST(0 AS bigint)),
    (50, N'CyclistRidingDangerously', N'Cyclist riding dangerously', N'VulnerableRoadUsers', N'Cyclists, pedestrians and riders', CAST(1125899906842624 AS bigint), CAST(0 AS bigint)),
    (51, N'PedestrianSteppedOut', N'Pedestrian stepped out', N'VulnerableRoadUsers', N'Cyclists, pedestrians and riders', CAST(2251799813685248 AS bigint), CAST(0 AS bigint)),
    (52, N'VulnerableOther', N'Cyclists, pedestrians and riders: other', N'VulnerableRoadUsers', N'Cyclists, pedestrians and riders', CAST(4503599627370496 AS bigint), CAST(0 AS bigint)),
    (53, N'ShoutingOrGestures', N'Shouting or gestures', N'RoadRage', N'Road rage', CAST(9007199254740992 AS bigint), CAST(0 AS bigint)),
    (54, N'FollowingOrChasing', N'Following or chasing', N'RoadRage', N'Road rage', CAST(18014398509481984 AS bigint), CAST(0 AS bigint)),
    (55, N'GotOutOfVehicle', N'Got out of the vehicle', N'RoadRage', N'Road rage', CAST(36028797018963968 AS bigint), CAST(0 AS bigint)),
    (56, N'DeliberatelyBlocking', N'Deliberately blocking', N'RoadRage', N'Road rage', CAST(72057594037927936 AS bigint), CAST(0 AS bigint)),
    (57, N'RoadRageOther', N'Road rage: other', N'RoadRage', N'Road rage', CAST(144115188075855872 AS bigint), CAST(0 AS bigint)),
    (58, N'Collision', N'Collision', N'Collisions', N'Collisions and near misses', CAST(288230376151711744 AS bigint), CAST(0 AS bigint)),
    (59, N'NearMiss', N'Near miss', N'Collisions', N'Collisions and near misses', CAST(576460752303423488 AS bigint), CAST(0 AS bigint)),
    (60, N'FailedToStop', N'Failed to stop after a collision', N'Collisions', N'Collisions and near misses', CAST(1152921504606846976 AS bigint), CAST(0 AS bigint)),
    (61, N'LostControl', N'Lost control', N'Collisions', N'Collisions and near misses', CAST(2305843009213693952 AS bigint), CAST(0 AS bigint)),
    (62, N'CollisionsOther', N'Collisions and near misses: other', N'Collisions', N'Collisions and near misses', CAST(4611686018427387904 AS bigint), CAST(0 AS bigint)),
    (63, N'NoLightsAtNight', N'No lights at night', N'VehiclesAndDrivers', N'Vehicles and drivers', CAST(-9223372036854775808 AS bigint), CAST(0 AS bigint)),
    (64, N'UnsafeLoad', N'Unsafe or falling load', N'VehiclesAndDrivers', N'Vehicles and drivers', CAST(0 AS bigint), CAST(1 AS bigint)),
    (65, N'UnroadworthyVehicle', N'Unroadworthy vehicle', N'VehiclesAndDrivers', N'Vehicles and drivers', CAST(0 AS bigint), CAST(2 AS bigint)),
    (66, N'LearnerMistake', N'Learner or new driver mistake', N'VehiclesAndDrivers', N'Vehicles and drivers', CAST(0 AS bigint), CAST(4 AS bigint)),
    (67, N'LorryOrBusDriving', N'Lorry or bus driving', N'VehiclesAndDrivers', N'Vehicles and drivers', CAST(0 AS bigint), CAST(8 AS bigint)),
    (68, N'VehiclesOther', N'Vehicles and drivers: other', N'VehiclesAndDrivers', N'Vehicles and drivers', CAST(0 AS bigint), CAST(16 AS bigint)),
    (69, N'ClosedLaneRedX', N'Driving in a closed lane (red X)', N'Motorways', N'Motorways', CAST(0 AS bigint), CAST(32 AS bigint)),
    (70, N'HardShoulderMisuse', N'Misusing the hard shoulder', N'Motorways', N'Motorways', CAST(0 AS bigint), CAST(64 AS bigint)),
    (71, N'StoppingOnMotorway', N'Stopping or reversing on a motorway', N'Motorways', N'Motorways', CAST(0 AS bigint), CAST(128 AS bigint)),
    (72, N'WrongWayDriver', N'Wrong-way driver', N'Motorways', N'Motorways', CAST(0 AS bigint), CAST(256 AS bigint)),
    (73, N'MotorwaysOther', N'Motorways: other', N'Motorways', N'Motorways', CAST(0 AS bigint), CAST(512 AS bigint))
) AS s (Position, Subcategory, SubcategoryLabel, [Group], GroupLabel, BitLow, BitHigh);
GO

CREATE OR ALTER VIEW reporting.Incidents AS
-- Count incidents with WHERE IsMainType = 1 (each incident has exactly one main subcategory); count all rows to count
-- by subcategory (an incident with three subcategories has three rows).
SELECT
    CAST(CASE WHEN s.Subcategory = p.Category THEN 1 ELSE 0 END AS bit) AS IsMainType,
    s.Subcategory, s.SubcategoryLabel, s.[Group], s.GroupLabel,
    CAST(t.LocalTime AS date) AS IncidentDate,                                       -- UK date
    CAST(YEAR(t.LocalTime) AS smallint) AS IncidentYear,
    CAST(MONTH(t.LocalTime) AS tinyint) AS IncidentMonth,
    CAST(DATEDIFF(day, CAST('19000101' AS date), CAST(t.LocalTime AS date)) % 7 + 1 AS tinyint) AS Weekday, -- 1 = Monday
    DATENAME(weekday, t.LocalTime) AS WeekdayName,
    CAST(DATEPART(hour, t.LocalTime) AS tinyint) AS HourUk,                          -- 0-23, UK time
    CAST(ROUND(p.Latitude, 2) AS decimal(5, 2)) AS AreaLatitude,                     -- a square of about 1 km
    CAST(ROUND(p.Longitude, 2) AS decimal(5, 2)) AS AreaLongitude,
    p.PlaceName,
    p.VehicleType, p.VehicleMake, p.VehicleModel, p.VehicleColour,
    p.IsDark, p.ReportedToPolice, p.HasVideo,
    (SELECT COUNT(*) FROM posts.Reactions r WHERE r.PostId = p.Id) AS Reactions,
    (SELECT COUNT(*) FROM posts.Comments c WHERE c.PostId = p.Id AND c.Status = N'Visible') AS Comments,
    (SELECT COUNT(*) FROM posts.PostViews v WHERE v.PostId = p.Id) AS Views,
    (SELECT COUNT(*) FROM posts.PostViews v WHERE v.PostId = p.Id AND v.IsLocal = 1) AS LocalViews
FROM posts.Posts p
CROSS APPLY (SELECT CAST(p.IncidentAt AT TIME ZONE 'GMT Standard Time' AS datetime2(0)) AS LocalTime) t
JOIN reporting.Subcategories s
    ON (p.TypeFlags & s.BitLow) <> 0 OR (p.TypeFlagsHigh & s.BitHigh) <> 0
    -- Posts from before several types: their category alone.
    OR (p.TypeFlags = 0 AND p.TypeFlagsHigh = 0 AND s.Subcategory = p.Category)
WHERE p.Status = N'Published' AND p.MediaState = N'Ready' AND p.IsAuthorDeactivated = 0;
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

-- Live posts by every subcategory of bad driving on them (a post with three counts under each), with its group.
CREATE OR ALTER VIEW reporting.PostsByType AS
SELECT s.Subcategory AS Type, s.SubcategoryLabel AS Label, s.[Group], s.GroupLabel, COUNT(*) AS Posts
FROM posts.Posts p
JOIN reporting.Subcategories s
    ON (p.TypeFlags & s.BitLow) <> 0 OR (p.TypeFlagsHigh & s.BitHigh) <> 0
    OR (p.TypeFlags = 0 AND p.TypeFlagsHigh = 0 AND s.Subcategory = p.Category)
WHERE p.Status = N'Published'
GROUP BY s.Subcategory, s.SubcategoryLabel, s.[Group], s.GroupLabel;
GO

-- Places with the most live posts.
CREATE OR ALTER VIEW reporting.TopPlaces AS
SELECT TOP (25) PlaceName AS Place, COUNT(*) AS Posts, MAX(CreatedAt) AS LatestPost
FROM posts.Posts
WHERE Status = N'Published' AND PlaceName IS NOT NULL AND PlaceName <> N''
GROUP BY PlaceName
ORDER BY COUNT(*) DESC, MAX(CreatedAt) DESC;
GO

-- When incidents happen: weekday and hour of the incident time, in UK time (GMT or BST).
CREATE OR ALTER VIEW reporting.IncidentTimes AS
SELECT
    DATENAME(weekday, t.LocalTime) AS Weekday,
    DATEDIFF(day, CAST('19000101' AS date), CAST(t.LocalTime AS date)) % 7 + 1 AS WeekdayNumber, -- Monday = 1
    DATEPART(hour, t.LocalTime) AS Hour,
    COUNT(*) AS Incidents
FROM posts.Posts p
CROSS APPLY (SELECT CAST(p.IncidentAt AT TIME ZONE 'GMT Standard Time' AS datetime2(0)) AS LocalTime) t
WHERE p.Status = N'Published'
GROUP BY DATENAME(weekday, t.LocalTime), DATEDIFF(day, CAST('19000101' AS date), CAST(t.LocalTime AS date)) % 7 + 1, DATEPART(hour, t.LocalTime);
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

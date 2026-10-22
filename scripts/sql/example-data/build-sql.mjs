// Builds the example data SQL from data.mjs and generate.mjs. seed.mjs runs it for you; to run it by hand (Rider,
// Azure Data Studio, sqlcmd), write it to seed.sql first: node scripts/sql/example-data/build-sql.mjs
// (seed.sql isn't committed: it's several megabytes and comes straight from these scripts).

import { pbkdf2Sync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ids, OWNER_EMAIL, PASSWORD } from "./data.mjs";
import { buildExampleData } from "./generate.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const CATEGORIES = [
  "RoadRage",
  "DangerousOvertaking",
  "Tailgating",
  "MobilePhoneUse",
  "Speeding",
  "RedLightRunning",
  "CuttingUp",
  "Undertaking",
  "LaneHogging",
  "ClosePass",
  "BadParking",
  "Other",
];

const q = (value) => (value === null || value === undefined ? "NULL" : `N'${String(value).replace(/'/g, "''")}'`);
const bit = (value) => (value === null || value === undefined ? "NULL" : value ? "1" : "0");

/**
 * ASP.NET Core Identity's password hash (version 3: PBKDF2, HMAC-SHA512, 100,000 iterations), as UserManager writes
 * it. One fixed salt is fine for local example accounts.
 */
function identityHash(password) {
  const salt = Buffer.from("bad-jockeys-ex!!", "utf8");
  const subkey = pbkdf2Sync(password, salt, 100_000, 32, "sha512");
  const header = Buffer.alloc(13);
  header.writeUInt8(0x01, 0);
  header.writeUInt32BE(2, 1); // KeyDerivationPrf.HMACSHA512
  header.writeUInt32BE(100_000, 5);
  header.writeUInt32BE(salt.length, 9);
  return Buffer.concat([header, salt, subkey]).toString("base64");
}

/** A UK local date and time, `daysAgo` days back, as a datetimeoffset with the right UK offset (GMT or BST). */
const ukTime = (daysAgo, time, plusMinutes = 0) => {
  const [h, m] = time.split(":").map(Number);
  return `(DATEADD(minute, ${h * 60 + m + plusMinutes}, CAST(DATEADD(day, -${daysAgo}, @Today) AS datetime2)) AT TIME ZONE 'GMT Standard Time')`;
};

/** Roughly dark in autumn: before 07:30 or from 18:15. */
const isDark = (time) => {
  const [h, m] = time.split(":").map(Number);
  const minutes = h * 60 + m;
  return minutes < 7 * 60 + 30 || minutes >= 18 * 60 + 15;
};

// Clears the previous run first, so running it again replaces the example data: everything with an id starting
// E0000000, and what other people did to it (reactions, comments, tags, notifications). Nothing else is touched.
const clearSql = `BEGIN TRANSACTION;

DECLARE @Example TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT @Example SELECT Id FROM badjockeys.profiles.Profiles WHERE LEFT(CONVERT(char(36), Id), 8) = 'E0000000';
DECLARE @ExamplePosts TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT @ExamplePosts SELECT Id FROM badjockeys.posts.Posts WHERE LEFT(CONVERT(char(36), Id), 8) = 'E0000000';

DELETE FROM badjockeys.notifications.Notifications
WHERE LEFT(CONVERT(char(36), Id), 8) = 'E0000000'
   OR PostId IN (SELECT Id FROM @ExamplePosts) OR ActorId IN (SELECT Id FROM @Example) OR UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.notifications.AreaAlertItems WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.notifications.NotificationSettings WHERE UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.notifications.NotificationContacts WHERE UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.notifications.AreaSubscriptions WHERE UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.notifications.PushSubscriptions WHERE UserId IN (SELECT Id FROM @Example);

DELETE FROM badjockeys.posts.CommentReactions
WHERE UserId IN (SELECT Id FROM @Example)
   OR CommentId IN (SELECT Id FROM badjockeys.posts.Comments WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR AuthorId IN (SELECT Id FROM @Example));
DELETE FROM badjockeys.posts.Comments WHERE PostId IN (SELECT Id FROM @ExamplePosts) AND ParentCommentId IS NOT NULL;
DELETE FROM badjockeys.posts.Comments WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR AuthorId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.PostVotes WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.PostFollows WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.Bookmarks WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.PostViews WHERE PostId IN (SELECT Id FROM @ExamplePosts);
DELETE FROM badjockeys.posts.PostShares WHERE PostId IN (SELECT Id FROM @ExamplePosts);
DELETE FROM badjockeys.posts.AuthorPreferences WHERE UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.Reactions WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.PostPassengers WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.ReelPlays WHERE PostId IN (SELECT Id FROM @ExamplePosts);
DELETE FROM badjockeys.posts.ReelPlayDailyCounts WHERE PostId IN (SELECT Id FROM @ExamplePosts);
DELETE FROM badjockeys.posts.Appeals WHERE PostId IN (SELECT Id FROM @ExamplePosts);
DELETE FROM badjockeys.posts.Reports WHERE PostId IN (SELECT Id FROM @ExamplePosts) OR TargetId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.posts.PostHashtags WHERE PostId IN (SELECT Id FROM @ExamplePosts);
DELETE FROM badjockeys.posts.PostMedia WHERE PostId IN (SELECT Id FROM @ExamplePosts);
DELETE FROM badjockeys.posts.Posts WHERE Id IN (SELECT Id FROM @ExamplePosts);

DELETE FROM badjockeys.media.Media WHERE LEFT(CONVERT(char(36), Id), 8) = 'E0000000';
DELETE FROM badjockeys.profiles.Follows WHERE FollowerId IN (SELECT Id FROM @Example) OR FolloweeId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.profiles.Badges WHERE UserId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.profiles.Blocks WHERE BlockerId IN (SELECT Id FROM @Example) OR BlockedId IN (SELECT Id FROM @Example);
DELETE FROM badjockeys.profiles.Profiles WHERE Id IN (SELECT Id FROM @Example);

DELETE FROM idsrv.users.Accounts WHERE LEFT(CONVERT(char(36), Id), 8) = 'E0000000';
DELETE FROM idsrv.auth.AspNetUserClaims WHERE LEFT(UserId, 8) = 'e0000000';
DELETE FROM idsrv.auth.AspNetUserLogins WHERE LEFT(UserId, 8) = 'e0000000';
DELETE FROM idsrv.auth.AspNetUserRoles WHERE LEFT(UserId, 8) = 'e0000000';
DELETE FROM idsrv.auth.AspNetUserTokens WHERE LEFT(UserId, 8) = 'e0000000';
DELETE FROM idsrv.auth.AspNetUsers WHERE LEFT(Id, 8) = 'e0000000';

COMMIT;
`;

/** Multi-row INSERTs, at most 500 rows each (SQL Server allows 1,000). */
function batched(add, prefix, rows, suffix = ";") {
  for (let i = 0; i < rows.length; i += 500) {
    add(`${prefix}\n${rows.slice(i, i + 500).join(",\n")}${suffix}`);
  }
}

/** Adult dates of birth, 1960 to 2004. */
const dateOfBirth = (n) => `${1960 + ((n * 7) % 45)}-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 27) + 1).padStart(2, "0")}`;

const VOTE_HOURS = { Hours48: 48, Days7: 168, Never: null };

/** The whole script, as text. */
export function buildSql() {
  const { users, posts, homeAreas, follows, bookmarks, preferences, badges } = buildExampleData();
  const lines = [];
  const add = (text) => lines.push(text);
  const videos = posts.filter((p) => p.video).length;

  add(`-- Example users and posts for a LOCAL Bad Jockeys (never run it anywhere else). Generated by build-sql.mjs from
-- data.mjs and generate.mjs: change those rather than editing this.
--
-- Adds ${users.length} sign-in accounts (password ${PASSWORD}, email confirmed, age check passed) with profiles, home areas and
-- badges, and ${posts.length} posts around the UK (${posts.length - videos} with photos, ${videos} with a video clip), with reactions, comments and
-- replies, reactions on comments, votes, follows, bookmarks, views and shares. The photos and clips are placeholders,
-- uploaded to local file storage by seed.mjs (the setup runs it, and it runs this script).
--
-- If the owner account below exists and has a profile, one post tags it as a passenger (waiting for approval), it
-- follows a few members and some follow it. Safe to run again: it clears the previous example data first.
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @OwnerEmail nvarchar(256) = ${q(OWNER_EMAIL)};
`);
  add("-- Clear the previous run.");
  add(clearSql);
  add(`BEGIN TRANSACTION;

DECLARE @Now datetimeoffset = SYSDATETIMEOFFSET();
DECLARE @Today date = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'GMT Standard Time' AS date);
DECLARE @Owner uniqueidentifier = (
  SELECT TRY_CONVERT(uniqueidentifier, u.Id) FROM idsrv.auth.AspNetUsers u WHERE u.NormalizedEmail = UPPER(@OwnerEmail));
IF @Owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM badjockeys.profiles.Profiles WHERE Id = @Owner)
BEGIN
  PRINT 'The owner account has no profile yet, so it isn''t tagged or followed. Finish sign-up in the web app and run this again.';
  SET @Owner = NULL;
END
`);

  // --- Accounts (identity server) ---
  const hash = identityHash(PASSWORD);
  add(`-- Sign-in accounts (identity server, database idsrv).`);
  batched(
    add,
    `INSERT idsrv.auth.AspNetUsers (Id, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash,
  SecurityStamp, ConcurrencyStamp, PhoneNumber, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnd, LockoutEnabled, AccessFailedCount) VALUES`,
    users.map((u) => {
      const email = u.email.toLowerCase();
      return `(${q(ids.userId(u.n))}, ${q(email)}, ${q(email.toUpperCase())}, ${q(email)}, ${q(email.toUpperCase())}, 1, ${q(hash)}, ${q(`EXAMPLE${String(u.n).padStart(27, "0")}`)}, ${q(ids.userId(u.n + 1000))}, NULL, 0, 0, NULL, 1, 0)`;
    }),
  );
  batched(
    add,
    `INSERT idsrv.users.Accounts (Id, Status, CreatedAt, DateOfBirth, AgeCheckStatus, AgeCheckMethod, AgeCheckResult, AgeCheckRecordedAt, AgeCheckAttempts) VALUES`,
    users.map((u) => `('${ids.userId(u.n)}', N'Active', DATEADD(day, -90, @Now), '${dateOfBirth(u.n)}', N'Passed', N'FaceEstimate', N'Passed', DATEADD(day, -90, @Now), 1)`),
  );

  // --- Profiles, badges, home areas, follows ---
  add(`\n-- Profiles, badges, home areas and follows (database badjockeys).`);
  batched(
    add,
    `INSERT badjockeys.profiles.Profiles (Id, Handle, DisplayName, Bio, Location, AvatarMediaId, IsMinor, CreatedAt) VALUES`,
    users.map((u) => `('${ids.userId(u.n)}', ${q(u.handle)}, ${q(u.name)}, ${q(u.bio)}, ${q(u.location)}, NULL, 0, DATEADD(day, -90, @Now))`),
  );
  batched(
    add,
    `INSERT badjockeys.profiles.Badges (UserId, Badge, AwardedAt, AwardedBy) VALUES`,
    badges.map((b) => `('${ids.userId(b.user)}', N'${b.badge}', DATEADD(day, -${b.badge === "FoundingMember" ? 90 : 20}, @Now), NULL)`),
  );
  batched(
    add,
    `INSERT badjockeys.notifications.AreaSubscriptions (UserId, PlaceName, Latitude, Longitude, RadiusKm, Mode, Enabled, Email, IsPremium,
  PlanRecordedAt, SentDay, SentToday, LastSummaryAt, UpdatedAt) VALUES`,
    homeAreas.map((h) => `('${ids.userId(h.user)}', ${q(h.place)}, ${h.lat}, ${h.lng}, 10, N'Digest', 1, 0, 0, NULL, NULL, 0, NULL, DATEADD(day, -90, @Now))`),
  );
  batched(
    add,
    `INSERT badjockeys.profiles.Follows (FollowerId, FolloweeId, CreatedAt) VALUES`,
    follows.map((f, i) => `('${ids.userId(f.follower)}', '${ids.userId(f.followee)}', DATEADD(minute, -${(i * 37) % 120000 + 60}, @Now))`),
  );
  add(`IF @Owner IS NOT NULL
BEGIN
  INSERT badjockeys.profiles.Follows (FollowerId, FolloweeId, CreatedAt)
  SELECT @Owner, Id, DATEADD(day, -10, @Now) FROM badjockeys.profiles.Profiles
  WHERE Id IN (${[1, 2, 3, 5, 7, 8, ...users.filter((u) => u.n > 8 && u.n % 9 === 0).map((u) => u.n)].map((n) => `'${ids.userId(n)}'`).join(", ")});
  INSERT badjockeys.profiles.Follows (FollowerId, FolloweeId, CreatedAt)
  SELECT Id, @Owner, DATEADD(day, -5, @Now) FROM badjockeys.profiles.Profiles
  WHERE Id IN (${users.filter((u) => u.n % 5 === 0).map((u) => `'${ids.userId(u.n)}'`).join(", ")});
END`);
  batched(
    add,
    `INSERT badjockeys.posts.AuthorPreferences (UserId, VoteDuration, UpdatedAt) VALUES`,
    preferences.map((p) => `('${ids.userId(p.user)}', N'${p.duration}', DATEADD(day, -60, @Now))`),
  );

  // --- Media and posts ---
  // Each post's own time, kept in a table so the activity below can be written as "minutes after the post".
  add(`\n-- Posts, with their photos or clip.
DECLARE @Posts TABLE (N int PRIMARY KEY, Id uniqueidentifier, At datetimeoffset);`);
  batched(
    add,
    `INSERT @Posts (N, Id, At) VALUES`,
    posts.map((p) => `(${p.n}, '${ids.postId(p.n)}', ${ukTime(p.ago, p.time)})`),
  );
  const duration = Object.fromEntries(preferences.map((p) => [p.user, p.duration]));
  const media = [];
  const postMedia = [];
  const postRows = [];
  for (const p of posts) {
    const id = ids.postId(p.n);
    const author = ids.userId(p.by);
    const [lat, lng, place] = p.at;
    const flags = p.types.reduce((acc, t) => acc | (1 << CATEGORIES.indexOf(t)), 0);
    const [vType, vMake, vModel, vColour] = p.vehicle ?? [null, null, null, null];
    const uploaded = ukTime(p.ago, p.time, 20);
    const processed = ukTime(p.ago, p.time, 21);
    if (p.video) {
      const mediaId = ids.mediaId(p.n, 1);
      media.push(`('${mediaId}', '${author}', N'Video', N'Ready', N'dashcam-${p.n}.mp4', N'video/mp4', N'examples/${mediaId}.mp4', 1500000,
  N'examples/${mediaId}.mp4', N'examples/${mediaId}.svg', NULL, 8, 1280, 720, 0, 1, 1, ${uploaded}, ${uploaded}, ${processed})`);
      postMedia.push(`('${id}', '${mediaId}', 0)`);
    } else {
      for (let i = 1; i <= p.photos; i++) {
        const mediaId = ids.mediaId(p.n, i);
        const key = `examples/${mediaId}.svg`;
        media.push(`('${mediaId}', '${author}', N'Image', N'Ready', N'dashcam-${p.n}-${i}.jpg', N'image/svg+xml', N'${key}', 20000,
  N'${key}', N'${key}', N'${key}', NULL, 1600, 900, 0, 1, 1, ${uploaded}, ${uploaded}, ${processed})`);
        postMedia.push(`('${id}', '${mediaId}', ${i - 1})`);
      }
    }
    // Votes close by the author's preference (7 days unless they chose otherwise). Votes that closed more than a day
    // ago have had their result sent; the VoteResults job sends the rest, so a few VoteClosed notifications turn up.
    const hours = VOTE_HOURS[duration[p.by] ?? "Days7"];
    const closesAt = hours === null ? "NULL" : ukTime(p.ago, p.time, 22 + hours * 60);
    const sentAt = hours !== null && p.ago * 24 - hours > 24 ? ukTime(p.ago, p.time, 30 + hours * 60) : "NULL";
    const reactionCount = Object.values(p.reactions).flat().length;
    postRows.push(`('${id}', '${author}', ${q(p.title)}, ${q(p.text)}, ${q(p.types[0])}, ${flags}, ${ukTime(p.ago, p.time)}, ${lat}, ${lng}, ${q(place)},
  N'Published', N'Ready', ${ukTime(p.ago, p.time, 22)}, ${bit(Boolean(p.video))}, 0, 0, 0, ${p.video ? reactionCount + p.comments.length : 0}, N'None', N'None',
  ${bit(isDark(p.time))}, ${bit(p.reported)}, ${q(vType)}, ${q(vMake)}, ${q(vModel)}, ${q(vColour)}, ${closesAt}, ${sentAt}, ${ukTime(p.ago, p.time, 22)})`);
  }
  batched(
    add,
    `INSERT badjockeys.media.Media (Id, UserId, MediaType, Status, OriginalFileName, OriginalContentType, OriginalKey, OriginalSizeBytes,
  PlaybackKey, ThumbnailKey, FeedKey, DurationSeconds, Width, Height, IsRestricted, ProcessingAttempts, Revision, CreatedAt, UploadedAt, ProcessedAt) VALUES`,
    media,
  );
  batched(
    add,
    `INSERT badjockeys.posts.Posts (Id, AuthorId, Title, Description, Category, TypeFlags, IncidentAt, Latitude, Longitude, PlaceName,
  Status, MediaState, MediaReadyAt, HasVideo, IsAuthorDeactivated, IsFlagged, IsSensitive, ReelScore, SensitiveReview, SensitiveSource,
  IsDark, ReportedToPolice, VehicleType, VehicleMake, VehicleModel, VehicleColour, VoteClosesAt, VoteResultSentAt, CreatedAt) VALUES`,
    postRows,
  );
  batched(add, `INSERT badjockeys.posts.PostMedia (PostId, MediaId, Position) VALUES`, postMedia);

  // --- Activity, as minutes after each post ---
  // Rows are (post number, ..., minutes after the post), joined to @Posts for the id and time.
  const activity = (comment, insert, columns, select, rows) => {
    add(`\n-- ${comment}`);
    batched(add, `${insert}\nSELECT ${select}\nFROM (VALUES`, rows, `) AS v(${columns})\nJOIN @Posts p ON p.N = v.N;`);
  };
  const reactions = [];
  const comments = [];
  const commentReactions = [];
  const votes = [];
  const followers = [];
  const views = [];
  const shares = [];
  for (const p of posts) {
    let m = 40;
    for (const [type, who] of Object.entries(p.reactions)) {
      for (const u of who) reactions.push(`(${p.n}, '${ids.userId(u)}', N'${type}', ${m++})`);
    }
    // Parents first, so a reply never points at a comment that isn't there yet.
    const ordered = [...p.comments.filter((c) => !c.parent), ...p.comments.filter((c) => c.parent)];
    for (const c of ordered) {
      comments.push(`(${p.n}, '${c.id}', '${ids.userId(c.by)}', ${q(c.text)}, ${c.parent ? `'${c.parent}'` : "NULL"}, ${c.minute})`);
      let r = c.minute + 5;
      for (const [type, who] of Object.entries(c.reactions)) {
        for (const u of who) commentReactions.push(`(${p.n}, '${c.id}', '${ids.userId(u)}', N'${type}', ${r++})`);
      }
    }
    for (const v of p.votes) votes.push(`(${p.n}, '${ids.userId(v.user)}', N'${v.choice}', ${v.minute})`);
    for (const u of p.followers) followers.push(`(${p.n}, '${ids.userId(u)}', ${u === p.by ? 0 : 60})`);
    for (const v of p.views) views.push(`(${p.n}, '${v.key}', ${bit(v.isLocal)}, ${v.minute})`);
    for (const s of p.shares) shares.push(`(${p.n}, '${s.key}', ${s.minute})`);
  }
  // Nothing is dated in the future: activity on recent posts is capped at the time the script runs.
  const at = (minutes) => `(SELECT MIN(t) FROM (VALUES (DATEADD(minute, ${minutes}, p.At)), (DATEADD(minute, -5, @Now))) AS x(t))`;
  activity("Reactions.", `INSERT badjockeys.posts.Reactions (PostId, UserId, Type, CreatedAt)`, "N, U, T, M", `p.Id, v.U, v.T, ${at("v.M")}`, reactions);
  activity(
    "Comments and replies.",
    `INSERT badjockeys.posts.Comments (Id, PostId, AuthorId, Body, Status, ParentCommentId, IsAuthorDeactivated, IsFlagged, CreatedAt)`,
    "N, C, U, B, P, M",
    `v.C, p.Id, v.U, v.B, N'Visible', v.P, 0, 0, ${at("v.M")}`,
    comments,
  );
  activity(
    "Reactions on comments.",
    `INSERT badjockeys.posts.CommentReactions (CommentId, UserId, Type, CreatedAt)`,
    "N, C, U, T, M",
    `v.C, v.U, v.T, ${at("v.M")}`,
    commentReactions,
  );
  activity("Votes.", `INSERT badjockeys.posts.PostVotes (PostId, UserId, Choice, CreatedAt, UpdatedAt)`, "N, U, C, M", `p.Id, v.U, v.C, ${at("v.M")}, NULL`, votes);
  activity("Followed posts.", `INSERT badjockeys.posts.PostFollows (PostId, UserId, CreatedAt)`, "N, U, M", `p.Id, v.U, ${at("v.M")}`, followers);
  activity("Views (members and signed-out visitors).", `INSERT badjockeys.posts.PostViews (PostId, ViewerKey, IsLocal, ViewedAt)`, "N, K, L, M", `p.Id, v.K, v.L, ${at("v.M")}`, views);
  activity(
    "Shares.",
    `INSERT badjockeys.posts.PostShares (PostId, ViewerKey, Day, SharedAt)`,
    "N, K, M",
    `p.Id, v.K, CAST(${at("v.M")} AS date), ${at("v.M")}`,
    shares,
  );
  activity(
    "Bookmarks.",
    `INSERT badjockeys.posts.Bookmarks (UserId, PostId, CreatedAt)`,
    "N, U, M",
    `v.U, p.Id, ${at("v.M")}`,
    bookmarks.map((b) => `(${b.post}, '${ids.userId(b.user)}', ${b.minute})`),
  );

  const tagged = posts.find((p) => p.passengerOwner);
  if (tagged) {
    add(`IF @Owner IS NOT NULL
BEGIN
  INSERT badjockeys.posts.PostPassengers (PostId, UserId, Status, TaggedAt, RespondedAt) VALUES ('${ids.postId(tagged.n)}', @Owner, N'Pending', ${ukTime(tagged.ago, tagged.time, 22)}, NULL);
  INSERT badjockeys.notifications.Notifications (Id, UserId, Type, ActorId, PostId, CommentId, PostTitle, Count, CreatedAt, UpdatedAt, ReadAt)
  VALUES ('e0000000-0000-4000-8004-000000000001', @Owner, N'PassengerTagged', '${ids.userId(tagged.by)}', '${ids.postId(tagged.n)}', NULL, ${q(tagged.title)}, 1,
    ${ukTime(tagged.ago, tagged.time, 22)}, ${ukTime(tagged.ago, tagged.time, 22)}, NULL);
END`);
  }

  const total = (list) => list.length.toLocaleString("en-GB");
  add(`
COMMIT;
PRINT 'Added ${users.length} example users and ${posts.length} posts (${videos} with a clip): ${total(reactions)} reactions, ${total(comments)} comments and replies,';
PRINT '${total(commentReactions)} reactions on comments, ${total(votes)} votes, ${total(follows)} follows, ${total(views)} views, ${total(shares)} shares and ${total(bookmarks)} bookmarks.';
PRINT 'Sign in as any of them with ${PASSWORD}, for example:';
${users
  .slice(0, 10)
  .map((u) => `PRINT '  ${u.email}  @${u.handle}';`)
  .join("\n")}
PRINT '  (all ${users.length}: SELECT Email FROM idsrv.auth.AspNetUsers WHERE Id LIKE ''e0000000%'')';
`);
  return { sql: lines.join("\n"), users, posts };
}

// Run on its own: write seed.sql for running by hand.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { sql, users, posts } = buildSql();
  writeFileSync(join(here, "seed.sql"), sql);
  console.log(`Wrote seed.sql (${users.length} users, ${posts.length} posts, ${(sql.length / 1e6).toFixed(1)} MB).`);
}

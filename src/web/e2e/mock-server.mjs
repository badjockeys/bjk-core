// Stand-in for bjk-identity-server (OpenID Connect with PKCE) and the bjk-core API, for the end-to-end tests.
// Plain Node.js, no dependencies. State lives in memory; POST /__reset puts the seed data back.
//   node e2e/mock-server.mjs            (port 4010, or PORT)

import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
const ORIGIN = `http://localhost:${PORT}`;
const CLIENT_ID = "bjk-web";
const CLIENT_SECRET = process.env.MOCK_CLIENT_SECRET ?? "e2e-secret";
const PROCESSING_MS = Number(process.env.MOCK_PROCESSING_MS ?? 2500);
const WEB_ORIGIN = process.env.MOCK_WEB_ORIGIN ?? "http://localhost:3000";
// Daily reel plays (the API's Reels:DailyPlays), small by default so the tests reach the limit quickly.
const ANON_REELS = Number(process.env.MOCK_ANON_REELS ?? 2);
const FREE_REELS = Number(process.env.MOCK_FREE_REELS ?? 25);

// --- Signing keys ---
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "mock-key";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
const b64url = (value) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
function jwt(claims, typ = "JWT") {
  const head = b64url({ alg: "RS256", typ, kid: KID });
  const body = b64url(claims);
  const signature = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url");
  return `${head}.${body}.${signature}`;
}
function claimsOf(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

// A 1×1 PNG for every photo and thumbnail.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// A 5-second, 64×36 WebM (VP8, no sound) for every video: Playwright's Chromium can't play H.264.
const WEBM = Buffer.from(
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAaCEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggZs7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECziAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYhqXxXsdxGaVJyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAX14QDgibCBQLqBJJqBAhJUw2f8c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2MC4xNi4xMDBzc9ZjwItjxYhqXxXsdxGaVGfIoUWjh0VOQ09ERVJEh5RMYXZjNjAuMzEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDUuMDAwMDAwMDAwAB9DtnVEx+eBAKOugQAAgNACAJ0BKkAAJAAARwiFhYiFhIgCAgJ08ma4vPMx5vpA/v7iaUq9XmQaMKOWgQBkANEBAAEQEAAYABhYL/QACIwAAKOWgQDIANEBAAEQEAAYABhYL/QACIwAAKOWgQEsANEBAAEQEAAYABhYL/QACIwAAKOWgQGQANEBAAEQEAAYABhYL/QACIwAAKOWgQH0ANEBAAEQEAAYABhYL/QACIwAAKOWgQJYANEBAAEQEAAYABhYL/QACIwAAKOVgQK8ALEBAAEQEBRgAGFgv9AAIjAAo5aBAyAA0QEAARAQABgAGFgv9AAIjAAAo5aBA4QA0QEAARAQABgAGFgv9AAIjAAAo5aBA+gA0QEAARAQABgAGFgv9AAIjAAAo5aBBEwA0QEAARAQABgAGFgv9AAIjAAAo5aBBLAA0QEAARAQABgAGFgv9AAIjAAAo5aBBRQA0QEAARAQABgAGFgv9AAIjAAAo5aBBXgA0QEAARAQABgAGFgv9AAIjAAAo5aBBdwA0QEAARAQABgAGFgv9AAIjAAAo5aBBkAA0QEAARAQABgAGFgv9AAIjAAAo5aBBqQA0QEAARAQABgAGFgv9AAIjAAAo5WBBwgAsQEAARAQFGAAYWC/0AAiMACjloEHbADRAQABEBAAGAAYWC/0AAiMAACjloEH0ADRAQABEBAAGAAYWC/0AAiMAACjloEINADRAQABEBAAGAAYWC/0AAiMAACjloEImADRAQABEBAAGAAYWC/0AAiMAACjloEI/ADRAQABEBAAGAAYWC/0AAiMAACjloEJYADRAQABEBAAGAAYWC/0AAiMAACjloEJxADRAQABEBAAGAAYWC/0AAiMAACjloEKKADRAQABEBAAGAAYWC/0AAiMAACjloEKjADRAQABEBAAGAAYWC/0AAiMAACjloEK8ADRAQABEBAAGAAYWC/0AAiMAACjlYELVACxAQABEBAUYABhYL/QACIwAKOWgQu4ANEBAAEQEAAYABhYL/QACIwAAKOWgQwcANEBAAEQEAAYABhYL/QACIwAAKOWgQyAANEBAAEQEAAYABhYL/QACIwAAKOWgQzkANEBAAEQEAAYABhYL/QACIwAAKOWgQ1IANEBAAEQEAAYABhYL/QACIwAAKOWgQ2sANEBAAEQEAAYABhYL/QACIwAAKOWgQ4QANEBAAEQEAAYABhYL/QACIwAAKOWgQ50ANEBAAEQEAAYABhYL/QACIwAAKOWgQ7YANEBAAEQEAAYABhYL/QACIwAAKOWgQ88ANEBAAEQEAAYABhYL/QACIwAAKOVgQ+gALEBAAEQEBRgAGFgv9AAIjAAo5aBEAQA0QEAARAQABgAGFgv9AAIjAAAo5aBEGgA0QEAARAQABgAGFgv9AAIjAAAo5aBEMwA0QEAARAQABgAGFgv9AAIjAAAo5aBETAA0QEAARAQABgAGFgv9AAIjAAAo5aBEZQA0QEAARAQABgAGFgv9AAIjAAAo5aBEfgA0QEAARAQABgAGFgv9AAIjAAAo5aBElwA0QEAARAQABgAGFgv9AAIjAAAo5aBEsAA0QEAARAQABgAGFgv9AAIjAAAo5aBEyQA0QEAARAQABgAGFgv9AAIjAAAHFO7a5G7j7OBALeK94EB8YIBn/CBAw==",
  "base64",
);

// --- Data ---
const USERS = {
  roadhog: {
    id: "00000000-0000-4000-8000-0000000000a1",
    email: "rider@example.com",
    ageVerified: true,
    plan: "free",
  },
  dave: {
    id: "00000000-0000-4000-8000-0000000000b2",
    email: "dave@example.com",
    ageVerified: true,
    plan: "premium",
  },
  newbie: { id: "00000000-0000-4000-8000-0000000000c3", email: "new@example.com", ageVerified: false },
  // Has a profile but hasn't taken the age check (for sensitive posts).
  larry: { id: "00000000-0000-4000-8000-0000000000d4", email: "larry@example.com", ageVerified: false },
};
export const SEED = {
  photoPost: "8f2e1c3a-0000-4000-8000-000000000001",
  videoPost: "8f2e1c3a-0000-4000-8000-000000000002",
  sensitivePost: "8f2e1c3a-0000-4000-8000-000000000003",
  processingPost: "8f2e1c3a-0000-4000-8000-000000000004",
  secondVideo: "8f2e1c3a-0000-4000-8000-000000000005",
  thirdVideo: "8f2e1c3a-0000-4000-8000-000000000006",
};

let db;
let codes;
let refreshTokens;
let nextUser = "roadhog";
let lastUser = "roadhog";

function seed() {
  const now = Date.now();
  const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const media = (id, mediaType, userId) => ({
    id,
    userId,
    mediaType,
    status: "Ready",
    originalFileName: `${id}.${mediaType === "Video" ? "mp4" : "jpg"}`,
    playbackUrl: `${ORIGIN}/media/${id}.${mediaType === "Video" ? "webm" : "png"}`,
    thumbnailUrl: `${ORIGIN}/media/${id}-thumb.png`,
    durationSeconds: mediaType === "Video" ? 24 : null,
    width: 1280,
    height: 720,
    failureReason: null,
    createdAt: ago(200),
  });
  const dave = USERS.dave.id;
  db = {
    // Drafts of posts (bjk-modules DraftsController): up to 5 each.
    drafts: [],
    profiles: new Map([
      [
        dave,
        {
          id: dave,
          handle: "dashcam_dave",
          displayName: "Dashcam Dave",
          bio: "Driving instructor. Front, rear and side cameras, so I see it all.",
          location: "Leeds",
          avatarMediaId: null,
          createdAt: ago(60 * 24 * 10),
          isMinor: false,
          roadUser: "Driver",
          showRoadUser: true,
        },
      ],
      [
        USERS.roadhog.id,
        {
          id: USERS.roadhog.id,
          handle: "roadhog",
          displayName: "Road Hog",
          bio: "Daily M62 commuter. Front and rear dashcam.",
          location: "Leeds",
          avatarMediaId: null,
          createdAt: ago(60 * 24 * 5),
          isMinor: false,
        },
      ],
    ]),
    media: new Map(
      [
        media("m-1", "Image", dave),
        media("m-2", "Image", dave),
        media("m-3", "Image", dave),
        media("m-4", "Video", dave),
        media("m-5", "Image", dave),
        media("m-7", "Video", dave),
        media("m-8", "Video", dave),
      ].map((m) => [m.id, m]),
    ),
    posts: [
      post(
        SEED.processingPost,
        USERS.roadhog.id,
        "Wrong way round the roundabout",
        "Other",
        ["m-6"],
        ago(1),
        {
          placeName: "Armley Gyratory, Leeds",
          mediaState: "Pending",
        },
      ),
      post(SEED.sensitivePost, dave, "Serious crash on the A64", "RoadRage", ["m-5"], ago(30), {
        isSensitive: true,
      }),
      post(SEED.videoPost, dave, "Undertaking a lorry on the M62", "Undertaking", ["m-4"], ago(300), {
        description: "Straight up the inside at junction 26. #M62 #Undertaking",
        passengers: [{ userId: USERS.roadhog.id, status: "Pending" }],
      }),
      post(SEED.secondVideo, dave, "Cutting up on the A64", "CuttingUp", ["m-7"], ago(400), {
        placeName: "A64, York",
      }),
      post(SEED.thirdVideo, dave, "Phone at the wheel in Leeds", "MobilePhoneUse", ["m-8"], ago(500), {
        placeName: "Kirkstall Road, Leeds",
      }),
      post(
        SEED.photoPost,
        dave,
        "Parked across two disabled bays, again",
        "BadParking",
        ["m-1", "m-2", "m-3"],
        ago(120),
        {
          description: "Third time this week. Same car, same bays, right by the entrance.",
          placeName: "Asda, Kirkstall, Leeds",
        },
      ),
    ],
    reactions: new Map([
      [
        SEED.photoPost,
        new Map([
          ["x1", "Like"],
          ["x2", "Angry"],
          ["x3", "Angry"],
        ]),
      ],
    ]),
    comments: [],
    commentReactions: new Map(),
    reports: [],
    publicReports: [],
    blocks: new Map(),
    // UI step 6: "follower>followee" pairs, and custom timelines.
    follows: new Set(),
    timelines: [],
    appeals: [],
    reelPlays: new Map(),
    // Per user: the bell, and settings that differ from the defaults.
    notifications: new Map([
      [
        USERS.roadhog.id,
        [
          {
            id: "9a1e0000-0000-4000-8000-000000000001",
            type: "PassengerTagged",
            actorId: dave,
            postId: SEED.videoPost,
            commentId: null,
            postTitle: "Undertaking a lorry on the M62",
            count: 1,
            at: ago(20),
            isRead: false,
          },
        ],
      ],
    ]),
    notificationSettings: new Map(),
    areas: new Map(),
  };
  db.posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  addComment(
    SEED.photoPost,
    "00000000-0000-4000-8000-0000000000d4",
    "Report it to the store too, they can fine them.",
    null,
    ago(60),
  );
  db.profiles.set("00000000-0000-4000-8000-0000000000d4", {
    id: "00000000-0000-4000-8000-0000000000d4",
    handle: "lane_one_larry",
    displayName: "Lane One Larry",
    bio: null,
    location: null,
    avatarMediaId: null,
    createdAt: ago(60 * 24 * 20),
    isMinor: false,
  });
  codes = new Map();
  refreshTokens = new Map();
  nextUser = "roadhog";
  lastUser = "roadhog";
}

function post(id, authorId, title, category, mediaIds, createdAt, extra = {}) {
  return {
    id,
    authorId,
    title,
    description: extra.description ?? null,
    category,
    types: extra.types ?? [category],
    passengers: extra.passengers ?? [],
    vehicle: extra.vehicle ?? null,
    reportedToPolice: extra.reportedToPolice ?? null,
    incidentAt: createdAt,
    latitude: 53.81,
    longitude: -1.6,
    placeName: extra.placeName ?? "M62 J26, Bradford",
    mediaIds,
    status: "Published",
    hiddenReason: null,
    createdAt,
    isSensitive: extra.isSensitive ?? false,
    mediaState: extra.mediaState ?? "Ready",
  };
}

function addComment(postId, authorId, body, parentId, createdAt = new Date().toISOString()) {
  const comment = { id: randomUUID(), postId, authorId, body, parentId, createdAt, status: "Visible" };
  db.comments.push(comment);
  return comment;
}

seed();

// --- Views (the API's DTOs) ---
function author(id) {
  const p = db.profiles.get(id);
  return p
    ? {
        id,
        handle: p.handle,
        displayName: p.displayName,
        avatarUrl: avatarUrl(p),
        roadUser: p.showRoadUser ? (p.roadUser ?? null) : null,
      }
    : { id, handle: null, displayName: "Former member", avatarUrl: null };
}
// Accepted passengers for everyone; the author also sees pending ones; you always see your own tag.
function passengersFor(p, viewer) {
  return p.passengers
    .filter(
      (t) =>
        db.profiles.has(t.userId) &&
        (t.status === "Accepted" || t.userId === viewer || (t.status === "Pending" && p.authorId === viewer)),
    )
    .map((t) => ({ person: author(t.userId), status: t.status }));
}
function avatarUrl(profile) {
  const m = profile.avatarMediaId && db.media.get(profile.avatarMediaId);
  return m && m.status === "Ready" ? m.playbackUrl : null;
}
function counts(map) {
  const result = {};
  for (const type of map?.values() ?? []) {
    result[type] = (result[type] ?? 0) + 1;
  }
  return result;
}
// Whether the request's caller passed the age check (set per request in api()).
let callerAgeVerified = false;

function postDto(p, viewer) {
  const reactions = db.reactions.get(p.id);
  const blurred = p.isSensitive && p.authorId !== viewer && !(viewer && callerAgeVerified);
  return {
    id: p.id,
    author: author(p.authorId),
    title: p.title,
    description: p.description,
    category: p.category,
    types: p.types,
    passengers: passengersFor(p, viewer),
    vehicle: p.vehicle,
    reportedToPolice: p.reportedToPolice,
    incidentAt: p.incidentAt,
    location: { latitude: p.latitude, longitude: p.longitude, placeName: p.placeName },
    status: p.status,
    hiddenReason: p.hiddenReason,
    media: p.mediaIds
      .map((id) => db.media.get(id))
      .filter((m) => m && m.status === "Ready")
      .map((m) => ({
        mediaId: m.id,
        mediaType: m.mediaType,
        playbackUrl: blurred ? null : m.playbackUrl,
        thumbnailUrl: blurred ? null : m.thumbnailUrl,
        durationSeconds: m.durationSeconds,
        width: m.width,
        height: m.height,
        previewUrl: p.isSensitive ? `${ORIGIN}/media/${m.id}-preview.png` : null,
        isBlurred: blurred,
        linksExpireAt: p.isSensitive && !blurred ? new Date(Date.now() + 600_000).toISOString() : null,
        feedUrl: m.mediaType === "Image" && !blurred ? `${ORIGIN}/media/${m.id}-feed.png` : null,
      })),
    reactions: counts(reactions),
    myReaction: (viewer && reactions?.get(viewer)) ?? null,
    commentCount: db.comments.filter((c) => c.postId === p.id && c.status === "Visible").length,
    createdAt: p.createdAt,
    updatedAt: null,
    isSensitive: p.isSensitive,
    commentsRequireSignIn: !viewer,
    mediaState: p.mediaState,
    mediaFailureReason: null,
    isProcessing: p.mediaState === "Pending",
    requiresAgeVerification: blurred,
    sensitiveSource: p.isSensitive ? "Author" : "None",
    commentSetting: p.commentSetting ?? "Everyone",
  };
}
/** The commenter and the post's author see a comment the post's author hid; everyone else sees a placeholder. */
function shownTo(c, viewer) {
  if (!c.hiddenByAuthor) return true;
  const post = db.posts.find((x) => x.id === c.postId);
  return viewer === c.authorId || viewer === post?.authorId;
}
function commentDto(c, viewer, withReplies) {
  const reactions = db.commentReactions.get(c.id);
  if (!shownTo(c, viewer)) {
    return {
      id: c.id,
      postId: c.postId,
      author: null,
      body: "",
      createdAt: c.createdAt,
      updatedAt: null,
      editedAt: null,
      isHiddenByPostAuthor: true,
      status: "Visible",
      parentCommentId: c.parentId,
      isRemoved: false,
      reactions: {},
      myReaction: null,
      replyCount: 0,
      replies: withReplies ? [] : null,
    };
  }
  const replies = db.comments.filter((r) => r.parentId === c.id && r.status === "Visible");
  return {
    id: c.id,
    postId: c.postId,
    author: author(c.authorId),
    body: c.body,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt ?? null,
    editedAt: c.editedAt ?? null,
    isHiddenByPostAuthor: Boolean(c.hiddenByAuthor),
    status: c.status,
    parentCommentId: c.parentId,
    isRemoved: false,
    reactions: counts(reactions),
    myReaction: (viewer && reactions?.get(viewer)) ?? null,
    replyCount: withReplies ? replies.length : 0,
    replies: withReplies ? replies.slice(0, 3).map((r) => commentDto(r, viewer, false)) : null,
  };
}
const isPublic = (p) => p.status === "Published" && p.mediaState === "Ready";
function canSee(p, viewer) {
  if (p.authorId === viewer) return true;
  if (!isPublic(p)) return false;
  if (viewer && db.blocks.get(viewer)?.has(p.authorId)) return false;
  return true;
}
function page(items, url, map) {
  const n = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const size = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  return {
    items: items.slice((n - 1) * size, n * size).map(map),
    page: n,
    pageSize: size,
    totalCount: items.length,
  };
}
function mediaDto(m) {
  return { ...m, uploadedAt: m.createdAt, processedAt: m.status === "Ready" ? m.createdAt : null };
}

// --- HTTP helpers ---
function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}),
    ...headers,
  });
  res.end(payload);
}
const problem = (res, status, detail, extra = {}) =>
  send(
    res,
    status,
    { status, title: detail, detail, ...extra },
    { "Content-Type": "application/problem+json" },
  );
const invalid = (res, field, message) =>
  send(res, 400, {
    status: 400,
    title: "One or more validation errors occurred.",
    errors: { [field]: [message] },
  });
const redirect = (res, location) => send(res, 302, undefined, { Location: location });

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function viewerOf(req) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return { id: null };
  const claims = claimsOf(header.slice(7));
  if (!claims || claims.exp * 1000 < Date.now()) return { id: null, expired: true };
  return {
    id: claims.sub,
    ageVerified: claims.age_verified === "true",
    email: claims.email,
    plan: claims.plan,
  };
}

// --- Identity server ---
function issueTokens(userKey, nonce) {
  const user = USERS[userKey];
  const now = Math.floor(Date.now() / 1000);
  const accessClaims = {
    iss: ORIGIN,
    aud: ["bjk-api", "bjk-identity"],
    client_id: CLIENT_ID,
    sub: user.id,
    email: user.email,
    email_verified: "true",
    scope: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "bjk.profiles",
      "bjk.posts",
      "bjk.media",
      "bjk.users",
    ],
    iat: now,
    nbf: now,
    exp: now + 900,
    jti: randomUUID(),
  };
  if (user.ageVerified) accessClaims.age_verified = "true";
  if (user.plan && user.plan !== "free") accessClaims.plan = user.plan;
  const refresh = randomBytes(24).toString("hex");
  refreshTokens.set(refresh, userKey);
  const idClaims = {
    iss: ORIGIN,
    aud: CLIENT_ID,
    sub: user.id,
    iat: now,
    exp: now + 300,
    auth_time: now,
    email: user.email,
  };
  if (nonce) idClaims.nonce = nonce;
  return {
    access_token: jwt(accessClaims, "at+jwt"),
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: refresh,
    id_token: jwt(idClaims),
    scope: accessClaims.scope.join(" "),
  };
}

function clientAuthenticated(req, form) {
  const basic = req.headers.authorization;
  if (basic?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(basic.slice(6), "base64").toString().split(":").map(decodeURIComponent);
    return id === CLIENT_ID && secret === CLIENT_SECRET;
  }
  return form.get("client_id") === CLIENT_ID && form.get("client_secret") === CLIENT_SECRET;
}

async function identity(req, res, url) {
  const path = url.pathname;
  if (path === "/.well-known/openid-configuration") {
    return send(res, 200, {
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/connect/authorize`,
      token_endpoint: `${ORIGIN}/connect/token`,
      end_session_endpoint: `${ORIGIN}/connect/endsession`,
      revocation_endpoint: `${ORIGIN}/connect/revocation`,
      jwks_uri: `${ORIGIN}/.well-known/openid-configuration/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      scopes_supported: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "bjk.profiles",
        "bjk.posts",
        "bjk.media",
        "bjk.users",
      ],
    });
  }
  if (path === "/.well-known/openid-configuration/jwks") {
    return send(res, 200, { keys: [jwk] });
  }
  if (path === "/connect/authorize") {
    const q = url.searchParams;
    if (
      q.get("client_id") !== CLIENT_ID ||
      !q.get("redirect_uri") ||
      q.get("code_challenge_method") !== "S256"
    ) {
      return send(res, 400, "Bad authorize request");
    }
    const code = randomBytes(16).toString("hex");
    lastUser = nextUser;
    codes.set(code, {
      user: nextUser,
      nonce: q.get("nonce"),
      challenge: q.get("code_challenge"),
      redirectUri: q.get("redirect_uri"),
    });
    const target = new URL(q.get("redirect_uri"));
    target.searchParams.set("code", code);
    if (q.get("state")) target.searchParams.set("state", q.get("state"));
    return redirect(res, target.href);
  }
  if (path === "/connect/token" && req.method === "POST") {
    const form = new URLSearchParams((await readBody(req)).toString());
    if (!clientAuthenticated(req, form)) {
      return send(res, 401, { error: "invalid_client" });
    }
    if (form.get("grant_type") === "authorization_code") {
      const entry = codes.get(form.get("code"));
      codes.delete(form.get("code"));
      const verifier = form.get("code_verifier") ?? "";
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      if (!entry || entry.challenge !== challenge || entry.redirectUri !== form.get("redirect_uri")) {
        return send(res, 400, { error: "invalid_grant" });
      }
      return send(res, 200, issueTokens(entry.user, entry.nonce), { "Cache-Control": "no-store" });
    }
    if (form.get("grant_type") === "refresh_token") {
      const user = refreshTokens.get(form.get("refresh_token"));
      refreshTokens.delete(form.get("refresh_token")); // one-time, like the real identity server
      if (!user) return send(res, 400, { error: "invalid_grant" });
      const tokens = issueTokens(user);
      delete tokens.id_token;
      return send(res, 200, tokens, { "Cache-Control": "no-store" });
    }
    return send(res, 400, { error: "unsupported_grant_type" });
  }
  if (path === "/connect/revocation") {
    await readBody(req);
    return send(res, 200, "");
  }
  if (path === "/connect/endsession") {
    return redirect(res, url.searchParams.get("post_logout_redirect_uri") ?? WEB_ORIGIN);
  }
  if (path === "/Account/CheckAge") {
    USERS[lastUser].ageVerified = true;
    return redirect(res, ORIGIN + (url.searchParams.get("returnUrl") ?? "/"));
  }
  if (path === "/Account/Register") {
    nextUser = "newbie";
    return redirect(res, ORIGIN + (url.searchParams.get("returnUrl") ?? "/"));
  }
  if (path.startsWith("/Manage")) {
    return send(res, 200, "<!doctype html><title>Manage</title><h1>Account settings (mock)</h1>", {
      "Content-Type": "text/html",
    });
  }
  return false;
}

// --- API ---
const CATEGORIES = new Set([
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
]);
const REACTIONS = new Set(["Like", "Angry", "Shocked", "Laugh"]);

async function api(req, res, url) {
  const path = url.pathname;
  const method = req.method;
  const viewer = viewerOf(req);
  const me = viewer.id;
  callerAgeVerified = Boolean(viewer.ageVerified);
  const json = async () => {
    const raw = (await readBody(req)).toString();
    return raw ? JSON.parse(raw) : {};
  };
  const requireUser = () => {
    if (!me) {
      problem(res, 401, "Unauthorized");
      return false;
    }
    return true;
  };
  let m;

  // Reels: video posts, with daily plays by plan (the real API counts per UK day).
  const reelAllowance = () => {
    const key = me ?? `viewer:${req.headers["x-viewer-id"] ?? "unknown"}`;
    const limit = !me
      ? ANON_REELS
      : viewer.plan === "premium" || viewer.plan === "premium_plus"
        ? null
        : FREE_REELS;
    const played = db.reelPlays.get(key) ?? new Set();
    db.reelPlays.set(key, played);
    const remaining = limit === null ? null : Math.max(0, limit - played.size);
    const resetsAt = new Date(Date.now() + 3_600_000).toISOString();
    return { key, limit, played, remaining, resetsAt };
  };
  const dailyLimit = (a) =>
    problem(res, 403, `That's today's ${a.limit} free reels.`, {
      code: "daily_limit",
      resetsAt: a.resetsAt,
      limit: a.limit,
    });
  const isReel = (p) =>
    p.mediaIds.some((id) => db.media.get(id)?.mediaType === "Video") &&
    canSee(p, me) &&
    (!p.isSensitive || viewer.ageVerified || p.authorId === me);
  if (path === "/api/reels" && method === "GET") {
    const a = reelAllowance();
    if (a.remaining === 0) return dailyLimit(a);
    const category = url.searchParams.get("category");
    const all = db.posts.filter((p) => isReel(p) && (!category || p.types.includes(category)));
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const size = Math.min(Number(url.searchParams.get("pageSize") ?? 10), a.remaining ?? 10);
    const items = all.slice(start, start + size);
    return send(res, 200, {
      items: items.map((p) => postDto(p, me)),
      nextCursor: start + size < all.length ? String(start + size) : null,
      playsRemainingToday: a.remaining,
      dailyPlayLimit: a.limit,
      playsToday: a.played.size,
      resetsAt: a.resetsAt,
    });
  }
  if ((m = path.match(/^\/api\/reels\/([0-9a-f-]{36})\/play$/)) && method === "POST") {
    const p = db.posts.find((x) => x.id === m[1]);
    if (!p || !isReel(p)) return problem(res, 404, `Reel ${m[1]} was not found.`);
    const a = reelAllowance();
    const already = a.played.has(p.id);
    if (!already && a.remaining === 0) return dailyLimit(a);
    a.played.add(p.id);
    const remaining = a.limit === null ? null : Math.max(0, a.limit - a.played.size);
    return send(res, 200, {
      counted: !already,
      playsRemainingToday: remaining,
      dailyPlayLimit: a.limit,
      playsToday: a.played.size,
      resetsAt: a.resetsAt,
    });
  }

  // Hashtags (UI step 5): from posts' titles and descriptions, the same rule as the API.
  const tagsOf = (p) =>
    [
      ...`${p.title} ${p.description ?? ""}`.matchAll(
        /(?<![\p{L}\p{N}_/&#])#([A-Za-z][A-Za-z0-9_]{1,49})(?![A-Za-z0-9_])/gu,
      ),
    ].map((m) => m[1]);
  if (path === "/api/trends" && method === "GET") {
    return send(res, 200, {
      hashtags: [
        { tag: "M62", posts: 12 },
        { tag: "SchoolRun", posts: 5 },
      ],
      places: [{ name: "Leeds", posts: 9 }],
    });
  }
  if (path === "/api/hashtags" && method === "GET") {
    const prefix = (url.searchParams.get("prefix") ?? "").toLowerCase();
    const counts = new Map();
    for (const p of db.posts.filter(isPublic)) {
      for (const tag of new Set(tagsOf(p))) {
        const key = tag.toLowerCase();
        const entry = counts.get(key) ?? { tag, uses: 0 };
        entry.uses += 1;
        counts.set(key, entry);
      }
    }
    const items = [...counts.entries()]
      .filter(([key]) => prefix && key.startsWith(prefix))
      .map(([, v]) => v)
      .sort((a, b) => b.uses - a.uses);
    return send(res, 200, items.slice(0, Number(url.searchParams.get("limit") ?? 8)));
  }
  const tagMatch = path.match(/^\/api\/hashtags\/([^/]+)$/);
  if (tagMatch && method === "GET") {
    const key = decodeURIComponent(tagMatch[1]).replace(/^#/, "").toLowerCase();
    const posts = db.posts.filter((p) => isPublic(p) && tagsOf(p).some((t) => t.toLowerCase() === key));
    if (posts.length === 0) return send(res, 404, { status: 404, title: "Not found" });
    const tag = tagsOf(posts[0]).find((t) => t.toLowerCase() === key);
    return send(res, 200, { tag, key, uses: posts.length, firstUsedAt: posts[0].createdAt });
  }

  // Category trends (UI step 4): anyone. Free and signed out get the last 7 days for the whole UK.
  if (path === "/api/trends/categories" && method === "GET") {
    const plan =
      viewer.plan === "premium_plus" ? "PremiumPlus" : viewer.plan === "premium" ? "Premium" : "Free";
    const free = plan === "Free";
    const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const today = day(0);
    const to = !free && url.searchParams.get("to") ? url.searchParams.get("to") : today;
    const from = !free && url.searchParams.get("from") ? url.searchParams.get("from") : day(6);
    const length = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    const period = length <= 92 ? "Day" : length <= 731 ? "Week" : "Month";
    const points = Math.min(length, 12);
    const periods = Array.from({ length: points }, (_, i) => day(points - 1 - i));
    const wantsArea = Boolean(url.searchParams.get("bbox"));
    // The area makes the numbers smaller, so the test can see it was applied.
    const scale = !free && wantsArea ? 0.5 : 1;
    const line = (base) => periods.map((_, i) => Math.round((base + (i % 3)) * scale));
    const trend = (category, base, previous) => {
      const p = line(base);
      const total = p.reduce((a, b) => a + b, 0);
      return {
        category,
        suppressed: false,
        total,
        previousTotal: previous,
        changePercent: previous ? Math.round(((total - previous) * 100) / previous) : null,
        points: p,
      };
    };
    const shown = [trend("BadParking", 6, 30), trend("Tailgating", 4, 40), trend("Speeding", 2, null)];
    const suppressed = ["RoadRage", "ClosePass"].map((category) => ({
      category,
      suppressed: true,
      total: null,
      previousTotal: null,
      changePercent: null,
      points: [],
    }));
    return send(res, 200, {
      categories: [...shown, ...suppressed],
      period,
      periods,
      previousFrom: day(length + 6),
      previousTo: day(7),
      areaAllowed: !free,
      areaIgnored: free && wantsArea,
      access: {
        plan,
        historyDays: free ? 7 : plan === "Premium" ? 365 : 1826,
        filtersAllowed: !free,
        exportAllowed: plan === "PremiumPlus",
        from,
        to,
        historyCapped: false,
        filtersIgnored: false,
        modelFilterIgnored: false,
      },
    });
  }

  // Heat map: a few fixed cells around Leeds and York. Free: last 7 days, filters ignored.
  if ((path === "/api/heatmap" || path === "/api/heatmap/area") && method === "GET") {
    if (!requireUser()) return;
    const plan =
      viewer.plan === "premium_plus" ? "PremiumPlus" : viewer.plan === "premium" ? "Premium" : "Free";
    const today = new Date().toISOString().slice(0, 10);
    const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const free = plan === "Free";
    const access = {
      plan,
      historyDays: free ? 7 : plan === "Premium" ? 365 : 1826,
      filtersAllowed: !free,
      exportAllowed: plan === "PremiumPlus",
      from: free ? daysAgo(6) : (url.searchParams.get("from") ?? daysAgo(364)),
      to: today,
      historyCapped: false,
      filtersIgnored: free && Boolean(url.searchParams.get("categories") || url.searchParams.get("hours")),
    };
    if (path === "/api/heatmap") {
      const cell = (lat, lng, count) => ({
        latitude: lat,
        longitude: lng,
        minLatitude: lat - 0.045,
        minLongitude: lng - 0.072,
        maxLatitude: lat + 0.045,
        maxLongitude: lng + 0.072,
        count,
      });
      const cells = [cell(53.82, -1.58, 14), cell(53.8, -1.5, 5), cell(53.96, -1.08, 3)];
      return send(res, 200, {
        cells,
        cellLatitudeSize: 0.09,
        cellLongitudeSize: 0.144,
        minCellCount: 3,
        maxCount: 14,
        truncated: false,
        access,
      });
    }
    return send(res, 200, {
      suppressed: false,
      total: 14,
      changePercent: 12,
      busiestHour: 8,
      topCategories: [
        { category: "BadParking", count: 5, percent: 36 },
        { category: "Tailgating", count: 4, percent: 29 },
      ],
      topPlaces: [{ name: "Kirkstall Road, Leeds", count: 6 }],
      placeName: "Kirkstall Road, Leeds",
      previousFrom: daysAgo(13),
      previousTo: daysAgo(7),
      access,
    });
  }

  // Home timelines (UI step 6). For you is the public feed, newest first here.
  const visibleTo = (p) => isPublic(p) && canSee(p, me);
  const planLimit = () => (viewer.plan === "premium_plus" ? 10 : viewer.plan === "premium" ? 5 : 1);
  const planName = () =>
    viewer.plan === "premium_plus" ? "PremiumPlus" : viewer.plan === "premium" ? "Premium" : "Free";
  const mine = () => db.timelines.filter((t) => t.userId === me).sort((a, b) => a.position - b.position);
  const timelineDto = (t) => ({
    id: t.id,
    name: t.name,
    types: t.types,
    placeName: t.placeName ?? null,
    latitude: t.latitude ?? null,
    longitude: t.longitude ?? null,
    radiusKm: t.radiusKm ?? null,
    position: t.position,
  });
  if (path === "/api/timelines/for-you" && method === "GET") {
    return send(
      res,
      200,
      page(db.posts.filter(visibleTo), url, (p) => postDto(p, me)),
    );
  }
  if (path === "/api/timelines/following" && method === "GET") {
    if (!requireUser()) return;
    const items = db.posts.filter((p) => visibleTo(p) && (p.authorId === me || db.follows.has(`${me}>${p.authorId}`)));
    return send(
      res,
      200,
      page(items, url, (p) => postDto(p, me)),
    );
  }
  if (path === "/api/timelines" && method === "GET") {
    if (!requireUser()) return;
    return send(res, 200, { timelines: mine().map(timelineDto), limit: planLimit(), plan: planName() });
  }
  if (path === "/api/timelines" && method === "POST") {
    if (!requireUser()) return;
    const body = await json();
    if (mine().length >= planLimit())
      return invalid(
        res,
        "Timelines",
        `Your plan allows ${planLimit()} custom timeline. Delete one, or upgrade for more.`,
      );
    if (!body.name?.trim()) return invalid(res, "Name", "Give the timeline a name.");
    if (!body.types?.length) return invalid(res, "Types", "Choose at least one type of bad driving.");
    const t = { ...body, id: randomUUID(), userId: me, position: mine().length };
    db.timelines.push(t);
    return send(res, 201, timelineDto(t));
  }
  if (path === "/api/timelines/order" && method === "PUT") {
    if (!requireUser()) return;
    const { ids } = await json();
    ids.forEach((id, i) => {
      const t = db.timelines.find((x) => x.id === id && x.userId === me);
      if (t) t.position = i;
    });
    return send(res, 200, { timelines: mine().map(timelineDto), limit: planLimit(), plan: planName() });
  }
  if ((m = path.match(/^\/api\/timelines\/([0-9a-f-]{36})(\/posts)?$/))) {
    if (!requireUser()) return;
    const t = db.timelines.find((x) => x.id === m[1] && x.userId === me);
    if (method === "DELETE") {
      db.timelines = db.timelines.filter((x) => x !== t);
      return send(res, 204);
    }
    if (!t) return problem(res, 404, "Timeline not found.");
    if (method === "PUT") {
      Object.assign(t, await json());
      return send(res, 200, timelineDto(t));
    }
    const items = db.posts.filter((p) => visibleTo(p) && p.types.some((x) => t.types.includes(x)));
    return send(
      res,
      200,
      page(items, url, (p) => postDto(p, me)),
    );
  }

  // Posts
  if (path === "/api/posts" && method === "GET") {
    const category = url.searchParams.get("type") ?? url.searchParams.get("category");
    const handle = url.searchParams.get("author");
    const hashtag = url.searchParams.get("hashtag")?.toLowerCase();
    const authorId = handle ? [...db.profiles.values()].find((p) => p.handle === handle)?.id : null;
    const items = db.posts.filter(
      (p) =>
        isPublic(p) &&
        canSee(p, me) &&
        (!category || p.types.includes(category)) &&
        (!handle || p.authorId === authorId) &&
        (!hashtag || tagsOf(p).some((t) => t.toLowerCase() === hashtag)),
    );
    return send(
      res,
      200,
      page(items, url, (p) => postDto(p, me)),
    );
  }
  // Vehicle lists
  if (path === "/api/vehicles" && method === "GET") {
    return send(res, 200, VEHICLES);
  }
  // Places and home areas
  if (path === "/api/places" && method === "GET") {
    if (!requireUser()) return;
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    return send(
      res,
      200,
      PLACES.filter((p) => p.name.toLowerCase().startsWith(q)),
    );
  }
  if (path.startsWith("/api/notifications/area")) {
    if (!requireUser()) return;
    const premium = viewer.plan === "premium" || viewer.plan === "premium_plus";
    const area = db.areas.get(me) ?? null;
    const dto = (a) => ({
      placeName: a?.placeName ?? null,
      latitude: a?.latitude ?? null,
      longitude: a?.longitude ?? null,
      enabled: !!a?.enabled && premium,
      radiusKm: a?.radiusKm ?? 5,
      mode: a?.mode ?? "Digest",
      email: !!a?.email,
      canUseAlerts: premium,
      radiuses: [2, 5, 10, 25],
      instantDailyCap: 10,
    });
    if (path === "/api/notifications/area" && method === "GET") return send(res, 200, dto(area));
    if (path === "/api/notifications/area" && method === "DELETE") {
      db.areas.delete(me);
      return send(res, 204);
    }
    if (path === "/api/notifications/area/home" && method === "PUT") {
      const body = await json();
      const next = { ...(area ?? {}), ...body };
      db.areas.set(me, next);
      return send(res, 200, dto(next));
    }
    if (path === "/api/notifications/area/alerts" && method === "PUT") {
      const body = await json();
      if (body.enabled && !premium) return problem(res, 403, "Area alerts are part of Premium.");
      if (!area) return invalid(res, "PlaceName", "Choose your home area first.");
      Object.assign(area, body);
      return send(res, 200, dto(area));
    }
  }
  // Notifications
  if (path === "/api/notifications" && method === "GET") {
    if (!requireUser()) return;
    const items = (db.notifications.get(me) ?? []).slice().sort((a, b) => b.at.localeCompare(a.at));
    return send(res, 200, page(items, url, notificationDto));
  }
  if (path === "/api/notifications/unread-count" && method === "GET") {
    if (!requireUser()) return;
    return send(res, 200, { unread: (db.notifications.get(me) ?? []).filter((n) => !n.isRead).length });
  }
  if (path === "/api/notifications/read" && method === "POST") {
    if (!requireUser()) return;
    const { ids } = await json();
    for (const n of db.notifications.get(me) ?? []) {
      if (!ids || ids.length === 0 || ids.includes(n.id)) n.isRead = true;
    }
    return send(res, 204);
  }
  if (path === "/api/notifications/settings") {
    if (!requireUser()) return;
    const chosen = db.notificationSettings.get(me) ?? new Map();
    db.notificationSettings.set(me, chosen);
    if (method === "PUT") {
      for (const change of (await json()).settings ?? []) chosen.set(change.type, change);
    }
    return send(
      res,
      200,
      NOTIFICATION_TYPES.map(([type, label, inApp, email]) => ({
        type,
        label,
        inApp: chosen.get(type)?.inApp ?? inApp,
        email: chosen.get(type)?.email ?? email,
      })),
    );
  }
  if (path === "/api/posts/tagged" && method === "GET") {
    if (!requireUser()) return;
    const status = url.searchParams.get("status") ?? "Pending";
    const items = db.posts.filter(
      (p) => isPublic(p) && p.passengers.some((t) => t.userId === me && t.status === status),
    );
    return send(
      res,
      200,
      page(items, url, (p) => postDto(p, me)),
    );
  }
  // A profile's Replies tab (bjk-modules ListProfileReplies).
  if (path === "/api/posts/replies" && method === "GET") {
    if (!requireUser()) return;
    const handle = (url.searchParams.get("author") ?? "").replace(/^@/, "").toLowerCase();
    const person = [...db.profiles.values()].find((x) => x.handle === handle);
    const mine = person
      ? db.comments
          .filter((c) => c.authorId === person.id && c.status === "Visible")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [];
    return send(
      res,
      200,
      page(mine, url, (c) => {
        const post = db.posts.find((x) => x.id === c.postId);
        const parent = c.parentId ? db.comments.find((x) => x.id === c.parentId) : null;
        return {
          comment: commentDto(c, me, false),
          post: { id: post.id, title: post.title, author: author(post.authorId) },
          replyingTo: parent ? (db.profiles.get(parent.authorId)?.handle ?? null) : null,
        };
      }),
    );
  }
  if (path === "/api/posts/mine" && method === "GET") {
    if (!requireUser()) return;
    return send(
      res,
      200,
      page(
        db.posts.filter((p) => p.authorId === me),
        url,
        (p) => postDto(p, me),
      ),
    );
  }
  if (path === "/api/posts" && method === "POST") {
    if (!requireUser()) return;
    const body = await json();
    if (!db.profiles.has(me)) return invalid(res, "Profile", "Create your profile before posting.");
    if (!body.title?.trim()) return invalid(res, "Title", "Add a title.");
    const sent = Array.isArray(body.types) && body.types.length > 0 ? body.types : [body.category];
    const types = [...new Set(sent.filter(Boolean))];
    if (types.length === 0) return invalid(res, "Types", "Choose at least one type of bad driving.");
    if (!types.every((t) => CATEGORIES.has(t))) return invalid(res, "Types", "Choose a type from the list.");
    const handles = [...new Set((body.passengers ?? []).map((h) => h.replace(/^@/, "").toLowerCase()))];
    if (handles.length > 0 && types.every((t) => t === "BadParking"))
      return invalid(
        res,
        "Passengers",
        "Passengers can only be tagged on driving incidents, not bad parking.",
      );
    if (handles.length > 4) return invalid(res, "Passengers", "You can tag up to 4 passengers.");
    const passengers = [];
    for (const h of handles) {
      const person = [...db.profiles.values()].find((x) => x.handle === h);
      if (!person) return invalid(res, "Passengers", `We couldn't find @${h}.`);
      if (person.id === me) return invalid(res, "Passengers", "You can't tag yourself.");
      if (person.isMinor !== false) return invalid(res, "Passengers", `You can't tag @${h}.`);
      passengers.push({ userId: person.id, status: "Pending" });
    }
    if ((body.description ?? "").trim().length > 500)
      return invalid(res, "Description", "Descriptions are 500 characters or fewer.");
    if (!Array.isArray(body.mediaIds) || body.mediaIds.length === 0)
      return invalid(res, "MediaIds", "Add at least one photo or video.");
    for (const id of body.mediaIds) {
      const media = db.media.get(id);
      if (!media || media.userId !== me)
        return invalid(res, "MediaIds", `Media ${id} isn't one of your uploads.`);
      if (media.status === "Uploading")
        return invalid(res, "MediaIds", `Media ${id} hasn't finished uploading.`);
    }
    const pending = body.mediaIds.some((id) => db.media.get(id).status !== "Ready");
    const created = post(
      randomUUID(),
      me,
      body.title.trim(),
      types[0],
      body.mediaIds,
      new Date().toISOString(),
      {
        description: body.description,
        types,
        passengers,
        vehicle: body.vehicleType
          ? {
              type: body.vehicleType,
              make: body.vehicleMake ?? null,
              model: body.vehicleModel ?? null,
              colour: body.vehicleColour ?? null,
            }
          : null,
        reportedToPolice: body.reportedToPolice ?? null,
        placeName: body.placeName,
        isSensitive: body.isSensitive,
        mediaState: pending ? "Pending" : "Ready",
      },
    );
    created.incidentAt = body.incidentAt;
    created.latitude = Math.round(body.latitude / 0.0045) * 0.0045;
    created.longitude = body.longitude;
    db.posts.unshift(created);
    if (body.draftId) db.drafts = db.drafts.filter((d) => !(d.id === body.draftId && d.authorId === me));
    return send(res, 201, postDto(created, me));
  }

  // Drafts: like bjk-modules' DraftsController.
  const draftDto = (d) => ({
    ...d,
    authorId: undefined,
    mediaIds: undefined,
    media: d.mediaIds
      .map((id) => db.media.get(id))
      .filter((m) => m && m.status !== "Deleted")
      .map((m) => ({
        mediaId: m.id,
        mediaType: m.mediaType,
        status: m.status,
        thumbnailUrl: m.thumbnailUrl,
        playbackUrl: m.playbackUrl,
        durationSeconds: m.durationSeconds,
        width: m.width,
        height: m.height,
        failureReason: m.failureReason,
      })),
    expiresAt: new Date(Date.parse(d.updatedAt) + 30 * 86_400_000).toISOString(),
  });
  const draftFrom = (body) => ({
    title: body.title ?? null,
    description: body.description ?? null,
    types: body.types ?? [],
    incidentAt: body.incidentAt ?? null,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    placeName: body.placeName ?? null,
    isSensitive: !!body.isSensitive,
    passengers: body.passengers ?? [],
    vehicleType: body.vehicleType ?? null,
    vehicleMake: body.vehicleMake ?? null,
    vehicleModel: body.vehicleModel ?? null,
    vehicleColour: body.vehicleColour ?? null,
    reportedToPolice: body.reportedToPolice ?? null,
    mediaIds: body.mediaIds ?? [],
    updatedAt: new Date().toISOString(),
  });
  if (path === "/api/posts/drafts" && method === "GET") {
    if (!requireUser()) return;
    const mine = db.drafts
      .filter((d) => d.authorId === me)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return send(res, 200, mine.map(draftDto));
  }
  if (path === "/api/posts/drafts" && method === "POST") {
    if (!requireUser()) return;
    const body = await json();
    if (db.drafts.filter((d) => d.authorId === me).length >= 5)
      return invalid(res, "Drafts", "You can keep up to 5 drafts. Post or delete one first.");
    const now = new Date().toISOString();
    const draft = { id: randomUUID(), authorId: me, createdAt: now, ...draftFrom(body) };
    db.drafts.push(draft);
    return send(res, 201, draftDto(draft));
  }
  if ((m = path.match(/^\/api\/posts\/drafts\/([0-9a-f-]{36})$/))) {
    if (!requireUser()) return;
    const draft = db.drafts.find((d) => d.id === m[1] && d.authorId === me);
    if (!draft) return problem(res, 404, "Draft not found.");
    if (method === "GET") return send(res, 200, draftDto(draft));
    if (method === "PUT") {
      Object.assign(draft, draftFrom(await json()));
      return send(res, 200, draftDto(draft));
    }
    if (method === "DELETE") {
      db.drafts = db.drafts.filter((d) => d !== draft);
      return send(res, 204);
    }
  }
  if ((m = path.match(/^\/api\/posts\/([0-9a-f-]{36})$/))) {
    const p = db.posts.find((x) => x.id === m[1]);
    if (!p || !canSee(p, me)) return problem(res, 404, `Post ${m[1]} was not found.`);
    if (method === "GET") return send(res, 200, postDto(p, me));
    if (method === "DELETE") {
      if (p.authorId !== me) return problem(res, 403, "You can only change your own posts.");
      db.posts = db.posts.filter((x) => x !== p);
      return send(res, 204);
    }
  }
  if ((m = path.match(/^\/api\/posts\/([0-9a-f-]{36})\/(.+)$/))) {
    const p = db.posts.find((x) => x.id === m[1]);
    if (!requireUser()) return;
    if (!p || !canSee(p, me)) return problem(res, 404, `Post ${m[1]} was not found.`);
    const rest = m[2];
    if (rest === "passengers/me") {
      const tag = p.passengers.find((t) => t.userId === me);
      if (!tag) return problem(res, 404, "Passenger tag not found.");
      if (method === "DELETE") {
        p.passengers = p.passengers.filter((t) => t !== tag);
        return send(res, 204);
      }
      const { accept } = await json();
      if (tag.status === "Declined" && accept) return invalid(res, "Accept", "You declined this tag.");
      tag.status = accept ? "Accepted" : "Declined";
      return send(res, 200, postDto(p, me));
    }
    if (rest === "reaction") {
      const map = db.reactions.get(p.id) ?? new Map();
      db.reactions.set(p.id, map);
      if (method === "PUT") {
        const { type } = await json();
        if (!REACTIONS.has(type)) return invalid(res, "Type", "Choose a reaction.");
        map.set(me, type);
      } else {
        map.delete(me);
      }
      return send(res, 204);
    }
    if (rest === "comments" && method === "GET") {
      const top = db.comments.filter((c) => c.postId === p.id && !c.parentId && c.status === "Visible");
      return send(
        res,
        200,
        page(top, url, (c) => commentDto(c, me, true)),
      );
    }
    if (rest === "comment-setting" && method === "PUT") {
      if (p.authorId !== me) return problem(res, 403, "You can only change your own posts.");
      const { setting } = await json();
      if (!["Everyone", "Off"].includes(setting)) return invalid(res, "Setting", "Choose who can comment.");
      p.commentSetting = setting;
      return send(res, 204);
    }
    if (rest === "comments" && method === "POST") {
      if (p.commentSetting === "Off" && p.authorId !== me)
        return problem(res, 403, "The author has turned comments off on this post.");
      const { body } = await json();
      if (!body?.trim()) return invalid(res, "Body", "Write something first.");
      if (/\b[A-Z]{2}\d{2} ?[A-Z]{3}\b/.test(body))
        return invalid(res, "Body", "Number plates aren't allowed. Please remove it.");
      return send(res, 201, commentDto(addComment(p.id, me, body.trim(), null), me, true));
    }
    if (rest === "reports" && method === "POST") {
      const body = await json();
      if (db.reports.some((r) => r.target === p.id && r.by === me))
        return invalid(res, "", "You've already reported this post.");
      db.reports.push({ target: p.id, by: me, ...body });
      return send(res, 204);
    }
    if (rest === "appeal" && method === "POST") {
      const { statement } = await json();
      const appeal = {
        id: randomUUID(),
        reference: `A-${db.appeals.length + 1001}`,
        status: "Open",
        statement,
        dueAt: new Date(Date.now() + 172_800_000).toISOString(),
      };
      db.appeals.push(appeal);
      return send(res, 200, appeal);
    }
    let c;
    if (
      (c = rest.match(/^comments\/([0-9a-f-]{36})(?:\/(replies|reaction|reports|appeal|history|hidden))?$/))
    ) {
      const comment = db.comments.find((x) => x.id === c[1] && x.postId === p.id);
      if (!comment) return problem(res, 404, "Comment not found.");
      const action = c[2];
      if (action === "history" && method === "GET") {
        if (!shownTo(comment, me)) return problem(res, 404, "Comment not found.");
        return send(res, 200, [
          { body: comment.body, writtenAt: comment.editedAt ?? comment.createdAt, isCurrent: true },
          ...(comment.history ?? []).map((v) => ({ ...v, isCurrent: false })),
        ]);
      }
      if (action === "hidden" && method === "PUT") {
        if (p.authorId !== me) return problem(res, 403, "Only the post's author can hide comments on it.");
        if (comment.authorId === me)
          return invalid(res, "CommentId", "That's your own comment: delete it instead.");
        comment.hiddenByAuthor = (await json()).hidden;
        return send(res, 200, commentDto(comment, me, false));
      }
      if (action === "replies" && method === "GET") {
        if (!shownTo(comment, me))
          return send(
            res,
            200,
            page([], url, (r) => r),
          );
        const replies = db.comments.filter((r) => r.parentId === comment.id && r.status === "Visible");
        return send(
          res,
          200,
          page(replies, url, (r) => commentDto(r, me, false)),
        );
      }
      if (action === "replies" && method === "POST") {
        if (p.commentSetting === "Off" && p.authorId !== me)
          return problem(res, 403, "The author has turned comments off on this post.");
        if (comment.hiddenByAuthor && p.authorId !== me)
          return problem(res, 403, "The post's author hid this comment, so it can't be replied to.");
        if (comment.parentId)
          return invalid(res, "ParentCommentId", "Replies go one level deep: reply to the comment instead.");
        const { body } = await json();
        if (!body?.trim()) return invalid(res, "Body", "Write something first.");
        return send(res, 201, commentDto(addComment(p.id, me, body.trim(), comment.id), me, false));
      }
      if (action === "reaction") {
        const map = db.commentReactions.get(comment.id) ?? new Map();
        db.commentReactions.set(comment.id, map);
        if (method === "PUT") map.set(me, (await json()).type);
        else map.delete(me);
        return send(res, 204);
      }
      if (action === "reports") {
        db.reports.push({ target: comment.id, by: me, ...(await json()) });
        return send(res, 204);
      }
      if (!action && method === "PUT") {
        if (comment.authorId !== me) return problem(res, 403, "You can only edit your own comments.");
        const { body } = await json();
        if (!body?.trim()) return invalid(res, "Body", "Write something first.");
        if (body.trim() !== comment.body) {
          const now = new Date().toISOString();
          comment.history = [
            { body: comment.body, writtenAt: comment.editedAt ?? comment.createdAt },
            ...(comment.history ?? []),
          ];
          comment.body = body.trim();
          comment.editedAt = now;
          comment.updatedAt = now;
        }
        return send(res, 200, commentDto(comment, me, false));
      }
      if (!action && method === "DELETE") {
        if (comment.authorId !== me) return problem(res, 403, "You can only delete your own comments.");
        comment.status = "Deleted";
        return send(res, 204);
      }
    }
  }

  // Reports
  if (path === "/api/reports/public" && method === "POST") {
    const body = await json();
    if (!req.headers["x-captcha-token"])
      return invalid(res, "X-Captcha-Token", "The X-Captcha-Token header is required.");
    if (!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(body.target ?? "")) {
      return invalid(
        res,
        "Target",
        "That doesn't look like a link to a Bad Jockeys post. Check the link and try again.",
      );
    }
    if (!body.consent)
      return invalid(res, "Consent", "Please confirm we can use your name and email to handle your report.");
    if (!body.reporterName?.trim()) return invalid(res, "ReporterName", "Enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(body.reporterEmail ?? ""))
      return invalid(res, "ReporterEmail", "Enter a valid email address.");
    const urgent = body.reason === "IllegalContent" || body.reason === "Threat";
    const receipt = {
      reference: `R-${String(db.publicReports.length + 2601).padStart(5, "0")}`,
      priority: urgent ? "Urgent" : "Normal",
      respondBy: new Date(Date.now() + (urgent ? 4 : 48) * 3_600_000).toISOString(),
      acknowledgementSent: true,
    };
    db.publicReports.push({ ...body, ...receipt, captcha: req.headers["x-captcha-token"] });
    return send(res, 200, receipt);
  }
  if ((m = path.match(/^\/api\/profiles\/([a-z0-9_]+)\/reports$/)) && method === "POST") {
    if (!requireUser()) return;
    db.reports.push({ target: m[1], by: me, ...(await json()) });
    return send(res, 204);
  }

  // Profiles
  if (path === "/api/profiles/me") {
    if (!requireUser()) return;
    const mine = db.profiles.get(me);
    if (method === "GET")
      return mine ? send(res, 200, profileDto(mine, true)) : problem(res, 404, "Profile not found.");
    if (method === "PUT") {
      if (!mine) return problem(res, 404, "Profile not found.");
      const body = await json();
      Object.assign(mine, { displayName: body.displayName, bio: body.bio, location: body.location });
      return send(res, 200, profileDto(mine));
    }
  }
  if (path === "/api/profiles" && method === "POST") {
    if (!requireUser()) return;
    const body = await json();
    if (db.profiles.has(me)) return invalid(res, "", "You already have a profile.");
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(body.handle ?? ""))
      return invalid(res, "Handle", "Handles are 3 to 30 lower-case letters, digits or underscores.");
    if ([...db.profiles.values()].some((p) => p.handle === body.handle))
      return invalid(res, "Handle", "That handle is taken.");
    if (!body.displayName?.trim()) return invalid(res, "DisplayName", "Enter a display name.");
    const created = {
      id: me,
      handle: body.handle,
      displayName: body.displayName,
      bio: body.bio,
      location: body.location,
      avatarMediaId: null,
      createdAt: new Date().toISOString(),
    };
    db.profiles.set(me, created);
    return send(res, 201, profileDto(created));
  }
  if (path === "/api/profiles/me/road-user" && method === "PUT") {
    if (!requireUser()) return;
    const mine = db.profiles.get(me);
    if (!mine) return problem(res, 404, "Profile not found.");
    const body = await json();
    if (body.roadUser !== null && !["Driver", "Cyclist", "Both"].includes(body.roadUser))
      return invalid(res, "RoadUser", "Choose driver, cyclist or both.");
    mine.roadUser = body.roadUser;
    mine.showRoadUser = body.roadUser !== null && !!body.show;
    return send(res, 200, profileDto(mine, true));
  }
  if (path === "/api/profiles/me/handle" && method === "PUT") {
    if (!requireUser()) return;
    db.profiles.get(me).handle = (await json()).handle;
    return send(res, 200, profileDto(db.profiles.get(me)));
  }
  if (path === "/api/profiles/me/avatar" && method === "PUT") {
    if (!requireUser()) return;
    db.profiles.get(me).avatarMediaId = (await json()).mediaId;
    return send(res, 200, profileDto(db.profiles.get(me)));
  }
  if (path === "/api/profiles/me/blocks" && method === "GET") {
    if (!requireUser()) return;
    return send(
      res,
      200,
      [...(db.blocks.get(me) ?? [])].map((id) => ({
        userId: id,
        handle: db.profiles.get(id)?.handle ?? null,
        displayName: null,
        avatarUrl: null,
        blockedAt: new Date().toISOString(),
      })),
    );
  }
  if ((m = path.match(/^\/api\/profiles\/me\/blocks\/(.+)$/))) {
    if (!requireUser()) return;
    const target = [...db.profiles.values()].find((p) => p.handle === m[1] || p.id === m[1]);
    if (!target) return problem(res, 404, "Profile not found.");
    const set = db.blocks.get(me) ?? new Set();
    db.blocks.set(me, set);
    if (method === "PUT") {
      set.add(target.id);
      return send(res, 200, {
        userId: target.id,
        handle: target.handle,
        displayName: target.displayName,
        avatarUrl: null,
        blockedAt: new Date().toISOString(),
      });
    }
    set.delete(target.id);
    return send(res, 204);
  }
  if ((m = path.match(/^\/api\/profiles\/handles\/([^/]+)\/availability$/))) {
    const handle = decodeURIComponent(m[1]).toLowerCase();
    const taken = [...db.profiles.values()].some((p) => p.handle === handle);
    const reserved = ["admin", "badjockeys", "support"].includes(handle);
    return send(res, 200, {
      handle,
      available: !taken && !reserved,
      reason: taken ? "That handle is taken." : reserved ? "That handle is reserved." : null,
    });
  }
  // Following (UI step 6)
  const byHandle = (h) =>
    [...db.profiles.values()].find((p) => p.handle === h.replace(/^@/, "").toLowerCase() || p.id === h);
  const follows = (a, b) => db.follows.has(`${a}>${b}`);
  const followerCount = (id) => [...db.follows].filter((f) => f.endsWith(`>${id}`)).length;
  const followProfile = (p) => ({
    id: p.id,
    handle: p.handle,
    displayName: p.displayName,
    avatarUrl: null,
    bio: p.bio ?? null,
    isFollowing: me && me !== p.id ? follows(me, p.id) : null,
  });
  if ((m = path.match(/^\/api\/profiles\/me\/following\/(.+)$/))) {
    if (!requireUser()) return;
    const target = byHandle(decodeURIComponent(m[1]));
    if (!target) return problem(res, 404, "Profile not found.");
    if (method === "PUT") {
      if (target.id === me) return invalid(res, "User", "You can't follow yourself.");
      if (!db.profiles.has(me))
        return invalid(res, "Profile", "Create your profile before following people.");
      db.follows.add(`${me}>${target.id}`);
      return send(res, 200, { userId: target.id, following: true, followerCount: followerCount(target.id) });
    }
    db.follows.delete(`${me}>${target.id}`);
    return send(res, 200, { userId: target.id, following: false, followerCount: followerCount(target.id) });
  }
  if (path === "/api/profiles/me/suggestions" && method === "GET") {
    if (!requireUser()) return;
    // Everyone with a profile you don't follow stands in for "people near your home area".
    const people = [...db.profiles.values()]
      .filter((p) => p.id !== me && !follows(me, p.id))
      .slice(0, Number(url.searchParams.get("limit") ?? 3))
      .map(followProfile);
    return send(res, 200, { people, hasHomeArea: true });
  }
  if ((m = path.match(/^\/api\/profiles\/([A-Za-z0-9_]+)\/(followers|following)$/)) && method === "GET") {
    const owner = byHandle(m[1]);
    if (!owner) return problem(res, 404, "Profile not found.");
    const ids = [...db.follows]
      .map((f) => f.split(">"))
      .filter(([a, b]) => (m[2] === "followers" ? b === owner.id : a === owner.id))
      .map(([a, b]) => (m[2] === "followers" ? a : b));
    const people = ids.map((id) => db.profiles.get(id)).filter(Boolean);
    return send(res, 200, page(people, url, followProfile));
  }
  if ((m = path.match(/^\/api\/profiles\/([A-Za-z0-9_]+)$/)) && method === "GET") {
    const found = [...db.profiles.values()].find((p) => p.handle === m[1].toLowerCase());
    if (!found) return problem(res, 404, "Profile not found.");
    return send(res, 200, {
      ...profileDto(found),
      followerCount: followerCount(found.id),
      followingCount: [...db.follows].filter((f) => f.startsWith(`${found.id}>`)).length,
      isFollowing: me && me !== found.id ? follows(me, found.id) : null,
      followsYou: me && me !== found.id ? follows(found.id, me) : null,
    });
  }

  // Media
  if (path === "/api/media/uploads" && method === "POST") {
    if (!requireUser()) return;
    const body = await json();
    const type = body.contentType?.startsWith("video/")
      ? "Video"
      : body.contentType?.startsWith("image/")
        ? "Image"
        : null;
    if (!type)
      return invalid(res, "ContentType", "Upload a photo (JPEG, PNG, HEIC, WebP) or a video (MP4, MOV).");
    const id = randomUUID();
    db.media.set(id, {
      id,
      userId: me,
      mediaType: type,
      status: "Uploading",
      originalFileName: body.fileName,
      playbackUrl: null,
      thumbnailUrl: null,
      durationSeconds: null,
      width: null,
      height: null,
      failureReason: null,
      createdAt: new Date().toISOString(),
      contentType: body.contentType,
      stored: false,
    });
    return send(res, 201, {
      mediaId: id,
      mediaType: type,
      upload: {
        url: `${ORIGIN}/storage/${id}`,
        method: "PUT",
        headers: { "Content-Type": body.contentType },
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      },
    });
  }
  if ((m = path.match(/^\/api\/media\/([0-9a-f-]{36})(\/complete)?$/))) {
    if (!requireUser()) return;
    const media = db.media.get(m[1]);
    if (!media || media.userId !== me) return problem(res, 404, "Media not found.");
    if (m[2] && method === "POST") {
      if (!media.stored) return invalid(res, "MediaId", "The file hasn't arrived in storage yet.");
      media.status = "Processing";
      setTimeout(() => finishProcessing(media), PROCESSING_MS);
      return send(res, 202, mediaDto(media));
    }
    if (method === "GET") return send(res, 200, mediaDto(media));
    if (method === "DELETE") {
      media.status = "Deleted";
      return send(res, 204);
    }
  }
  if (path === "/api/me/data-export" && method === "GET") {
    if (!requireUser()) return;
    return send(res, 200, {
      profile: db.profiles.get(me) ?? null,
      posts: db.posts.filter((p) => p.authorId === me),
    });
  }
  return false;
}

const VEHICLES = {
  types: [
    "Car",
    "Van",
    "Lorry",
    "Bus",
    "Coach",
    "Taxi",
    "Motorbike",
    "Bicycle",
    "EScooter",
    "Tractor",
    "Other",
  ],
  colours: ["Black", "White", "Silver", "Grey", "Blue", "Red", "Other"],
  makes: [
    { name: "BMW", models: ["1 Series", "3 Series", "X5", "Other"] },
    { name: "Ford", models: ["Fiesta", "Focus", "Transit", "Other"] },
    { name: "Other", models: ["Other"] },
  ],
};
const PLACES = [
  { name: "Rainhill", detail: "St. Helens, North West", latitude: 53.42, longitude: -2.77 },
  { name: "Rainford", detail: "St. Helens, North West", latitude: 53.5, longitude: -2.79 },
  { name: "Kirkstall", detail: "Leeds, Yorkshire and The Humber", latitude: 53.82, longitude: -1.6 },
];
const NOTIFICATION_TYPES = [
  ["PassengerTagged", "Someone tags you as a passenger", true, true],
  ["PassengerAccepted", "Someone accepts your passenger tag", true, false],
  ["CommentOnPost", "Comments on your posts", true, false],
  ["ReplyToComment", "Replies to your comments", true, false],
  ["ReactionOnPost", "Reactions to your posts", true, false],
];
function notificationDto(n) {
  const actor = n.actorId ? author(n.actorId) : null;
  const who = actor?.displayName ?? "Someone";
  const text =
    n.type === "PassengerTagged"
      ? `${who} tagged you as a passenger on \u201c${n.postTitle}\u201d. Accept to show your name.`
      : `${who} commented on your post \u201c${n.postTitle}\u201d.`;
  return { ...n, actor, text };
}
function profileDto(p, owner = false) {
  return {
    id: p.id,
    handle: p.handle,
    displayName: p.displayName,
    bio: p.bio ?? null,
    location: p.location ?? null,
    avatarUrl: avatarUrl(p),
    createdAt: p.createdAt,
    roadUser: owner || p.showRoadUser ? (p.roadUser ?? null) : null,
    showRoadUser: owner ? !!p.showRoadUser : null,
  };
}

function finishProcessing(media) {
  if (media.status !== "Processing") return;
  media.status = "Ready";
  const ext = media.mediaType === "Video" ? "webm" : "png";
  media.playbackUrl = `${ORIGIN}/media/${media.id}.${ext}`;
  media.thumbnailUrl = `${ORIGIN}/media/${media.id}-thumb.png`;
  media.width = 1280;
  media.height = 720;
  media.durationSeconds = media.mediaType === "Video" ? 12 : null;
  for (const p of db.posts) {
    if (p.mediaState === "Pending" && p.mediaIds.every((id) => db.media.get(id)?.status === "Ready")) {
      p.mediaState = "Ready";
    }
  }
}

// --- Server ---
const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    // Storage: the browser PUTs straight here, cross-origin, like S3Mock or R2.
    if (url.pathname.startsWith("/storage/")) {
      const cors = {
        "Access-Control-Allow-Origin": WEB_ORIGIN,
        "Access-Control-Allow-Methods": "PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      };
      if (req.method === "OPTIONS") return send(res, 204, undefined, cors);
      const media = db.media.get(url.pathname.slice("/storage/".length));
      const body = await readBody(req);
      if (!media || req.method !== "PUT" || body.length === 0) return send(res, 400, "Bad upload", cors);
      media.stored = true;
      media.sizeBytes = body.length;
      return send(res, 200, "", cors);
    }
    if (url.pathname.startsWith("/media/") && url.pathname.endsWith(".webm")) {
      res.writeHead(200, {
        "Content-Type": "video/webm",
        "Content-Length": WEBM.length,
        "Cache-Control": "max-age=60",
      });
      return res.end(WEBM);
    }
    if (url.pathname.startsWith("/tiles/")) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=3600" });
      return res.end(PNG);
    }
    if (url.pathname.startsWith("/media/")) {
      if (!url.pathname.endsWith(".png")) return send(res, 404, "Not found");
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=60" });
      return res.end(PNG);
    }
    if (url.pathname === "/__reset" && req.method === "POST") {
      USERS.newbie.ageVerified = false;
      USERS.larry.ageVerified = false;
      seed();
      return send(res, 200, { ok: true, seed: SEED });
    }
    if (url.pathname === "/__state") {
      return send(res, 200, {
        reports: db.reports,
        publicReports: db.publicReports,
        posts: db.posts.map((p) => ({ id: p.id, title: p.title, mediaState: p.mediaState })),
      });
    }
    if (url.pathname === "/__next-user" && req.method === "POST") {
      nextUser = (await readBody(req)).toString() || "roadhog";
      return send(res, 200, { nextUser });
    }
    if (url.pathname === "/health") return send(res, 200, "Healthy");
    if ((await identity(req, res, url)) !== false) return;
    if (url.pathname.startsWith("/api/") && (await api(req, res, url)) !== false) return;
    if (!res.headersSent) send(res, 404, { status: 404, title: "Not found" });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { status: 500, title: String(error) });
  }
});

server.listen(PORT, () => console.log(`Mock identity server and API on ${ORIGIN}`));

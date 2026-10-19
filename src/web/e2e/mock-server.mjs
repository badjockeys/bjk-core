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

// --- Data ---
const USERS = {
  roadhog: { id: "00000000-0000-4000-8000-0000000000a1", email: "rider@example.com", ageVerified: true },
  dave: { id: "00000000-0000-4000-8000-0000000000b2", email: "dave@example.com", ageVerified: true },
  newbie: { id: "00000000-0000-4000-8000-0000000000c3", email: "new@example.com", ageVerified: false },
};
export const SEED = {
  photoPost: "8f2e1c3a-0000-4000-8000-000000000001",
  videoPost: "8f2e1c3a-0000-4000-8000-000000000002",
  sensitivePost: "8f2e1c3a-0000-4000-8000-000000000003",
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
    playbackUrl: `${ORIGIN}/media/${id}.${mediaType === "Video" ? "mp4" : "png"}`,
    thumbnailUrl: `${ORIGIN}/media/${id}-thumb.png`,
    durationSeconds: mediaType === "Video" ? 24 : null,
    width: 1280,
    height: 720,
    failureReason: null,
    createdAt: ago(200),
  });
  const dave = USERS.dave.id;
  db = {
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
      ].map((m) => [m.id, m]),
    ),
    posts: [
      post(SEED.sensitivePost, dave, "Serious crash on the A64", "RoadRage", ["m-5"], ago(30), {
        isSensitive: true,
      }),
      post(SEED.videoPost, dave, "Undertaking a lorry on the M62", "Undertaking", ["m-4"], ago(300)),
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
    appeals: [],
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
    ? { id, handle: p.handle, displayName: p.displayName, avatarUrl: avatarUrl(p) }
    : { id, handle: null, displayName: "Former member", avatarUrl: null };
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
function postDto(p, viewer) {
  const reactions = db.reactions.get(p.id);
  return {
    id: p.id,
    author: author(p.authorId),
    title: p.title,
    description: p.description,
    category: p.category,
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
        playbackUrl: m.playbackUrl,
        thumbnailUrl: m.thumbnailUrl,
        durationSeconds: m.durationSeconds,
        width: m.width,
        height: m.height,
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
  };
}
function commentDto(c, viewer, withReplies) {
  const reactions = db.commentReactions.get(c.id);
  const replies = db.comments.filter((r) => r.parentId === c.id && r.status === "Visible");
  return {
    id: c.id,
    postId: c.postId,
    author: author(c.authorId),
    body: c.body,
    createdAt: c.createdAt,
    updatedAt: null,
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
  if (!viewer && p.isSensitive) return false;
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
  return { id: claims.sub, ageVerified: claims.age_verified === "true", email: claims.email };
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
const AGE_PROBLEM = {
  type: "https://badjockeys.com/problems/age-verification-required",
  code: "age_verification_required",
};

async function api(req, res, url) {
  const path = url.pathname;
  const method = req.method;
  const viewer = viewerOf(req);
  const me = viewer.id;
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
  const requireAge = () => {
    if (!viewer.ageVerified) {
      problem(res, 403, "Complete the age check before you post, comment, react or report.", AGE_PROBLEM);
      return false;
    }
    return true;
  };
  let m;

  // Posts
  if (path === "/api/posts" && method === "GET") {
    const category = url.searchParams.get("category");
    const handle = url.searchParams.get("author");
    const authorId = handle ? [...db.profiles.values()].find((p) => p.handle === handle)?.id : null;
    const items = db.posts.filter(
      (p) =>
        isPublic(p) &&
        canSee(p, me) &&
        (!category || p.category === category) &&
        (!handle || p.authorId === authorId),
    );
    return send(
      res,
      200,
      page(items, url, (p) => postDto(p, me)),
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
    if (!requireUser() || !requireAge()) return;
    const body = await json();
    if (!db.profiles.has(me)) return invalid(res, "Profile", "Create your profile before posting.");
    if (!body.title?.trim()) return invalid(res, "Title", "Add a title.");
    if (!CATEGORIES.has(body.category)) return invalid(res, "Category", "Choose a category.");
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
      body.category,
      body.mediaIds,
      new Date().toISOString(),
      {
        description: body.description,
        placeName: body.placeName,
        isSensitive: body.isSensitive,
        mediaState: pending ? "Pending" : "Ready",
      },
    );
    created.incidentAt = body.incidentAt;
    created.latitude = Math.round(body.latitude / 0.0045) * 0.0045;
    created.longitude = body.longitude;
    db.posts.unshift(created);
    return send(res, 201, postDto(created, me));
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
    if (rest === "reaction") {
      if (!requireAge()) return;
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
    if (rest === "comments" && method === "POST") {
      if (!requireAge()) return;
      const { body } = await json();
      if (!body?.trim()) return invalid(res, "Body", "Write something first.");
      if (/\b[A-Z]{2}\d{2} ?[A-Z]{3}\b/.test(body))
        return invalid(res, "Body", "Number plates aren't allowed. Please remove it.");
      return send(res, 201, commentDto(addComment(p.id, me, body.trim(), null), me, true));
    }
    if (rest === "reports" && method === "POST") {
      if (!requireAge()) return;
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
    if ((c = rest.match(/^comments\/([0-9a-f-]{36})(?:\/(replies|reaction|reports|appeal))?$/))) {
      const comment = db.comments.find((x) => x.id === c[1] && x.postId === p.id);
      if (!comment) return problem(res, 404, "Comment not found.");
      const action = c[2];
      if (action === "replies" && method === "GET") {
        const replies = db.comments.filter((r) => r.parentId === comment.id && r.status === "Visible");
        return send(
          res,
          200,
          page(replies, url, (r) => commentDto(r, me, false)),
        );
      }
      if (action === "replies" && method === "POST") {
        if (!requireAge()) return;
        if (comment.parentId)
          return invalid(res, "ParentCommentId", "Replies go one level deep: reply to the comment instead.");
        const { body } = await json();
        if (!body?.trim()) return invalid(res, "Body", "Write something first.");
        return send(res, 201, commentDto(addComment(p.id, me, body.trim(), comment.id), me, false));
      }
      if (action === "reaction") {
        if (!requireAge()) return;
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
      return mine ? send(res, 200, profileDto(mine)) : problem(res, 404, "Profile not found.");
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
  if ((m = path.match(/^\/api\/profiles\/([A-Za-z0-9_]+)$/)) && method === "GET") {
    const found = [...db.profiles.values()].find((p) => p.handle === m[1].toLowerCase());
    return found ? send(res, 200, profileDto(found)) : problem(res, 404, "Profile not found.");
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

function profileDto(p) {
  return {
    id: p.id,
    handle: p.handle,
    displayName: p.displayName,
    bio: p.bio ?? null,
    location: p.location ?? null,
    avatarUrl: avatarUrl(p),
    createdAt: p.createdAt,
  };
}

function finishProcessing(media) {
  if (media.status !== "Processing") return;
  media.status = "Ready";
  const ext = media.mediaType === "Video" ? "mp4" : "png";
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
    if (url.pathname.startsWith("/media/")) {
      if (!url.pathname.endsWith(".png")) return send(res, 404, "Not found");
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=60" });
      return res.end(PNG);
    }
    if (url.pathname === "/__reset" && req.method === "POST") {
      USERS.newbie.ageVerified = false;
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

// The signed-in user's tokens live in an encrypted, httpOnly cookie (JWE, A256GCM, key derived from AUTH_SECRET).
// The browser stores it but can't read or change it, and scripts can't see it at all. No server-side store is needed,
// so any replica can serve any request. Cookies hold at most ~4 KB, so a long value is split across numbered chunks.

import { EncryptJWT, jwtDecrypt } from "jose";

export interface Session {
  /** The user's id (the token's sub): the same GUID as their account and profile. */
  sub: string;
  accessToken: string;
  /** When the access token expires, in seconds since 1970. */
  accessTokenExpiresAt: number;
  /** One-time refresh token: each refresh returns a new one. */
  refreshToken?: string;
  /** Sent back to the identity server on sign-out, so it doesn't ask "are you sure?". Dropped if too big. */
  idToken?: string;
  email?: string;
  /** The access token carries age_verified = "true": the user passed the age check. */
  ageVerified: boolean;
  /** The access token carries email_verified = "true". Posting and commenting need it. */
  emailVerified: boolean;
}

/** A sign-in that's in progress: what the callback must check, and where to go afterwards. */
export interface SignInTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export const TRANSACTION_LIFETIME_SECONDS = 15 * 60;
const CHUNK_SIZE = 3800;
const MAX_CHUNKS = 4;

const keys = new Map<string, Promise<Uint8Array>>();

async function keyFor(secret: string, purpose: string): Promise<Uint8Array> {
  const id = `${purpose}:${secret}`;
  let key = keys.get(id);
  if (!key) {
    key = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(`bjk-web:${purpose}:${secret}`))
      .then((digest) => new Uint8Array(digest));
    keys.set(id, key);
  }
  return key;
}

export async function seal(
  value: object,
  secret: string,
  purpose: string,
  lifetimeSeconds: number,
): Promise<string> {
  return new EncryptJWT({ v: value as Record<string, unknown> })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${lifetimeSeconds}s`)
    .encrypt(await keyFor(secret, purpose));
}

export async function unseal<T>(token: string, secret: string, purpose: string): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, await keyFor(secret, purpose));
    return (payload.v as T) ?? null;
  } catch {
    return null;
  }
}

export function sealSession(session: Session, secret: string): Promise<string> {
  return seal(session, secret, "session", SESSION_LIFETIME_SECONDS);
}

export function unsealSession(token: string, secret: string): Promise<Session | null> {
  return unseal<Session>(token, secret, "session");
}

export function sealTransaction(tx: SignInTransaction, secret: string): Promise<string> {
  return seal(tx, secret, "signin", TRANSACTION_LIFETIME_SECONDS);
}

export function unsealTransaction(token: string, secret: string): Promise<SignInTransaction | null> {
  return unseal<SignInTransaction>(token, secret, "signin");
}

// --- Cookies ---

/** `__Host-` cookies must be Secure, so the prefix is only used over HTTPS. */
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-bjk_session" : "bjk_session";
}

export function transactionCookieName(secure: boolean): string {
  return secure ? "__Host-bjk_signin" : "bjk_signin";
}

export interface CookieReader {
  getAll(): { name: string; value: string }[];
}

export interface CookieWriter {
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(name: string): unknown;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict";
  path: string;
  maxAge: number;
}

export function cookieOptions(secure: boolean, maxAge: number): CookieOptions {
  // Lax, so the cookie comes along when the identity server sends the browser back after signing in.
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge };
}

/** Split a value into numbered cookies: name.0, name.1, ... */
export function chunk(name: string, value: string): { name: string; value: string }[] {
  const parts: { name: string; value: string }[] = [];
  for (let i = 0; i * CHUNK_SIZE < value.length; i++) {
    parts.push({ name: `${name}.${i}`, value: value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
  }
  return parts;
}

/** Join numbered cookies back together. Undefined if there are none or one is missing. */
export function readChunked(cookies: CookieReader, name: string): string | undefined {
  const parts = new Map<number, string>();
  for (const cookie of cookies.getAll()) {
    if (cookie.name.startsWith(`${name}.`)) {
      const index = Number(cookie.name.slice(name.length + 1));
      if (Number.isInteger(index) && index >= 0) {
        parts.set(index, cookie.value);
      }
    }
  }
  if (parts.size === 0) {
    return undefined;
  }
  let value = "";
  for (let i = 0; i < parts.size; i++) {
    const part = parts.get(i);
    if (part === undefined) {
      return undefined;
    }
    value += part;
  }
  return value;
}

/** The chunk cookies currently set for a name, so stale ones can be removed. */
export function chunkNames(cookies: CookieReader, name: string): string[] {
  return cookies
    .getAll()
    .map((c) => c.name)
    .filter((n) => n.startsWith(`${name}.`));
}

/**
 * Writes the sealed session (dropping the ID token if it's too big to fit), deleting any chunks left over from a
 * longer value. Returns the cookies written, so a proxy can also pass them on to the page it's forwarding to.
 */
export async function writeSession(
  reader: CookieReader,
  writer: CookieWriter,
  session: Session,
  secret: string,
  secure: boolean,
): Promise<{ name: string; value: string }[]> {
  const name = sessionCookieName(secure);
  let sealed = await sealSession(session, secret);
  if (sealed.length > CHUNK_SIZE * MAX_CHUNKS && session.idToken) {
    sealed = await sealSession({ ...session, idToken: undefined }, secret);
  }
  const parts = chunk(name, sealed);
  const keep = new Set(parts.map((p) => p.name));
  for (const old of chunkNames(reader, name)) {
    if (!keep.has(old)) {
      writer.delete(old);
    }
  }
  for (const part of parts) {
    writer.set(part.name, part.value, cookieOptions(secure, SESSION_LIFETIME_SECONDS));
  }
  return parts;
}

export function clearSession(reader: CookieReader, writer: CookieWriter, secure: boolean): void {
  for (const old of chunkNames(reader, sessionCookieName(secure))) {
    writer.delete(old);
  }
}

export async function readSession(
  reader: CookieReader,
  secret: string,
  secure: boolean,
): Promise<Session | null> {
  const sealed = readChunked(reader, sessionCookieName(secure));
  return sealed ? unsealSession(sealed, secret) : null;
}

// --- Tokens ---

/** The claims in a JWT, without checking its signature: only for deciding what to show, never for trust. */
export function decodeJwtClaims(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) {
    return {};
  }
  try {
    const json = new TextDecoder().decode(base64UrlDecode(part));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isTrue(value: unknown): boolean {
  return value === true || value === "true";
}

export interface TokenSet {
  accessToken: string;
  expiresIn?: number;
  refreshToken?: string;
  idToken?: string;
}

/** Build a session from a token response, carrying over what the response didn't repeat. */
export function sessionFromTokens(
  tokens: TokenSet,
  previous?: Session | null,
  at: number = Date.now(),
): Session {
  const claims = decodeJwtClaims(tokens.accessToken);
  const exp = typeof claims.exp === "number" ? claims.exp : undefined;
  const expiresAt = exp ?? Math.floor(at / 1000) + (tokens.expiresIn ?? 300);
  const sub = typeof claims.sub === "string" ? claims.sub : (previous?.sub ?? "");
  return {
    sub,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: expiresAt,
    refreshToken: tokens.refreshToken ?? previous?.refreshToken,
    idToken: tokens.idToken ?? previous?.idToken,
    email: typeof claims.email === "string" ? claims.email : previous?.email,
    ageVerified: isTrue(claims.age_verified),
    emailVerified: isTrue(claims.email_verified),
  };
}

/** Refresh a minute early, so a token never expires halfway through a page. */
export function needsRefresh(session: Session, at: number = Date.now()): boolean {
  return session.accessTokenExpiresAt - 60 <= Math.floor(at / 1000);
}

export function isExpired(session: Session, at: number = Date.now()): boolean {
  return session.accessTokenExpiresAt <= Math.floor(at / 1000);
}

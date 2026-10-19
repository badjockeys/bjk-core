// A random id for each browser, so the API can count logged-out viewers' reel plays (10 a day). It lives in an
// httpOnly cookie signed with AUTH_SECRET (HMAC-SHA256), set by src/proxy.ts on the first visit. The web server checks
// the signature and sends only the id to the API, in the X-Viewer-Id header; scripts in the page can't read or change it.
// Clearing cookies gives a new id: the limit is a nudge to join, not a paywall (the API also falls back to the IP).

import type { CookieOptions, CookieReader } from "./session";

export const VIEWER_COOKIE_LIFETIME_SECONDS = 400 * 24 * 60 * 60;

/** `__Host-` cookies must be Secure, so the prefix is only used over HTTPS. */
export function viewerCookieName(secure: boolean): string {
  return secure ? "__Host-bjk_viewer" : "bjk_viewer";
}

export function viewerCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: VIEWER_COOKIE_LIFETIME_SECONDS };
}

const keys = new Map<string, Promise<CryptoKey>>();

function keyFor(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(`bjk-web:viewer:${secret}`),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    keys.set(secret, key);
  }
  return key;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(
      value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "="),
    );
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

const ID = /^[A-Za-z0-9_-]{22}$/;

/** A new viewer id and the signed cookie value for it ("id.signature"). */
export async function newViewerCookie(secret: string): Promise<{ id: string; value: string }> {
  const id = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await keyFor(secret), new TextEncoder().encode(id)),
  );
  return { id, value: `${id}.${base64Url(signature)}` };
}

/** The viewer id in a cookie value, if its signature is ours; otherwise null. */
export async function verifyViewerCookie(value: string | undefined, secret: string): Promise<string | null> {
  const [id, signature, extra] = (value ?? "").split(".");
  if (!id || !signature || extra !== undefined || !ID.test(id)) {
    return null;
  }
  const bytes = fromBase64Url(signature);
  if (!bytes) {
    return null;
  }
  const valid = await crypto.subtle.verify("HMAC", await keyFor(secret), bytes, new TextEncoder().encode(id));
  return valid ? id : null;
}

/** The signed viewer id from the request's cookies, or null. */
export function readViewerId(cookies: CookieReader, secret: string, secure: boolean): Promise<string | null> {
  const name = viewerCookieName(secure);
  return verifyViewerCookie(cookies.getAll().find((c) => c.name === name)?.value, secret);
}

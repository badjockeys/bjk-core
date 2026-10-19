import { NextResponse, type NextRequest } from "next/server";

import { getConfig, isSecure } from "./lib/config";
import { contentSecurityPolicy } from "./lib/csp";
import { authSecret, refreshOnce } from "./lib/refresh";
import {
  clearSession,
  needsRefresh,
  readSession,
  sessionCookieName,
  writeSession,
  type CookieOptions,
} from "./lib/session";
import { newViewerCookie, readViewerId, viewerCookieName, viewerCookieOptions } from "./lib/viewer-id";

/**
 * Runs before every page and server action:
 * - refreshes the user's access token a minute before it expires (the refresh token is one-time, so the new one is
 *   saved straight away), and passes the new cookie on to the page being rendered;
 * - sets the Content-Security-Policy with a fresh nonce for Next.js's scripts;
 * - gives each browser a signed, httpOnly viewer id (lib/viewer-id.ts), which counts logged-out reel plays.
 */
export async function proxy(request: NextRequest) {
  const config = getConfig();
  const secure = isSecure(config);
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = contentSecurityPolicy(config, nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  // Work out the session changes first, then build the response with them.
  let written: { name: string; value: string }[] | null = null;
  let cleared = false;
  const pending: { set: [string, string, CookieOptions][]; del: string[] } = { set: [], del: [] };
  const recorder = {
    set: (name: string, value: string, options: CookieOptions) => pending.set.push([name, value, options]),
    delete: (name: string) => pending.del.push(name),
  };

  const session = await readSession(request.cookies, authSecret(), secure);
  if (session && needsRefresh(session)) {
    try {
      const refreshed = await refreshOnce(session);
      if (refreshed) {
        written = await writeSession(request.cookies, recorder, refreshed, authSecret(), secure);
      } else {
        clearSession(request.cookies, recorder, secure);
        cleared = true;
      }
    } catch {
      // The identity server is unreachable: carry on with the current token and try again on the next request.
    }
  }

  // A viewer id for every browser that hasn't got a valid one yet.
  let viewer: { name: string; value: string } | null = null;
  if (!(await readViewerId(request.cookies, authSecret(), secure))) {
    viewer = { name: viewerCookieName(secure), value: (await newViewerCookie(authSecret())).value };
  }

  if (written || cleared || viewer) {
    // The page being rendered should see the new cookies, not the ones the browser sent.
    const name = sessionCookieName(secure);
    const others = request.cookies
      .getAll()
      .filter((c) => !c.name.startsWith(`${name}.`) || !(written || cleared))
      .filter((c) => !viewer || c.name !== viewer.name);
    const all = [...others, ...(written ?? []), ...(viewer ? [viewer] : [])];
    requestHeaders.set("cookie", all.map((c) => `${c.name}=${c.value}`).join("; "));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (secure) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  for (const name of pending.del) {
    response.cookies.delete(name);
  }
  for (const [name, value, options] of pending.set) {
    response.cookies.set(name, value, options);
  }
  if (viewer) {
    response.cookies.set(viewer.name, viewer.value, viewerCookieOptions(secure));
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static files, images, the health check and the sign-in callback (which sets the session).
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|healthz|api/auth/callback).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};

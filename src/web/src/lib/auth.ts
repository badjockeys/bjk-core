import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { api, ApiError } from "./api";
import { getConfig, isSecure } from "./config";
import { refreshOnce } from "./refresh";
import { logRefusedToken } from "./refused-token";
import { clearSession, isExpired, readSession, writeSession, type Session } from "./session";
import type { ProfileDto } from "./types";
import { ANONYMOUS, type Viewer } from "./viewer";

/**
 * Set once the API has refused this request's access token (401 on a token that hasn't expired). From then on the
 * request is treated as signed out: the viewer is anonymous and getAccessToken returns null, so pages show what a
 * visitor sees instead of failing. Per request (React's cache).
 */
const refusal = cache(() => ({ refused: false }));

/** The session from the cookie, once per request. src/proxy.ts has usually refreshed it already. */
export const getSession = cache(async (): Promise<Session | null> => {
  const config = getConfig();
  return readSession(await cookies(), config.authSecret, isSecure(config));
});

/**
 * A usable access token for the signed-in user, or null if they're signed out. Refreshes an expired token; the new
 * cookie is saved when we're allowed to set cookies (server actions and route handlers, not while rendering).
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session || refusal().refused) {
    return null;
  }
  if (!isExpired(session)) {
    return session.accessToken;
  }
  const refreshed = await refreshOnce(session);
  const config = getConfig();
  const jar = await cookies();
  try {
    if (refreshed) {
      await writeSession(jar, jar, refreshed, config.authSecret, isSecure(config));
    } else {
      clearSession(jar, jar, isSecure(config));
    }
  } catch {
    // Rendering a page: cookies are read-only here. The proxy saves the refreshed session on the next request.
  }
  return refreshed?.accessToken ?? null;
}

/** The user's own profile, or null if they haven't made one yet (or aren't signed in). */
export const getMyProfile = cache(async (): Promise<ProfileDto | null> => {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().profiles.me(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    if (error instanceof ApiError && error.status === 401) {
      // The API refused the token: show the page signed out (getViewer), and say so in the log.
      logRefusedToken(error);
      refusal().refused = true;
      return null;
    }
    throw error;
  }
});

/** Who's looking, in a form that's safe to pass to the browser (no tokens). */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getSession();
  if (!session) {
    return SIGNED_OUT;
  }
  const profile = await getMyProfile();
  if (refusal().refused) {
    return { ...SIGNED_OUT, sessionRefused: true };
  }
  return {
    signedIn: true,
    userId: session.sub,
    email: session.email ?? null,
    ageVerified: session.ageVerified,
    emailVerified: session.emailVerified,
    hasProfile: profile !== null,
    handle: profile?.handle ?? null,
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
  };
});

const SIGNED_OUT: Viewer = ANONYMOUS;

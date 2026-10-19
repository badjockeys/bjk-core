import { getConfig } from "./config";
import { refreshTokens } from "./oidc";
import type { Session } from "./session";

// Refresh tokens are one-time: using one twice signs the user out. A page often makes several requests at once
// (the page, then server actions), so refreshes of the same token on this server share one call, and the result is
// remembered briefly for requests that arrive with the old cookie just afterwards. With several replicas, keep a
// user on one replica (session affinity) or accept the rare extra sign-in.

const inFlight = new Map<string, Promise<Session | null>>();
const recent = new Map<string, { session: Session | null; until: number }>();
const REMEMBER_MS = 60_000;

export function refreshOnce(session: Session): Promise<Session | null> {
  const key = session.refreshToken;
  if (!key) {
    return Promise.resolve(null);
  }

  const now = Date.now();
  for (const [token, entry] of recent) {
    if (entry.until < now) {
      recent.delete(token);
    }
  }
  const remembered = recent.get(key);
  if (remembered) {
    return Promise.resolve(remembered.session);
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = refreshTokens(session)
      .then((result) => {
        recent.set(key, { session: result, until: Date.now() + REMEMBER_MS });
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

export function authSecret(): string {
  return getConfig().authSecret;
}

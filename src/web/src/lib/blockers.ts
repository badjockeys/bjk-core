import { checkAgePath, joinPath } from "./paths";
import type { Blocker } from "./viewer";

/**
 * Where to send someone who can't do something yet: join (visitors; the join page links to sign in for members,
 * owner 24 Oct 2026), the age check, or making a profile.
 */
export function blockerHref(blocker: Blocker, returnTo: string): string | null {
  switch (blocker) {
    case "signin":
      return joinPath(returnTo);
    case "age":
      return checkAgePath(returnTo);
    case "profile":
      return `/profile/new?returnTo=${encodeURIComponent(returnTo)}`;
    default:
      return null;
  }
}

/** In the browser: follow a blocker if there is one. True if the page is navigating away. */
export function followBlocker(blocker: Blocker | undefined): boolean {
  const href = blockerHref(blocker ?? null, window.location.pathname + window.location.search);
  if (href) {
    window.location.assign(href);
    return true;
  }
  return false;
}

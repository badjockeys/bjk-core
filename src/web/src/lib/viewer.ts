/** Who's looking at the page. Passed to client components, so it never holds tokens. */
export interface Viewer {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  /** Passed the age check (18+): needed only to view sensitive posts unblurred (19 Oct 2026 policy). */
  ageVerified: boolean;
  /** Confirmed their email address: needed to post and comment. */
  emailVerified: boolean;
  /** Made their public profile: needed to post and comment. */
  hasProfile: boolean;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /**
   * The browser has a session, but the API refused its token (e.g. the identity server's keys changed, or the account
   * was wiped from a local database). The page is shown signed out, and ForgetSession removes the dead cookie.
   */
  sessionRefused?: boolean;
}

export const ANONYMOUS: Viewer = {
  signedIn: false,
  userId: null,
  email: null,
  ageVerified: false,
  emailVerified: false,
  hasProfile: false,
  handle: null,
  displayName: null,
  avatarUrl: null,
};

/**
 * What's stopping the viewer from posting, commenting or reacting, if anything. No age check: since 19 Oct 2026 writes
 * don't need it ("age" only comes back from the API if Safety:RequireAgeVerification is ever switched on again).
 */
export type Blocker = "signin" | "age" | "profile" | "email" | null;

export function participationBlocker(
  viewer: Viewer,
  needs: { profile?: boolean; email?: boolean } = {},
): Blocker {
  if (!viewer.signedIn) {
    return "signin";
  }
  if (needs.profile && !viewer.hasProfile) {
    return "profile";
  }
  if (needs.email && !viewer.emailVerified) {
    return "email";
  }
  return null;
}

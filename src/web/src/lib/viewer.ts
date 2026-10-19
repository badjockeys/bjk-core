/** Who's looking at the page. Passed to client components, so it never holds tokens. */
export interface Viewer {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  /** Passed the age check (18+): needed to post, comment, react and report. */
  ageVerified: boolean;
  /** Confirmed their email address: needed to post and comment. */
  emailVerified: boolean;
  /** Made their public profile: needed to post and comment. */
  hasProfile: boolean;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
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

/** What's stopping the viewer from posting, commenting or reacting, if anything. */
export type Blocker = "signin" | "age" | "profile" | "email" | null;

export function participationBlocker(
  viewer: Viewer,
  needs: { profile?: boolean; email?: boolean } = {},
): Blocker {
  if (!viewer.signedIn) {
    return "signin";
  }
  if (!viewer.ageVerified) {
    return "age";
  }
  if (needs.profile && !viewer.hasProfile) {
    return "profile";
  }
  if (needs.email && !viewer.emailVerified) {
    return "email";
  }
  return null;
}

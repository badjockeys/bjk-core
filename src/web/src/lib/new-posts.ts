import type { FeedSource } from "@/actions/posts";

/** How often an open feed checks for new posts (owner, 22 Oct 2026: every 30 seconds while the tab is open). */
export const NEW_POSTS_POLL_MS = 30_000;

/** How far (in pixels, after resistance) a pull from the top of the page must go to refresh. */
export const PULL_TO_REFRESH_PX = 64;

/** The feeds that check for new posts: the home tabs, categories, hashtags and people's profiles. */
export function isLiveFeed(source: FeedSource): boolean {
  return source.kind !== "mine" && source.kind !== "bookmarks";
}

/**
 * How many posts on a fresh first page are new: not already shown, and posted after the newest one shown (so a post
 * that moved up a ranked feed such as For you doesn't count). With nothing shown yet, every post is new.
 */
export function countNewPosts(
  items: readonly { id: string; createdAt: string }[],
  shown: ReadonlySet<string>,
  newestAt: string | null,
): number {
  const after = newestAt ? Date.parse(newestAt) : Number.NEGATIVE_INFINITY;
  return items.filter((p) => !shown.has(p.id) && Date.parse(p.createdAt) > after).length;
}

/** The newest `createdAt` of the posts shown, or null if there are none. */
export function newestOf(items: readonly { createdAt: string }[]): string | null {
  let newest: string | null = null;
  for (const item of items) {
    if (newest === null || Date.parse(item.createdAt) > Date.parse(newest)) {
      newest = item.createdAt;
    }
  }
  return newest;
}

/** A finger's pull, damped so it feels like stretching (half the distance, at most 120 px). Upward pulls are 0. */
export function pullDistance(dragged: number): number {
  return dragged <= 0 ? 0 : Math.min(120, Math.round(dragged / 2));
}

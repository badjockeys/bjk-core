import { postPath, profilePath } from "./paths";
import type { NotificationDto } from "./types";

/** Where tapping a notification goes: the API's path (a post or a community page), or a new follower's profile. */
export function notificationHref(
  n: Pick<NotificationDto, "postId" | "type" | "path"> & { actor?: { handle?: string | null } | null },
): string | null {
  const path = n.path;
  if (path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && path !== "/notifications") {
    return path;
  }
  if (n.postId) return postPath(n.postId);
  return n.type === "NewFollower" && n.actor?.handle ? profilePath(n.actor.handle) : null;
}

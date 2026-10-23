import type { TagConnection } from "./types";

/** The line under a suggested person's name, like Instagram's "Follows you". */
export function connectionLabel(connection: TagConnection): string | null {
  switch (connection) {
    case "Mutual":
      return "You follow each other";
    case "FollowsYou":
      return "Follows you";
    case "YouFollow":
      return "Following";
    default:
      return null;
  }
}

/** What to search for: what's typed without the @, or nothing (then no list). */
export function tagQuery(typed: string): string {
  return typed.trim().replace(/^@+/, "").slice(0, 40);
}

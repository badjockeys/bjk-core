import type { CommunityListKind, CommunityRole, CommunityStanding, CommunityVisibility } from "./types";

/** The radiuses a community's area can have, in km (bjk-modules Community.Radiuses). */
export const COMMUNITY_RADIUSES = [5, 10, 15, 25, 50] as const;

/** Where a community lives in the web app (`/c/` is the categories). */
export function communityPath(slug: string): string {
  return `/communities/${encodeURIComponent(slug)}`;
}

export function discussionPath(slug: string, id: string): string {
  return `${communityPath(slug)}/d/${id}`;
}

/** "Salford Road Watch" → "SR"; "cyclists" → "C". */
export function communityInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0]?.[0] ?? "?")).toUpperCase();
}

/** "Public · Salford, 10 km · 1,240 members". */
export function communityFacts(c: {
  visibility: CommunityVisibility;
  placeName: string | null;
  radiusKm: number | null;
  memberCount: number;
}): string {
  const parts: string[] = [c.visibility === "Private" ? "Private" : "Public"];
  if (c.placeName && c.radiusKm) {
    parts.push(`${c.placeName}, ${c.radiusKm} km`);
  }
  parts.push(`${c.memberCount.toLocaleString("en-GB")} ${c.memberCount === 1 ? "member" : "members"}`);
  return parts.join(" · ");
}

/** What the join button says for someone's standing. */
export function joinLabel(standing: CommunityStanding, visibility: CommunityVisibility): string {
  switch (standing) {
    case "Member":
      return "Joined";
    case "Requested":
      return "Requested";
    case "Banned":
      return "Can't join";
    default:
      return visibility === "Private" ? "Ask to join" : "Join";
  }
}

export function roleLabel(role: CommunityRole | null | undefined): string | null {
  return role === "Admin" ? "Admin" : role === "Moderator" ? "Moderator" : null;
}

/** The tabs on /communities and the list each shows. */
export const COMMUNITY_TABS: readonly { tab: string; kind: CommunityListKind; label: string }[] = [
  { tab: "near", kind: "Near", label: "Near you" },
  { tab: "mine", kind: "Mine", label: "Yours" },
  { tab: "topics", kind: "Topics", label: "Topics" },
];

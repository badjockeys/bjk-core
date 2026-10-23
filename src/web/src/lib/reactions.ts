import type { ReactionCounts, ReactionType } from "./types";

/** The reactions, in picker order (owner, 22 Oct 2026: Heart replaced Laugh). */
export const REACTIONS: readonly { type: ReactionType; emoji: string; label: string }[] = [
  { type: "Like", emoji: "👍", label: "Like" },
  { type: "Heart", emoji: "❤️", label: "Heart" },
  { type: "Angry", emoji: "😠", label: "Angry" },
  { type: "Shocked", emoji: "😮", label: "Shocked" },
];

export const REACTION_TYPES: readonly ReactionType[] = REACTIONS.map((r) => r.type);

export function reactionOf(type: ReactionType): { type: ReactionType; emoji: string; label: string } {
  return REACTIONS.find((r) => r.type === type) ?? REACTIONS[0]!;
}

export function reactionTotal(counts: ReactionCounts | null | undefined): number {
  return Object.values(counts ?? {}).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** The reactions people used, most used first (ties in picker order), at most `max`: the bubbles under a post. */
export function topReactions(counts: ReactionCounts | null | undefined, max = 3): ReactionType[] {
  return REACTIONS.filter((r) => (counts?.[r.type] ?? 0) > 0)
    .sort((a, b) => (counts?.[b.type] ?? 0) - (counts?.[a.type] ?? 0))
    .slice(0, max)
    .map((r) => r.type);
}

/** Counts after the viewer changes their reaction from `from` to `to` (either may be null). */
export function applyReaction(
  counts: ReactionCounts,
  from: ReactionType | null,
  to: ReactionType | null,
): ReactionCounts {
  const next = { ...counts };
  if (from) {
    next[from] = Math.max(0, (next[from] ?? 0) - 1);
  }
  if (to) {
    next[to] = (next[to] ?? 0) + 1;
  }
  return next;
}

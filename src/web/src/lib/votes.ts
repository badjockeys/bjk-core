// The words and sums for a post's vote. Pure, so the browser and tests share them.

import type { Badge, VoteChoice, VoteDuration, VoteSummaryDto } from "./generated/api";

export const VOTE_DURATION_LABEL: Record<VoteDuration, string> = {
  Hours48: "48 hours after posting",
  Days7: "7 days after posting",
  Never: "Never: voting stays open",
};

export const BADGE_LABEL: Record<Badge, { name: string; about: string }> = {
  FoundingMember: { name: "Founding member", about: "One of the first 1,000 members." },
  TrustedReporter: {
    name: "Trusted reporter",
    about: "Posts clear, accurate clips. Given by our moderators.",
  },
  LocalRegular: { name: "Local regular", about: "Regularly posts from their own area." },
};

/** Each answer's share of the votes, as whole percentages that add up to 100 (largest remainders). */
export function votePercentages(results: Partial<Record<VoteChoice, number>>, choices: VoteChoice[]) {
  const counts = choices.map((c) => Math.max(0, results[c] ?? 0));
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) {
    return Object.fromEntries(choices.map((c) => [c, 0])) as Record<VoteChoice, number>;
  }
  const exact = counts.map((n) => (n * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((value, i) => ({ i, remainder: value - (floors[i] ?? 0) }))
    // Ties go to the larger answer, so 5 of 8 shows as 63%, as the result sentence says.
    .sort((a, b) => b.remainder - a.remainder || (counts[b.i] ?? 0) - (counts[a.i] ?? 0) || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) {
      break;
    }
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return Object.fromEntries(choices.map((c, i) => [c, floors[i] ?? 0])) as Record<VoteChoice, number>;
}

/** "Voting closes in 3 days", "closes in 5 hours", "Voting has closed", or null when it never closes. */
export function voteClosingText(
  vote: Pick<VoteSummaryDto, "isClosed" | "closesAt">,
  now = Date.now(),
): string | null {
  if (vote.isClosed) {
    return "Voting has closed";
  }
  if (!vote.closesAt) {
    return null;
  }
  const ms = new Date(vote.closesAt).getTime() - now;
  if (Number.isNaN(ms)) {
    return null;
  }
  if (ms <= 0) {
    return "Voting has closed";
  }
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 48) {
    return `Voting closes in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.round(hours / 24);
  return `Voting closes in ${days} days`;
}

/** "1 vote", "41 votes". */
export function voteCount(total: number): string {
  return `${total.toLocaleString("en-GB")} ${total === 1 ? "vote" : "votes"}`;
}

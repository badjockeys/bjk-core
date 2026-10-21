"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { getAccessToken } from "@/lib/auth";
import { isGuid } from "@/lib/posts";
import { viewerId } from "@/lib/reels";
import type {
  BookmarkStateDto,
  PagedResult,
  PostDto,
  PostFollowStateDto,
  VoteChoice,
  VoteDuration,
  VoteSummaryDto,
} from "@/lib/types";

import { asUser } from "./run";

const NOT_FOUND: ActionResult<never> = { ok: false, error: "We couldn't find that post." };
const CHOICES: readonly VoteChoice[] = [
  "FilmingDriver",
  "OtherRoadUser",
  "Both",
  "Nobody",
  "Minor",
  "Careless",
  "Dangerous",
  "Shocking",
];
const DURATIONS: readonly VoteDuration[] = ["Hours48", "Days7", "Never"];

/** The most post ids sent in one views call (the API takes up to 50). */
const MAX_VIEWS_PER_CALL = 50;

/** Vote on a post ("Who's at fault?" or "How bad was it?"), or change your vote. Returns the results. */
export async function castVote(postId: string, choice: VoteChoice): Promise<ActionResult<VoteSummaryDto>> {
  if (!isGuid(postId) || !CHOICES.includes(choice)) {
    return NOT_FOUND;
  }
  return asUser((t) => api().engagement.vote(t, postId, choice));
}

/** Follow a post: you're told about new comments and the vote result. */
export async function followPost(postId: string, follow: boolean): Promise<ActionResult<PostFollowStateDto>> {
  if (!isGuid(postId)) {
    return NOT_FOUND;
  }
  return asUser((t) => (follow ? api().engagement.follow(t, postId) : api().engagement.unfollow(t, postId)));
}

/** Save a post to your bookmarks, or remove it. */
export async function savePost(postId: string, save: boolean): Promise<ActionResult<BookmarkStateDto>> {
  if (!isGuid(postId)) {
    return NOT_FOUND;
  }
  return asUser((t) => (save ? api().engagement.save(t, postId) : api().engagement.unsave(t, postId)));
}

export async function loadBookmarks(page: number): Promise<ActionResult<PagedResult<PostDto>>> {
  return asUser((t) => api().engagement.bookmarks(t, Math.max(1, Math.floor(page))));
}

/**
 * Count that the viewer saw these posts. Best effort: failures are ignored, since a missed view only makes a count
 * slightly low.
 */
export async function recordViews(postIds: string[]): Promise<void> {
  const ids = [...new Set(postIds.filter(isGuid))].slice(0, MAX_VIEWS_PER_CALL);
  if (ids.length === 0) {
    return;
  }
  try {
    const [token, viewer] = await Promise.all([getAccessToken(), viewerId()]);
    await api().engagement.views(token, viewer, ids);
  } catch {
    // Best effort.
  }
}

/** Count that the viewer shared a post. Best effort, like views. */
export async function recordShare(postId: string): Promise<void> {
  if (!isGuid(postId)) {
    return;
  }
  try {
    const [token, viewer] = await Promise.all([getAccessToken(), viewerId()]);
    await api().engagement.share(token, viewer, postId);
  } catch {
    // Best effort.
  }
}

/** When votes on your new posts close. */
export async function setVoteDuration(duration: VoteDuration): Promise<ActionResult<VoteDuration>> {
  if (!DURATIONS.includes(duration)) {
    return { ok: false, error: "Choose 48 hours, 7 days or never." };
  }
  return asUser(async (t) => (await api().engagement.setVoteDuration(t, duration)).voteDuration);
}

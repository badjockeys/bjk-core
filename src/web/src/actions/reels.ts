"use server";

import { api, ApiError } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { getAccessToken } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { loadReels, viewerId, type ReelsResult } from "@/lib/reels";
import type { IncidentCategory, ReelPlayResult } from "@/lib/types";

import { failure } from "./run";

/** The next page of reels (or the daily limit). */
export async function loadMoreReels(
  cursor: string | null,
  category: IncidentCategory | null,
): Promise<ReelsResult> {
  const known = CATEGORIES.some((c) => c.value === category) ? (category ?? undefined) : undefined;
  return loadReels(cursor, known);
}

export type PlayOutcome =
  | { ok: true; result: ReelPlayResult }
  | { ok: false; limitReached: true; resetsAt: string | null }
  | { ok: false; limitReached: false; error: string };

/** Records a play once a reel has been watched for 3 seconds. */
export async function recordReelPlay(postId: string): Promise<PlayOutcome> {
  const [token, viewer] = await Promise.all([getAccessToken(), viewerId()]);
  try {
    return { ok: true, result: await api().reels.play(token, viewer, postId) };
  } catch (error) {
    if (error instanceof ApiError && error.isDailyLimit) {
      return { ok: false, limitReached: true, resetsAt: error.problem?.resetsAt ?? null };
    }
    const result: ActionResult<never> = failure(error);
    return { ok: false, limitReached: false, error: result.ok ? "" : result.error };
  }
}

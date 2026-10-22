import "server-only";

import { cookies } from "next/headers";

import { api, ApiError } from "./api";
import { getAccessToken } from "./auth";
import { getConfig, isSecure } from "./config";
import type { ReelsPage } from "./types";
import { readViewerId } from "./viewer-id";

/** Today's reels are used up: when they start again and how many there were. */
export interface ReelsLimit {
  resetsAt: string | null;
  limit: number | null;
}

export type ReelsResult = { ok: true; page: ReelsPage } | { ok: false; limit: ReelsLimit } | null;

/** The browser's signed viewer id (set by src/proxy.ts), for counting logged-out viewers' plays. */
export async function viewerId(): Promise<string | null> {
  const config = getConfig();
  return readViewerId(await cookies(), config.authSecret, isSecure(config));
}

/** A page of reels for the viewer; the daily limit when it's used up; null if the API couldn't be reached. */
export async function loadReels(cursor: string | null): Promise<ReelsResult> {
  const [token, viewer] = await Promise.all([getAccessToken(), viewerId()]);
  try {
    return { ok: true, page: await api().reels.list(token, viewer, { cursor }) };
  } catch (error) {
    if (error instanceof ApiError && error.isDailyLimit) {
      return {
        ok: false,
        limit: { resetsAt: error.problem?.resetsAt ?? null, limit: error.problem?.limit ?? null },
      };
    }
    console.error("Couldn't load reels", error instanceof Error ? error.message : error);
    return null;
  }
}

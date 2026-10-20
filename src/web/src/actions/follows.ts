"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { FollowStateDto } from "@/lib/types";

import { asUser } from "./run";

const HANDLE = /^@?[A-Za-z0-9_]{1,30}$/;

/** Follow someone: their posts show in your Following timeline. */
export async function followUser(handle: string): Promise<ActionResult<FollowStateDto>> {
  if (!HANDLE.test(handle)) {
    return { ok: false, error: "That isn't a Bad Jockeys member." };
  }
  return asUser((t) => api().profiles.follow(t, handle.replace(/^@/, "")));
}

export async function unfollowUser(handle: string): Promise<ActionResult<FollowStateDto>> {
  if (!HANDLE.test(handle)) {
    return { ok: false, error: "That isn't a Bad Jockeys member." };
  }
  return asUser((t) => api().profiles.unfollow(t, handle.replace(/^@/, "")));
}

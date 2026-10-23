"use server";

import { revalidatePath } from "next/cache";

import { api } from "@/lib/api";
import { getViewer } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import type { AuthorDto, TagSuggestionDto } from "@/lib/types";

import { asUser } from "./run";

/** Looks up someone to tag as a passenger. The API makes the final checks when the post is saved. */
export async function findPassenger(handle: string): Promise<ActionResult<AuthorDto>> {
  const clean = handle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(clean)) {
    return { ok: false, error: "Enter their @username." };
  }
  const viewer = await getViewer();
  if (viewer.handle?.toLowerCase() === clean) {
    return { ok: false, error: "You can't tag yourself." };
  }
  const found = await asUser((t) => api().profiles.get(t, clean));
  if (!found.ok) {
    return { ok: false, error: `We couldn't find @${clean}.` };
  }
  const p = found.data;
  if (viewer.userId && p.id === viewer.userId) {
    return { ok: false, error: "You can't tag yourself." };
  }
  return {
    ok: true,
    data: { id: p.id, handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl },
  };
}

/** People to tag as you type: those you're connected to first, then other adults (owner, 23 Oct 2026). */
export async function suggestPassengers(text: string): Promise<ActionResult<TagSuggestionDto[]>> {
  const q = text.trim().replace(/^@/, "").slice(0, 40);
  if (!q) return { ok: true, data: [] };
  return asUser((t) => api().profiles.tagSuggestions(t, q, 8));
}

/** Accept (your name then shows on the post) or decline being tagged as a passenger. */
export async function respondToTag(postId: string, accept: boolean): Promise<ActionResult> {
  const result = await asUser((t) => api().posts.respondToTag(t, postId, accept));
  if (result.ok) {
    revalidatePath("/account");
    return { ok: true, data: undefined };
  }
  return result;
}

/** Remove yourself from a post you were tagged on. */
export async function removeMyTag(postId: string): Promise<ActionResult> {
  const result = await asUser((t) => api().posts.removeMyTag(t, postId));
  if (result.ok) {
    revalidatePath(`/p/${postId}`);
  }
  return result;
}

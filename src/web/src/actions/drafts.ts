"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { DraftDto, SaveDraftRequest } from "@/lib/types";

import { asUser } from "./run";

/** Your drafts, last saved first. */
export async function listDrafts(): Promise<ActionResult<DraftDto[]>> {
  return asUser((t) => api().drafts.list(t));
}

/** Save the composer as a draft: a new one, or over `draftId`. */
export async function saveDraft(
  draftId: string | null,
  draft: SaveDraftRequest,
): Promise<ActionResult<DraftDto>> {
  const body: SaveDraftRequest = {
    ...draft,
    title: draft.title?.trim() || null,
    description: draft.description?.trim() || null,
    placeName: draft.placeName?.trim() || null,
  };
  return asUser((t) => (draftId ? api().drafts.update(t, draftId, body) : api().drafts.create(t, body)));
}

/** Delete a draft and the photos or video only it was using. */
export async function deleteDraft(draftId: string): Promise<ActionResult> {
  return asUser((t) => api().drafts.remove(t, draftId));
}

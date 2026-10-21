"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { DescriptionDto, IncidentCategory, TypeSuggestionsDto } from "@/lib/types";

import { asUser } from "./run";

/** "Looks like: ...": incident types suggested from the person's ready photos or video (often none). */
export async function suggestTypes(mediaIds: string[]): Promise<ActionResult<TypeSuggestionsDto>> {
  return asUser((t) => api().posts.suggestTypes(t, mediaIds));
}

/** What the person has filled in so far, given to the description model with the pictures. */
export interface DescribeContext {
  types: IncidentCategory[];
  placeName: string | null;
  incidentAt: string | null;
  vehicle: { type: string | null; make: string | null; model: string | null; colour: string | null } | null;
}

/** "Suggest a description": queue a draft for the person's ready photos or video. Poll getDescription for it. */
export async function requestDescription(
  mediaIds: string[],
  context: DescribeContext,
): Promise<ActionResult<DescriptionDto>> {
  return asUser((t) => api().media.requestDescription(t, mediaIds, context));
}

export async function getDescription(id: string): Promise<ActionResult<DescriptionDto>> {
  return asUser((t) => api().media.getDescription(t, id));
}

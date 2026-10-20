"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { CATEGORIES } from "@/lib/categories";
import type { TimelineDto, TimelineRequest, TimelinesDto } from "@/lib/types";

import { asUser } from "./run";

const ID = /^[0-9a-f-]{36}$/i;

function clean(body: TimelineRequest): TimelineRequest {
  const types = body.types.filter((t) => CATEGORIES.some((c) => c.value === t));
  const place = body.latitude != null && body.longitude != null && body.radiusKm != null && body.placeName;
  return {
    name: body.name.trim().slice(0, 30),
    types,
    placeName: place ? body.placeName!.trim().slice(0, 100) : null,
    latitude: place ? body.latitude : null,
    longitude: place ? body.longitude : null,
    radiusKm: place ? body.radiusKm : null,
  };
}

/** Add a custom timeline (Free 1, Premium 5, Premium + 10). */
export async function createTimeline(body: TimelineRequest): Promise<ActionResult<TimelineDto>> {
  return asUser((t) => api().timelines.create(t, clean(body)));
}

export async function updateTimeline(id: string, body: TimelineRequest): Promise<ActionResult<TimelineDto>> {
  if (!ID.test(id)) {
    return { ok: false, error: "That timeline doesn't exist." };
  }
  return asUser((t) => api().timelines.update(t, id, clean(body)));
}

export async function deleteTimeline(id: string): Promise<ActionResult> {
  if (!ID.test(id)) {
    return { ok: false, error: "That timeline doesn't exist." };
  }
  return asUser((t) => api().timelines.remove(t, id));
}

/** Put your custom timelines in this order (each once). */
export async function reorderTimelines(ids: string[]): Promise<ActionResult<TimelinesDto>> {
  if (!ids.every((id) => ID.test(id))) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return asUser((t) => api().timelines.reorder(t, ids));
}

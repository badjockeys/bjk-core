// Helpers for custom timelines (UI step 6). No browser or server APIs, so they can be tested on their own.

import { categoryLabel } from "./categories";
import type { SubscriptionPlan, TimelineDto } from "./types";

/** The radiuses a timeline's place can have, in km (the API's list). */
export const TIMELINE_RADIUSES: readonly number[] = [2, 5, 10, 25, 50];

/** "Bad parking, Speeding · within 10 km of Prescot", or "· anywhere". */
export function describeTimeline(t: Pick<TimelineDto, "types" | "placeName" | "radiusKm">): string {
  const types =
    t.types.length <= 3 ? t.types.map(categoryLabel).join(", ") : `${t.types.length} types of bad driving`;
  return t.placeName && t.radiusKm
    ? `${types} · within ${t.radiusKm} km of ${t.placeName}`
    : `${types} · anywhere`;
}

/** The list with one item moved, or the same list if the move goes off either end. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
    return list as T[];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function planName(plan: SubscriptionPlan): string {
  return plan === "PremiumPlus" ? "Premium +" : plan === "Premium" ? "Premium" : "Free";
}

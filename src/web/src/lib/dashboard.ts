import { categoryLabel } from "./categories";
import { plural } from "./format";
import type { DashboardItemDto, DashboardKind, DashboardWidgetRequest, IncidentCategory } from "./types";

/** The widgets a member can add (the built-in cards are Trending, Who to follow and Category trends). */
export const WIDGET_KINDS: { kind: DashboardKind; label: string; hint: string }[] = [
  { kind: "AreaIncidents", label: "Incidents in an area", hint: "Total, trend and top types" },
  { kind: "TypeTrend", label: "One type's trend", hint: "A single type of bad driving" },
  { kind: "WhenItHappens", label: "When it happens", hint: "Times of day and days of the week" },
  { kind: "TopRoads", label: "Top roads", hint: "The most reported roads" },
];

export const BUILT_IN_LABELS: Partial<Record<DashboardKind, string>> = {
  Trending: "Trending",
  WhoToFollow: "Who to follow",
  CategoryTrends: "Category trends",
};

export const RADIUSES = [1, 2, 5, 10, 25] as const;
export const PERIODS = [7, 30, 90, 365] as const;
export const MAX_WIDGET_TYPES = 3;

export function isBuiltIn(kind: DashboardKind): boolean {
  return kind in BUILT_IN_LABELS;
}

export function kindLabel(kind: DashboardKind): string {
  return BUILT_IN_LABELS[kind] ?? WIDGET_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** "Last 7 days", "Last 30 days", "Last 90 days", "Last 12 months". */
export function periodLabel(days: number): string {
  return days === 365 ? "Last 12 months" : `Last ${days} days`;
}

export function shortPeriod(days: number): string {
  return days === 365 ? "12 months" : `${days} days`;
}

/** A widget's heading: what it shows, the one type for a type trend. */
export function widgetTitle(item: Pick<DashboardItemDto, "kind" | "types">): string {
  if (item.kind === "TypeTrend" && item.types[0]) {
    return categoryLabel(item.types[0]);
  }
  if (item.kind === "AreaIncidents") {
    return item.types.length > 0 ? item.types.map(categoryLabel).join(", ") : "Incidents";
  }
  return kindLabel(item.kind);
}

/** "L34 5 · within 2 km · last 30 days". */
export function widgetWhere(item: Pick<DashboardItemDto, "placeName" | "radiusKm" | "periodDays">): string {
  const parts = [item.placeName ?? "", item.radiusKm ? `within ${item.radiusKm} km` : ""];
  if (item.periodDays) parts.push(periodLabel(item.periodDays).toLowerCase());
  return parts.filter(Boolean).join(" · ");
}

/** The types a widget filters by, for the edit form's summary. */
export function typesLabel(types: readonly IncidentCategory[]): string {
  return types.length === 0 ? "All types" : types.map(categoryLabel).join(", ");
}

/** "8am–12pm", "8pm–12am", "12am–4am". */
export function hourBand(from: number, to: number): string {
  return `${hour(from)}–${hour(to % 24)}`;
}

/** "8am", "12pm", "12am". */
export function hour(h: number): string {
  const n = ((h % 24) + 24) % 24;
  const suffix = n < 12 ? "am" : "pm";
  const twelve = n % 12 === 0 ? 12 : n % 12;
  return `${twelve}${suffix}`;
}

/** "Fewer than 3 incidents here, so nothing is shown." */
export function suppressedText(minCount: number): string {
  return `Fewer than ${plural(minCount, "incident")} here, so nothing is shown.`;
}

/** Moves the item at `from` to `to` (both in range), returning a new list. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** What the form needs to save or preview: null until a place has been picked. */
export function widgetRequest(draft: {
  kind: DashboardKind;
  placeName: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  periodDays: number;
  types: IncidentCategory[];
}): DashboardWidgetRequest | null {
  if (draft.latitude === null || draft.longitude === null || !draft.placeName.trim()) {
    return null;
  }
  if (draft.kind === "TypeTrend" && draft.types.length !== 1) {
    return null;
  }
  return {
    kind: draft.kind,
    placeName: draft.placeName.trim().slice(0, 100),
    latitude: Math.round(draft.latitude * 1e6) / 1e6,
    longitude: Math.round(draft.longitude * 1e6) / 1e6,
    radiusKm: draft.radiusKm,
    periodDays: draft.periodDays,
    types: draft.kind === "TypeTrend" ? draft.types.slice(0, 1) : draft.types.slice(0, MAX_WIDGET_TYPES),
  };
}

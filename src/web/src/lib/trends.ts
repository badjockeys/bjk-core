// Helpers for the right panel's category trends (UI step 4): ranges, dates, sparklines and labels. No browser or server
// APIs, so they can be tested on their own.

import type { SubscriptionPlan, TrendPeriod } from "./types";

export type TrendRange = "7d" | "30d" | "90d" | "12m" | "custom";

export const TREND_RANGES: readonly { value: TrendRange; label: string; days: number }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "12m", label: "12 months", days: 365 },
  { value: "custom", label: "Custom", days: 0 },
];

/** A yyyy-mm-dd date plus or minus some days (UTC arithmetic on calendar dates, so no time zone surprises). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whether a plan can look back far enough for a range (Free: 7 days; Premium: 12 months; Premium +: 5 years). */
export function rangeAllowed(range: TrendRange, historyDays: number): boolean {
  if (range === "custom") {
    return historyDays > 7;
  }
  const days = TREND_RANGES.find((r) => r.value === range)?.days ?? 7;
  return days <= historyDays;
}

/** The from and to days (inclusive) for a preset range ending on `today`. */
export function rangeDates(
  range: Exclude<TrendRange, "custom">,
  today: string,
): { from: string; to: string } {
  const days = TREND_RANGES.find((r) => r.value === range)?.days ?? 7;
  return { from: addDays(today, 1 - days), to: today };
}

/** The earliest day a plan can choose, given the latest day and how far back it can look. */
export function earliestDay(today: string, historyDays: number): string {
  return addDays(today, 1 - historyDays);
}

/**
 * A sparkline's line and filled area, as SVG path data in a `width` × `height` box. The line is drawn 2 px in from the
 * top and bottom so it isn't clipped; a single point is drawn flat across.
 */
export function sparkline(
  points: readonly number[],
  width: number,
  height: number,
): { line: string; area: string } {
  if (points.length === 0) {
    return { line: "", area: "" };
  }
  const values = points.length === 1 ? [points[0]!, points[0]!] : points;
  const max = Math.max(...values, 1);
  const pad = 2;
  const step = width / (values.length - 1);
  const xy = values.map((v, i) => {
    const x = Math.round(i * step * 10) / 10;
    const y = Math.round((height - pad - (v / max) * (height - pad * 2)) * 10) / 10;
    return `${x},${y}`;
  });
  const line = `M${xy.join("L")}`;
  return { line, area: `${line}L${width},${height}L0,${height}Z` };
}

/** "▲ 12%", "▼ 5%", "No change", or null when there's nothing to compare. */
export function changeLabel(
  change: number | null | undefined,
): { text: string; trend: "up" | "down" | "flat" } | null {
  if (change === null || change === undefined) {
    return null;
  }
  if (change === 0) {
    return { text: "No change", trend: "flat" };
  }
  return change > 0 ? { text: `▲ ${change}%`, trend: "up" } : { text: `▼ ${-change}%`, trend: "down" };
}

/** How the points are grouped, for the sparkline's label. */
export function periodLabel(period: TrendPeriod): string {
  return period === "Month" ? "a month" : period === "Week" ? "a week" : "a day";
}

/** "12 Oct" or "12 Oct 2025" (when not this year), for date ranges. */
export function shortDate(day: string, thisYear: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: d.getUTCFullYear() === thisYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

/** Can this plan narrow trends to an area? */
export function areaAllowed(plan: SubscriptionPlan | null | undefined): boolean {
  return plan === "Premium" || plan === "PremiumPlus";
}

/** A box about 10 km each way around a place, as the API's `minLon,minLat,maxLon,maxLat`. */
export function boxAround(latitude: number, longitude: number): string {
  const dLat = 0.09;
  const dLng = 0.15;
  const f = (n: number) => n.toFixed(4);
  return [f(longitude - dLng), f(latitude - dLat), f(longitude + dLng), f(latitude + dLat)].join(",");
}

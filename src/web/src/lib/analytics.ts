import type { AnalyticsInterval, AnalyticsPointDto } from "./types";

/** The charts on the analytics panel: views (with local views), then one each for reactions, comments and shares. */
export type MetricKey = "views" | "localViews" | "reactions" | "comments" | "shares";

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: "Views",
  localViews: "Local views",
  reactions: "Reactions",
  comments: "Comments",
  shares: "Shares",
};

/**
 * Series colours, validated with the dataviz palette checker (light surface: lightness, chroma, colour-blind
 * separation and 3:1 contrast all pass). Brand cyan #00B5E5 is too light against white for a mark, so the charts
 * use a deeper cyan; local views are orange.
 */
export const SERIES_COLOURS = { primary: "#0096c7", secondary: "#e2703a" } as const;

/** "Hourly since it was posted" and so on, for the panel's subtitle. */
export function intervalLabel(interval: AnalyticsInterval): string {
  return interval === "Hour" ? "Hour by hour" : interval === "Day" ? "Day by day" : "Week by week";
}

/** An axis or tooltip label for the point starting at `start`, in UK time. */
export function pointLabel(start: string, interval: AnalyticsInterval, long = false): string {
  const date = new Date(start);
  if (interval === "Hour") {
    const time = date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    });
    return long
      ? `${date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" })}, ${time}`
      : time;
  }
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  return interval === "Week" && long ? `Week from ${day}` : day;
}

/** A clean top for the y-axis: 1, 2, 5 or 10 times a power of ten, at least 4 so small counts still have ticks. */
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((m) => m * power >= max)!;
  return step * power;
}

/** 0, 950, 1.2K, 34K. */
export function compact(value: number): string {
  return value >= 1000
    ? `${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: value >= 10_000 ? 0 : 1 })}K`
    : value.toLocaleString("en-GB");
}

/** Which tick labels to show along the x-axis: about six, always the first and last. */
export function tickIndexes(count: number, wanted = 6): number[] {
  if (count <= wanted) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil((count - 1) / (wanted - 1));
  const ticks = [];
  for (let i = 0; i < count - 1; i += step) ticks.push(i);
  ticks.push(count - 1);
  return ticks;
}

/** Made-up points for the blurred preview Free members see behind the upgrade prompt (never real data). */
export function previewPoints(): AnalyticsPointDto[] {
  const shape = [3, 9, 14, 22, 18, 12, 9, 7, 5, 4, 3, 2];
  const start = Date.UTC(2026, 0, 1);
  return shape.map((v, i) => ({
    start: new Date(start + i * 3_600_000).toISOString(),
    views: v * 4,
    localViews: v,
    reactions: Math.round(v / 2),
    comments: Math.round(v / 4),
    shares: Math.round(v / 6),
  }));
}

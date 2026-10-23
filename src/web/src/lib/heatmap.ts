// Helpers for the incident map (screen 28): colours, dates, labels and filters. No browser or server APIs, so they
// can be tested on their own.

import { compactTypes } from "./categories";
import type {
  HeatmapAccess,
  HeatmapDays,
  HeatmapQuery,
  IncidentCategory,
  VehicleColour,
  VehicleType,
} from "./types";

/** The brand's cyan scale, from few incidents to many. */
export const SCALE = ["#E6F7FC", "#00B5E5", "#00607F"] as const;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`.toUpperCase();
}

/**
 * The colour of a cell: #E6F7FC → #00B5E5 → #00607F as its count goes from the threshold to the busiest cell in view.
 * A square-root scale, so a few very busy cells don't wash out the rest.
 */
export function shade(count: number, max: number, min = 3): string {
  if (max <= min) {
    return SCALE[1];
  }
  const t = Math.max(0, Math.min(1, Math.sqrt((count - min) / (max - min))));
  return t < 0.5 ? mix(SCALE[0], SCALE[1], t * 2) : mix(SCALE[1], SCALE[2], (t - 0.5) * 2);
}

export type Period = "7d" | "30d" | "12m" | "5y";

export const PERIODS: readonly { value: Period; label: string; days: number }[] = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "12m", label: "Last 12 months", days: 365 },
  { value: "5y", label: "Last 5 years", days: 1826 },
];

/** Times of day (UK time), as the API's "from-to" hour ranges. */
export const TIMES_OF_DAY: readonly { value: string; label: string }[] = [
  { value: "", label: "Any time of day" },
  { value: "7-10", label: "Morning rush (7–10am)" },
  { value: "10-16", label: "Daytime (10am–4pm)" },
  { value: "16-19", label: "Evening rush (4–7pm)" },
  { value: "19-7", label: "Night (7pm–7am)" },
];

export const DAY_CHOICES: readonly { value: HeatmapDays; label: string }[] = [
  { value: "All", label: "Every day" },
  { value: "Weekdays", label: "Weekdays" },
  { value: "Weekends", label: "Weekends" },
];

export interface MapFilters {
  /** Any of these types (empty: all). */
  categories: IncidentCategory[];
  period: Period;
  /** A chosen date range (yyyy-mm-dd), instead of the period, when set. */
  from: string;
  to: string;
  hours: string;
  days: HeatmapDays;
  vehicleTypes: VehicleType[];
  make: string;
  model: string;
  colours: VehicleColour[];
  light: "" | "Daylight" | "Dark";
  schoolRun: boolean;
  reported: boolean;
  videoOnly: boolean;
}

export const DEFAULT_FILTERS: MapFilters = {
  categories: [],
  period: "12m",
  from: "",
  to: "",
  hours: "",
  days: "All",
  vehicleTypes: [],
  make: "",
  model: "",
  colours: [],
  light: "",
  schoolRun: false,
  reported: false,
  videoOnly: false,
};

/** How many of the "More filters" are set (for its badge). */
export function moreFilterCount(f: MapFilters): number {
  return [
    f.from || f.to,
    f.vehicleTypes.length > 0,
    f.make,
    f.colours.length > 0,
    f.light,
    f.schoolRun,
    f.reported,
    f.videoOnly,
  ].filter(Boolean).length;
}

/** Today's date in the UK, as yyyy-mm-dd. */
export function ukToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** A yyyy-mm-dd date moved by a number of days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The API query for the map's view and filters. The API ignores filters and dates the plan doesn't include. */
export function heatmapQuery(
  bbox: string,
  zoom: number,
  filters: MapFilters,
  today: string = ukToday(),
): HeatmapQuery {
  const days = PERIODS.find((p) => p.value === filters.period)?.days ?? 365;
  return {
    bbox,
    zoom,
    from: filters.from || addDays(today, 1 - days),
    to: filters.to || today,
    categories: filters.categories.length > 0 ? compactTypes(filters.categories) : undefined,
    hours: filters.hours || undefined,
    days: filters.days === "All" ? undefined : filters.days,
    vehicleTypes: filters.vehicleTypes.length > 0 ? filters.vehicleTypes.join(",") : undefined,
    make: filters.make || undefined,
    model: (filters.make && filters.model) || undefined,
    colours: filters.colours.length > 0 ? filters.colours.join(",") : undefined,
    light: filters.light || undefined,
    schoolRun: filters.schoolRun || undefined,
    reported: filters.reported || undefined,
    videoOnly: filters.videoOnly || undefined,
  };
}

/** The map's bounds as the API's bbox: minLon,minLat,maxLon,maxLat, to 4 decimal places. */
export function toBbox(west: number, south: number, east: number, north: number): string {
  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
  return [clamp(west, 180), clamp(south, 90), clamp(east, 180), clamp(north, 90)]
    .map((v) => v.toFixed(4))
    .join(",");
}

/** "8–9am", "12–1pm", "11pm–12am": the one-hour band starting at a UK hour. */
export function hourBand(hour: number): string {
  const label = (h: number) => {
    const twelve = h % 12 === 0 ? 12 : h % 12;
    return { n: twelve, half: h % 24 < 12 ? "am" : "pm" };
  };
  const start = label(hour);
  const end = label(hour + 1);
  return start.half === end.half
    ? `${start.n}–${end.n}${end.half}`
    : `${start.n}${start.half}–${end.n}${end.half}`;
}

/** "last 7 days", "last 12 months": how long the applied dates span. */
export function periodLabel(access: Pick<HeatmapAccess, "from" | "to">): string {
  const days = Math.round((Date.parse(access.to) - Date.parse(access.from)) / 86_400_000) + 1;
  if (days >= 1800) {
    return "last 5 years";
  }
  if (days >= 360) {
    return "last 12 months";
  }
  return days === 1 ? "today" : `last ${days} days`;
}

/** "+12%", "−5%", "no change". */
export function changeLabel(percent: number): string {
  return percent > 0 ? `+${percent}%` : percent < 0 ? `−${Math.abs(percent)}%` : "no change";
}

export function planLabel(plan: HeatmapAccess["plan"]): string {
  return plan === "PremiumPlus" ? "Premium +" : plan === "Premium" ? "Premium" : "Free preview";
}

"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { AreaStatsDto, HeatmapDto, HeatmapQuery } from "@/lib/types";

import { asUser } from "./run";

const BBOX = /^-?\d{1,3}(\.\d+)?(,-?\d{1,3}(\.\d+)?){3}$/;

function clean(q: HeatmapQuery): HeatmapQuery | null {
  if (!BBOX.test(q.bbox)) {
    return null;
  }
  return {
    bbox: q.bbox,
    zoom: q.zoom === undefined ? undefined : Math.max(0, Math.min(22, Math.round(q.zoom))),
    from: q.from || undefined,
    to: q.to || undefined,
    categories: q.categories || undefined,
    hours: q.hours || undefined,
    days: q.days === "Weekdays" || q.days === "Weekends" ? q.days : undefined,
    vehicleTypes: q.vehicleTypes || undefined,
    make: q.make || undefined,
    model: q.model || undefined,
    colours: q.colours || undefined,
    light: q.light === "Daylight" || q.light === "Dark" ? q.light : undefined,
    schoolRun: q.schoolRun ? true : undefined,
    reported: q.reported ? true : undefined,
    videoOnly: q.videoOnly ? true : undefined,
  };
}

/** Incident counts per cell for the map's view. */
export async function loadHeatmap(query: HeatmapQuery): Promise<ActionResult<HeatmapDto>> {
  const q = clean(query);
  if (!q) {
    return { ok: false, error: "Move the map a little and try again." };
  }
  return asUser((t) => api().heatmap.get(t, q));
}

/** Figures for the area that was tapped. */
export async function loadAreaStats(query: HeatmapQuery): Promise<ActionResult<AreaStatsDto>> {
  const q = clean(query);
  if (!q) {
    return { ok: false, error: "Choose an area on the map." };
  }
  return asUser((t) => api().heatmap.area(t, q));
}

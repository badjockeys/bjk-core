"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { getAccessToken } from "@/lib/auth";
import type { CategoryTrendsDto } from "@/lib/types";

import { run } from "./run";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BBOX = /^-?\d{1,3}(\.\d+)?(,-?\d{1,3}(\.\d+)?){3}$/;

/**
 * The category trends for a date range and, for Premium, an area. Anyone can call it: signed out, it's the whole UK
 * for the last 7 days. The API applies the plan's limits and says what it used.
 */
export async function loadCategoryTrends(q: {
  from?: string;
  to?: string;
  bbox?: string;
}): Promise<ActionResult<CategoryTrendsDto>> {
  const from = q.from && DAY.test(q.from) ? q.from : undefined;
  const to = q.to && DAY.test(q.to) ? q.to : undefined;
  const bbox = q.bbox && BBOX.test(q.bbox) ? q.bbox : undefined;
  const token = await getAccessToken();
  return run(() => api().trends.categories(token, { from, to, bbox }));
}

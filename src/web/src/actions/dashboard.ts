"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { CATEGORIES } from "@/lib/categories";
import { BUILT_IN_LABELS, MAX_WIDGET_TYPES, PERIODS, RADIUSES, WIDGET_KINDS } from "@/lib/dashboard";
import type {
  DashboardDto,
  DashboardKind,
  DashboardWidgetDataDto,
  DashboardWidgetRequest,
} from "@/lib/types";

import { asUser } from "./run";

const ID = /^[0-9a-f-]{36}$/i;
const NOT_FOUND: ActionResult<never> = { ok: false, error: "That widget doesn't exist." };

/** Checks a widget's settings before they go to the API (which checks them again). */
function clean(body: DashboardWidgetRequest): DashboardWidgetRequest | null {
  if (!WIDGET_KINDS.some((k) => k.kind === body.kind)) return null;
  if (!RADIUSES.includes(body.radiusKm as (typeof RADIUSES)[number])) return null;
  if (!PERIODS.includes(body.periodDays as (typeof PERIODS)[number])) return null;
  if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) return null;
  const types = (body.types ?? [])
    .filter((t) => CATEGORIES.some((c) => c.value === t))
    .slice(0, MAX_WIDGET_TYPES);
  return { ...body, placeName: body.placeName.trim().slice(0, 100), types };
}

export async function getDashboard(): Promise<ActionResult<DashboardDto>> {
  return asUser((t) => api().dashboard.get(t));
}

/** Add a widget at the end (Premium 3, Premium + 5). */
export async function createWidget(body: DashboardWidgetRequest): Promise<ActionResult<DashboardDto>> {
  const request = clean(body);
  if (!request) return { ok: false, error: "Check the widget's settings." };
  return asUser((t) => api().dashboard.createWidget(t, request));
}

export async function updateWidget(
  id: string,
  body: DashboardWidgetRequest,
): Promise<ActionResult<DashboardDto>> {
  const request = clean(body);
  if (!ID.test(id)) return NOT_FOUND;
  if (!request) return { ok: false, error: "Check the widget's settings." };
  return asUser((t) => api().dashboard.updateWidget(t, id, request));
}

export async function deleteWidget(id: string): Promise<ActionResult<DashboardDto>> {
  if (!ID.test(id)) return NOT_FOUND;
  return asUser((t) => api().dashboard.deleteWidget(t, id));
}

/** Put every card in this order: built-in cards by kind, widgets by id. */
export async function reorderDashboard(keys: string[]): Promise<ActionResult<DashboardDto>> {
  if (!keys.every((k) => ID.test(k) || k in BUILT_IN_LABELS)) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return asUser((t) => api().dashboard.reorder(t, keys));
}

export async function setCardHidden(
  kind: DashboardKind,
  hidden: boolean,
): Promise<ActionResult<DashboardDto>> {
  if (!(kind in BUILT_IN_LABELS)) return { ok: false, error: "Only the built-in cards can be hidden." };
  return asUser((t) => api().dashboard.setCardHidden(t, kind, hidden));
}

export async function getWidgetData(id: string): Promise<ActionResult<DashboardWidgetDataDto>> {
  if (!ID.test(id)) return NOT_FOUND;
  return asUser((t) => api().dashboard.widgetData(t, id));
}

/** What a widget would show, before it's saved. */
export async function previewWidget(
  body: DashboardWidgetRequest,
): Promise<ActionResult<DashboardWidgetDataDto>> {
  const request = clean(body);
  if (!request) return { ok: false, error: "Check the widget's settings." };
  return asUser((t) => api().dashboard.preview(t, request));
}

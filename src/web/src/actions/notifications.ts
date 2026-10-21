"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { NotificationDto, NotificationSettingDto, PagedResult, PushSetupDto } from "@/lib/types";

import { asUser } from "./run";

/** The bell's badge. Zero (not an error) when signed out or the API has no notifications yet. */
export async function unreadNotifications(): Promise<number> {
  const result = await asUser((t) => api().notifications.unreadCount(t));
  return result.ok ? result.data.unread : 0;
}

export async function loadNotifications(page: number): Promise<ActionResult<PagedResult<NotificationDto>>> {
  return asUser((t) => api().notifications.list(t, Math.max(1, Math.floor(page))));
}

/** Marks these notifications read, or all of them with null. */
export async function markNotificationsRead(ids: string[] | null): Promise<ActionResult> {
  return asUser((t) => api().notifications.markRead(t, ids));
}

export async function saveNotificationSettings(
  settings: NotificationSettingDto[],
): Promise<ActionResult<NotificationSettingDto[]>> {
  return asUser((t) => api().notifications.updateSettings(t, settings));
}

/** Whether push notifications are available, and the key to subscribe this browser with. */
export async function pushSetup(): Promise<ActionResult<PushSetupDto>> {
  return asUser((t) => api().notifications.pushSetup(t));
}

/** Turn push on for this browser: what PushManager.subscribe returned. */
export async function subscribePush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<ActionResult> {
  return asUser((t) => api().notifications.subscribePush(t, subscription));
}

/** Turn push off for this browser. */
export async function unsubscribePush(endpoint: string): Promise<ActionResult> {
  return asUser((t) => api().notifications.unsubscribePush(t, endpoint));
}

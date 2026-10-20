"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { AreaAlertMode, AreaSettingsDto, PlaceDto } from "@/lib/types";

import { asUser } from "./run";

/** UK towns, villages, postcodes and postcode areas. */
export async function searchPlaces(q: string): Promise<ActionResult<PlaceDto[]>> {
  const query = q.trim();
  if (query.length < 2) {
    return { ok: true, data: [] };
  }
  return asUser((t) => api().places.search(t, query.slice(0, 60)));
}

/** Your home area: private, kept to about 1 km. Its name shows as your profile's town or area. */
export async function setHomeArea(place: PlaceDto): Promise<ActionResult<AreaSettingsDto>> {
  return asUser((t) =>
    api().notifications.setHomeArea(t, {
      placeName: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    }),
  );
}

export async function saveAreaAlerts(alerts: {
  enabled: boolean;
  radiusKm: number;
  mode: AreaAlertMode;
  email: boolean;
}): Promise<ActionResult<AreaSettingsDto>> {
  return asUser((t) => api().notifications.setAreaAlerts(t, alerts));
}

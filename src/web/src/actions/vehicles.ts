"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { VehicleCatalogue } from "@/lib/types";

import { run } from "./run";

/** The vehicle lists (types, colours, makes and models). Cached for a day. */
export async function getVehicleCatalogue(): Promise<ActionResult<VehicleCatalogue>> {
  return run(() => api().vehicles.catalogue());
}

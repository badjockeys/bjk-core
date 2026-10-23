"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";

import type { HouseholdCarDto, HouseholdCarRequest, VehicleCatalogue } from "@/lib/types";

import { asUser, run } from "./run";

const ID = /^[0-9a-f-]{36}$/i;

/** The vehicle lists (types, colours, makes and models). Cached for a day. */
export async function getVehicleCatalogue(): Promise<ActionResult<VehicleCatalogue>> {
  return run(() => api().vehicles.catalogue());
}

/** Your household cars, for the post form and the account page. */
export async function getMyCars(): Promise<ActionResult<HouseholdCarDto[]>> {
  return asUser((t) => api().vehicles.mine(t));
}

/** Add a car, or change one (with its id). No registration is ever asked for or stored. */
export async function saveCar(id: string | null, car: HouseholdCarRequest): Promise<ActionResult<HouseholdCarDto>> {
  if (id !== null && !ID.test(id)) return { ok: false, error: "We couldn't find that car." };
  const body = { ...car, model: car.model || null, nickname: car.nickname?.trim() || null };
  const result = await asUser((t) => (id ? api().vehicles.updateCar(t, id, body) : api().vehicles.addCar(t, body)));
  if (result.ok) revalidatePath("/account/cars");
  return result;
}

export async function deleteCar(id: string): Promise<ActionResult> {
  if (!ID.test(id)) return { ok: false, error: "We couldn't find that car." };
  const result = await asUser((t) => api().vehicles.deleteCar(t, id));
  if (result.ok) revalidatePath("/account/cars");
  return result.ok ? { ok: true, data: undefined } : result;
}

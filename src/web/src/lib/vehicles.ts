import type { VehicleColour, VehicleDto, VehicleType } from "./types";

const TYPE_LABELS: Record<VehicleType, string> = {
  Car: "Car",
  Van: "Van",
  Lorry: "Lorry",
  Bus: "Bus",
  Coach: "Coach",
  Taxi: "Taxi",
  Motorbike: "Motorbike",
  Bicycle: "Bicycle",
  EScooter: "E-scooter",
  Tractor: "Tractor",
  Other: "Other",
};

/** Swatches for the colour choices (the brand stays out of it: these are the cars' colours). */
export const COLOUR_SWATCHES: Record<VehicleColour, string> = {
  Black: "#111111",
  White: "#ffffff",
  Silver: "#c9cbcf",
  Grey: "#7a7d82",
  Blue: "#2d5fb8",
  Red: "#c62828",
  Green: "#2e7d32",
  Yellow: "#f2c200",
  Orange: "#ef7d00",
  Brown: "#6d4c2f",
  Beige: "#d9c8a9",
  Purple: "#6a3d9a",
  Gold: "#c5a253",
  Other: "#e6e6e1",
};

export function vehicleTypeLabel(type: VehicleType): string {
  return TYPE_LABELS[type] ?? type;
}

/** "White Ford Transit (van)", "Black car", "BMW (car)". "Other" makes and models are left out. */
export function describeVehicle(vehicle: VehicleDto): string {
  const colour = vehicle.colour && vehicle.colour !== "Other" ? vehicle.colour : null;
  const make = vehicle.make && vehicle.make !== "Other" ? vehicle.make : null;
  const model = make && vehicle.model && vehicle.model !== "Other" ? vehicle.model : null;
  const type = vehicleTypeLabel(vehicle.type).toLowerCase();
  const name = [make, model].filter(Boolean).join(" ");
  if (!name) {
    return colour ? `${colour} ${type}` : vehicleTypeLabel(vehicle.type);
  }
  return `${colour ? `${colour} ` : ""}${name} (${type})`;
}

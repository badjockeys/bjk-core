import { describe, expect, it } from "vitest";

import { describeVehicle } from "@/lib/vehicles";

describe("describeVehicle", () => {
  it("reads naturally whatever was given", () => {
    expect(describeVehicle({ type: "Van", make: "Ford", model: "Transit", colour: "White" })).toBe(
      "White Ford Transit (van)",
    );
    expect(describeVehicle({ type: "Car", make: null, model: null, colour: "Black" })).toBe("Black car");
    expect(describeVehicle({ type: "EScooter", make: null, model: null, colour: null })).toBe("E-scooter");
    expect(describeVehicle({ type: "Car", make: "Other", model: "Other", colour: "Other" })).toBe("Car");
    expect(describeVehicle({ type: "Car", make: "BMW", model: "Other", colour: null })).toBe("BMW (car)");
  });
});

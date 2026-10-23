import { describe, expect, it } from "vitest";

import { CATEGORIES } from "@/lib/categories";
import { describeTimeline, moveItem, planName } from "@/lib/timelines";

describe("custom timelines", () => {
  it("describes a timeline's types and place", () => {
    const parking = CATEGORIES.filter((c) => c.group === "Parking").map((c) => c.value);
    expect(describeTimeline({ types: [...parking, "Tailgating"], placeName: "Prescot", radiusKm: 10 })).toBe(
      "Parking and Tailgating · within 10 km of Prescot",
    );
    expect(describeTimeline({ types: ["Tailgating"], placeName: null, radiusKm: null })).toBe(
      "Tailgating · anywhere",
    );
    expect(
      describeTimeline({
        types: ["DoubleYellows", "SpeedingInTown", "Tailgating", "ClosePassCyclist"],
        placeName: null,
        radiusKm: null,
      }),
    ).toBe("4 types · anywhere");
  });

  it("moves items within the list and ignores moves off the ends", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 2, 3)).toBe(list);
  });

  it("names plans", () => {
    expect(planName("Free")).toBe("Free");
    expect(planName("PremiumPlus")).toBe("Premium +");
  });
});

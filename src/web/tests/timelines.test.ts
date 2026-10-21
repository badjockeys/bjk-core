import { describe, expect, it } from "vitest";

import { describeTimeline, moveItem, planName } from "@/lib/timelines";

describe("custom timelines", () => {
  it("describes a timeline's types and place", () => {
    expect(describeTimeline({ types: ["BadParking", "Speeding"], placeName: "Prescot", radiusKm: 10 })).toBe(
      "Bad parking, Speeding · within 10 km of Prescot",
    );
    expect(describeTimeline({ types: ["Tailgating"], placeName: null, radiusKm: null })).toBe(
      "Tailgating · anywhere",
    );
    expect(
      describeTimeline({
        types: ["BadParking", "Speeding", "Tailgating", "ClosePass"],
        placeName: null,
        radiusKm: null,
      }),
    ).toBe("4 types of bad driving · anywhere");
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

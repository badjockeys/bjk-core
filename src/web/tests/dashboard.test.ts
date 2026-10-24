import { describe, expect, it } from "vitest";

import {
  hour,
  hourBand,
  isBuiltIn,
  move,
  periodLabel,
  widgetRequest,
  widgetTitle,
  widgetWhere,
} from "@/lib/dashboard";

describe("the dashboard", () => {
  it("names widgets by what they show and where", () => {
    expect(widgetTitle({ kind: "AreaIncidents", types: [] })).toBe("Incidents");
    expect(widgetTitle({ kind: "TypeTrend", types: ["PhoneInHand"] })).toBe("Phone in hand");
    expect(widgetTitle({ kind: "TopRoads", types: [] })).toBe("Top roads");
    expect(widgetWhere({ placeName: "L34 5", radiusKm: 2, periodDays: 30 })).toBe(
      "L34 5 · within 2 km · last 30 days",
    );
    expect(periodLabel(365)).toBe("Last 12 months");
  });

  it("tells built-in cards from widgets", () => {
    expect(isBuiltIn("Trending")).toBe(true);
    expect(isBuiltIn("AreaIncidents")).toBe(false);
  });

  it("writes hours the British way", () => {
    expect(hour(0)).toBe("12am");
    expect(hour(8)).toBe("8am");
    expect(hour(12)).toBe("12pm");
    expect(hourBand(20, 24)).toBe("8pm–12am");
  });

  it("moves cards within the list and ignores moves off the ends", () => {
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b", "c"], 2, 3)).toEqual(["a", "b", "c"]);
  });

  it("needs a picked place, and one type for a type's trend, before saving or previewing", () => {
    const draft = {
      kind: "AreaIncidents" as const,
      placeName: " Prescot ",
      latitude: 53.4291234,
      longitude: -2.8015,
      radiusKm: 2,
      periodDays: 30,
      types: [],
    };
    expect(widgetRequest(draft)).toEqual({
      kind: "AreaIncidents",
      placeName: "Prescot",
      latitude: 53.429123,
      longitude: -2.8015,
      radiusKm: 2,
      periodDays: 30,
      types: [],
    });
    expect(widgetRequest({ ...draft, latitude: null })).toBeNull();
    expect(widgetRequest({ ...draft, kind: "TypeTrend" })).toBeNull();
    expect(widgetRequest({ ...draft, kind: "TypeTrend", types: ["Tailgating", "PhoneInHand"] })).toBeNull();
    expect(
      widgetRequest({ ...draft, types: ["Tailgating", "PhoneInHand", "SpeedingInTown", "DoubleYellows"] })
        ?.types,
    ).toHaveLength(3);
  });
});

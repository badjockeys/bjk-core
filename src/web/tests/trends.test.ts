import { describe, expect, it } from "vitest";

import {
  addDays,
  areaAllowed,
  boxAround,
  changeLabel,
  earliestDay,
  periodLabel,
  rangeAllowed,
  rangeDates,
  shortDate,
  sparkline,
} from "@/lib/trends";

describe("category trends", () => {
  it("works out ranges from the API's today, across months", () => {
    expect(rangeDates("7d", "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(rangeDates("30d", "2026-10-18")).toEqual({ from: "2026-09-19", to: "2026-10-18" });
    expect(rangeDates("12m", "2026-10-18")).toEqual({ from: "2025-10-19", to: "2026-10-18" });
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(earliestDay("2026-10-18", 7)).toBe("2026-10-12");
  });

  it("only offers the ranges a plan can look back to", () => {
    expect(rangeAllowed("7d", 7)).toBe(true);
    expect(rangeAllowed("30d", 7)).toBe(false);
    expect(rangeAllowed("custom", 7)).toBe(false);
    expect(rangeAllowed("12m", 365)).toBe(true);
    expect(rangeAllowed("custom", 365)).toBe(true);
    expect(areaAllowed("Free")).toBe(false);
    expect(areaAllowed("Premium")).toBe(true);
    expect(areaAllowed("PremiumPlus")).toBe(true);
  });

  it("draws a sparkline inside its box, highest point near the top", () => {
    const { line, area } = sparkline([0, 5, 10], 88, 28);
    expect(line).toBe("M0,26L44,14L88,2");
    expect(area).toBe("M0,26L44,14L88,2L88,28L0,28Z");
    expect(sparkline([4], 88, 28).line).toBe("M0,2L88,2");
    expect(sparkline([], 88, 28).line).toBe("");
    expect(sparkline([0, 0], 10, 10).line).toBe("M0,8L10,8");
  });

  it("labels changes and periods", () => {
    expect(changeLabel(12)).toEqual({ text: "▲ 12%", trend: "up" });
    expect(changeLabel(-5)).toEqual({ text: "▼ 5%", trend: "down" });
    expect(changeLabel(0)).toEqual({ text: "No change", trend: "flat" });
    expect(changeLabel(null)).toBeNull();
    expect(periodLabel("Day")).toBe("a day");
    expect(periodLabel("Week")).toBe("a week");
    expect(periodLabel("Month")).toBe("a month");
    expect(shortDate("2026-10-12", 2026)).toBe("12 Oct");
    expect(shortDate("2025-10-12", 2026)).toBe("12 Oct 2025");
  });

  it("makes a box about 10 km each way around a place", () => {
    expect(boxAround(53.43, -2.8)).toBe("-2.9500,53.3400,-2.6500,53.5200");
  });
});

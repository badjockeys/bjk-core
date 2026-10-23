import { describe, expect, it } from "vitest";

import { compact, intervalLabel, niceMax, pointLabel, tickIndexes } from "@/lib/analytics";

describe("analytics helpers", () => {
  it("rounds the axis top to a clean number", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(480)).toBe(500);
    expect(niceMax(1001)).toBe(2000);
  });

  it("shortens big numbers", () => {
    expect(compact(950)).toBe("950");
    expect(compact(1200)).toBe("1.2K");
    expect(compact(34_000)).toBe("34K");
  });

  it("labels about six ticks, always the first and last", () => {
    expect(tickIndexes(4)).toEqual([0, 1, 2, 3]);
    const ticks = tickIndexes(48);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(47);
    expect(ticks.length).toBeLessThanOrEqual(7);
  });

  it("labels points in UK time", () => {
    expect(pointLabel("2026-10-23T08:00:00Z", "Hour")).toBe("09:00");
    expect(pointLabel("2026-10-23T08:00:00Z", "Day")).toBe("23 Oct");
    expect(pointLabel("2026-10-19T00:00:00Z", "Week", true)).toBe("Week from 19 Oct");
    expect(intervalLabel("Day")).toBe("Day by day");
  });
});

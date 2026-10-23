import { describe, expect, it } from "vitest";

import { daysSince, guessNation } from "@/lib/police";

describe("reporting to the police", () => {
  it.each([
    ["Leeds", 53.8, -1.55, "england-wales"],
    ["Cardiff", 51.48, -3.18, "england-wales"],
    ["Carlisle", 54.89, -2.93, "england-wales"],
    ["Berwick-upon-Tweed", 55.77, -2.0, "england-wales"],
    ["Whitehaven", 54.55, -3.59, "england-wales"],
    ["Gretna", 55.0, -3.06, "scotland"],
    ["Stranraer", 54.9, -5.02, "scotland"],
    ["Glasgow", 55.86, -4.25, "scotland"],
    ["Edinburgh", 55.95, -3.19, "scotland"],
    ["Belfast", 54.6, -5.93, "northern-ireland"],
    ["Derry", 55.0, -7.31, "northern-ireland"],
  ] as const)("guesses %s", (_, lat, lng, nation) => {
    expect(guessNation(lat, lng)).toBe(nation);
  });

  it("counts whole days since it happened", () => {
    const now = Date.parse("2026-10-23T12:00:00Z");
    expect(daysSince("2026-10-23T08:00:00Z", now)).toBe(0);
    expect(daysSince("2026-10-20T13:00:00Z", now)).toBe(2);
    expect(daysSince("2026-10-24T08:00:00Z", now)).toBe(0);
  });
});

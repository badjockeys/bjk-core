import { describe, expect, it } from "vitest";

import { containsWebAddress } from "@/lib/links";

describe("containsWebAddress", () => {
  it.each([
    "Cheap insurance at https://example.test/quote",
    "visit www.cheap-cars.example",
    "best deals cheap-insurance.co.uk today",
    "bit.ly/abc123",
    "go to dashcams.shop now",
  ])("finds the link in %s", (text) => {
    expect(containsWebAddress(text)).toBe(true);
  });

  it.each([
    "Turned left.In the wrong lane",
    "St.Helens ring road",
    "Doing 70 in a 30, e.g. near the M62",
    "3.5 tonne van on the A580",
    "left.in the bus lane",
    "",
  ])("leaves ordinary text alone: %s", (text) => {
    expect(containsWebAddress(text)).toBe(false);
  });
});

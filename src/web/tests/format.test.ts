import { describe, expect, it } from "vitest";

import {
  dateTime,
  duration,
  initials,
  plural,
  postedAt,
  timeAgo,
  ukLocalToIso,
  whenLabel,
} from "@/lib/format";

const at = Date.parse("2026-10-18T12:00:00Z");

describe("format", () => {
  it("shows X-style relative times", () => {
    expect(timeAgo("2026-10-18T11:59:30Z", at)).toBe("now");
    expect(timeAgo("2026-10-18T11:35:00Z", at)).toBe("25m");
    expect(timeAgo("2026-10-18T07:00:00Z", at)).toBe("5h");
    expect(timeAgo("2026-10-15T12:00:00Z", at)).toBe("3d");
    expect(timeAgo("2026-09-01T12:00:00Z", at)).toBe("1 Sept");
    expect(timeAgo("2025-09-01T12:00:00Z", at)).toBe("1 Sept 2025");
  });

  it("shows UK times, including summer time", () => {
    expect(dateTime("2026-10-18T07:05:00Z")).toBe("18 Oct 2026, 08:05");
    expect(postedAt("2026-10-18T07:14:00Z", at)).toBe("Today, 08:14");
    expect(postedAt("2026-10-17T07:14:00Z", at)).toBe("Yesterday, 08:14");
  });

  it("converts form dates and times in UK time to instants", () => {
    expect(ukLocalToIso("2026-10-18", "08:05")).toBe("2026-10-18T07:05:00.000Z"); // BST
    expect(ukLocalToIso("2026-12-01", "08:05")).toBe("2026-12-01T08:05:00.000Z"); // GMT
    expect(ukLocalToIso("18/10/2026", "08:05")).toBeNull();
  });

  it("formats durations, counts and initials", () => {
    expect(duration(24)).toBe("0:24");
    expect(duration(108)).toBe("1:48");
    expect(plural(1, "post")).toBe("1 post");
    expect(plural(1284, "post")).toBe("1,284 posts");
    expect(initials("Road Hog")).toBe("RH");
    expect(initials("dave")).toBe("DA");
    expect(initials("")).toBe("?");
  });

  it("labels the composer's when chip", () => {
    expect(whenLabel("2026-10-20", "08:14", "2026-10-20")).toBe("Today, 08:14");
    expect(whenLabel("2026-10-19", "22:05", "2026-10-20")).toBe("Yesterday, 22:05");
    expect(whenLabel("2026-10-17", "08:14", "2026-10-20")).toBe("Sat 17 Oct, 08:14");
    expect(whenLabel("2026-03-01", "07:00", "2026-03-02")).toBe("Yesterday, 07:00");
  });
});

import { describe, expect, it } from "vitest";

import {
  initialSelection,
  isWholeVideo,
  moveEdge,
  targetSize,
} from "@/lib/trim";

describe("trim rules", () => {
  it("starts with the first 30 seconds", () => {
    expect(initialSelection(108)).toEqual({ start: 0, end: 30 });
    expect(initialSelection(12)).toEqual({ start: 0, end: 12 });
  });

  it("drags the other edge along to keep the clip at 30 seconds or less", () => {
    expect(moveEdge({ start: 0, end: 30 }, "start", 12, 108)).toEqual({ start: 12, end: 30 });
    expect(moveEdge({ start: 12, end: 30 }, "end", 60, 108)).toEqual({ start: 30, end: 60 });
    expect(moveEdge({ start: 30, end: 60 }, "start", 10, 108)).toEqual({ start: 10, end: 40 });
  });

  it("keeps at least a second and stays inside the video", () => {
    expect(moveEdge({ start: 10, end: 20 }, "start", 19.8, 108)).toEqual({ start: 19.8, end: 20.8 });
    expect(moveEdge({ start: 100, end: 108 }, "end", 200, 108)).toEqual({ start: 100, end: 108 });
    expect(moveEdge({ start: 0, end: 5 }, "start", -3, 108)).toEqual({ start: 0, end: 5 });
  });

  it("knows when the video can go up as it is", () => {
    expect(isWholeVideo({ start: 0, end: 24 }, 24)).toBe(true);
    expect(isWholeVideo({ start: 2, end: 24 }, 24)).toBe(false);
    expect(isWholeVideo({ start: 0, end: 30 }, 108)).toBe(false);
  });

  it("shrinks to 720 pixels on the short side, never enlarging", () => {
    expect(targetSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(targetSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(targetSize(1280, 720)).toBeNull();
    expect(targetSize(640, 360)).toBeNull();
  });
});

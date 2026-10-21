import { describe, expect, it } from "vitest";

import {
  initialSelection,
  interestScores,
  isWholeVideo,
  moveEdge,
  suggestSelection,
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

describe("trim suggestions", () => {
  it("picks the 30 seconds around the spikes, with a lead-in", () => {
    // 120 seconds measured every half second: quiet, then a horn and a swerve at 70 seconds.
    const loudness = Array.from({ length: 240 }, (_, i) => (i >= 140 && i <= 144 ? 80 : 40 + (i % 3)));
    const change = Array.from({ length: 240 }, (_, i) => (i >= 141 && i <= 146 ? 30 : 2));
    const scores = interestScores(loudness, change);

    const clip = suggestSelection(scores, 0.5, 120);

    expect(clip).not.toBeNull();
    expect(clip!.end - clip!.start).toBeCloseTo(30);
    expect(clip!.start).toBeLessThanOrEqual(66);
    expect(clip!.end).toBeGreaterThanOrEqual(74);
  });

  it("suggests nothing when nothing stands out or the video is short", () => {
    const flat = interestScores(new Array(240).fill(40), new Array(240).fill(2));
    expect(suggestSelection(flat, 0.5, 120)).toBeNull();
    expect(suggestSelection([5, 5, 5], 0.5, 20)).toBeNull();
  });

  it("never runs past the end of the video", () => {
    const scores = Array.from({ length: 120 }, (_, i) => (i > 115 ? 10 : 0));
    const clip = suggestSelection(scores, 0.5, 60);
    expect(clip).toEqual({ start: 30, end: 60 });
  });
});

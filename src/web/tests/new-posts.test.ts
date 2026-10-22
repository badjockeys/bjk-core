import { describe, expect, it } from "vitest";

import { countNewPosts, isLiveFeed, newestOf, pullDistance } from "@/lib/new-posts";

const at = (id: string, createdAt: string) => ({ id, createdAt });

describe("new posts in the feed", () => {
  const shown = new Set(["a", "b"]);

  it("counts posts that aren't shown and are newer than the newest shown", () => {
    const items = [
      at("c", "2026-10-23T10:05:00Z"),
      at("d", "2026-10-23T10:01:00Z"),
      at("a", "2026-10-23T09:00:00Z"),
    ];
    expect(countNewPosts(items, shown, "2026-10-23T10:00:00Z")).toBe(2);
  });

  it("doesn't count an older post that moved up a ranked feed", () => {
    expect(countNewPosts([at("z", "2026-10-20T08:00:00Z")], shown, "2026-10-23T10:00:00Z")).toBe(0);
  });

  it("counts everything when nothing was shown", () => {
    expect(countNewPosts([at("c", "2026-10-23T10:05:00Z")], new Set(), null)).toBe(1);
  });

  it("finds the newest post shown", () => {
    expect(newestOf([at("a", "2026-10-22T10:00:00Z"), at("b", "2026-10-23T10:00:00Z")])).toBe(
      "2026-10-23T10:00:00Z",
    );
    expect(newestOf([])).toBeNull();
  });

  it("damps the pull and ignores pushes up", () => {
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(1000)).toBe(120);
  });

  it("checks the home tabs and public feeds, not your own lists", () => {
    expect(isLiveFeed({ kind: "for-you" })).toBe(true);
    expect(isLiveFeed({ kind: "feed" })).toBe(true);
    expect(isLiveFeed({ kind: "bookmarks" })).toBe(false);
    expect(isLiveFeed({ kind: "mine" })).toBe(false);
  });
});

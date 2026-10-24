import { describe, expect, it, vi } from "vitest";

import { base64UrlToBytes, pushSupport, subscriptionKeys } from "@/lib/push";
import { createViewBatch, FLUSH_EVERY_MS, MAX_BATCH } from "@/lib/view-batch";
import { voteClosingText, voteCount, votePercentages } from "@/lib/votes";

describe("votePercentages", () => {
  it("rounds to whole numbers that add up to 100", () => {
    const pct = votePercentages({ FilmingDriver: 1, OtherRoadUser: 1, Both: 1 }, [
      "FilmingDriver",
      "OtherRoadUser",
      "Both",
      "Nobody",
    ]);
    expect(pct).toEqual({ FilmingDriver: 34, OtherRoadUser: 33, Both: 33, Nobody: 0 });
  });

  it("is all zeros with no votes", () => {
    expect(votePercentages({}, ["Minor", "Careless"])).toEqual({ Minor: 0, Careless: 0 });
  });

  it("matches the API's sentence for 5 of 8", () => {
    expect(votePercentages({ Dangerous: 5, Careless: 3 }, ["Careless", "Dangerous"]).Dangerous).toBe(63);
  });
});

describe("voteClosingText", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");

  it("says when voting closes", () => {
    expect(voteClosingText({ isClosed: false, closesAt: "2026-10-21T17:00:00Z" }, now)).toBe(
      "Voting closes in 5 hours",
    );
    expect(voteClosingText({ isClosed: false, closesAt: "2026-10-21T13:00:00Z" }, now)).toBe(
      "Voting closes in 1 hour",
    );
    expect(voteClosingText({ isClosed: false, closesAt: "2026-10-28T12:00:00Z" }, now)).toBe(
      "Voting closes in 7 days",
    );
  });

  it("says when it has closed, and nothing when it never closes", () => {
    expect(voteClosingText({ isClosed: true, closesAt: "2026-10-20T12:00:00Z" }, now)).toBe(
      "Voting has closed",
    );
    expect(voteClosingText({ isClosed: false, closesAt: null }, now)).toBeNull();
  });

  it("counts votes", () => {
    expect(voteCount(1)).toBe("1 vote");
    expect(voteCount(1200)).toBe("1,200 votes");
  });
});

describe("push", () => {
  it("decodes the VAPID key", () => {
    const bytes = base64UrlToBytes(
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    );
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });

  it("takes the endpoint and keys from a subscription", () => {
    expect(
      subscriptionKeys({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } }),
    ).toEqual({ endpoint: "https://fcm.googleapis.com/x", p256dh: "a", auth: "b" });
    expect(subscriptionKeys({ endpoint: "https://fcm.googleapis.com/x" })).toBeNull();
  });

  it("asks iPhone users to add the site to the Home Screen first", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
    expect(
      pushSupport({ hasServiceWorker: true, hasPushManager: true, userAgent: iphone, standalone: false }),
    ).toBe("install-first");
    expect(
      pushSupport({ hasServiceWorker: true, hasPushManager: true, userAgent: iphone, standalone: true }),
    ).toBe("supported");
    expect(
      pushSupport({
        hasServiceWorker: false,
        hasPushManager: false,
        userAgent: "Firefox",
        standalone: false,
      }),
    ).toBe("unsupported");
  });
});

describe("view batches", () => {
  it("sends each post once, a few seconds after the first", () => {
    const sent: string[][] = [];
    const timers: (() => void)[] = [];
    const schedule = vi.fn((run: () => void, ms: number) => {
      expect(ms).toBe(FLUSH_EVERY_MS);
      timers.push(run);
    });
    const batch = createViewBatch((ids) => sent.push(ids), schedule);

    batch.add("a");
    batch.add("b");
    batch.add("a");
    expect(sent).toEqual([]);
    expect(schedule).toHaveBeenCalledTimes(1);

    timers[0]!();
    expect(sent).toEqual([["a", "b"]]);

    batch.add("a");
    batch.flush();
    expect(sent).toEqual([["a", "b"]]);
  });

  it("sends at once when a batch is full", () => {
    const sent: string[][] = [];
    const batch = createViewBatch(
      (ids) => sent.push(ids),
      () => undefined,
    );
    for (let i = 0; i < MAX_BATCH; i++) {
      batch.add(`p${i}`);
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(MAX_BATCH);
  });
});

describe("where visitors are sent", () => {
  it("sends visitors to join (which links to sign in), not straight to sign in", async () => {
    const { blockerHref } = await import("@/lib/blockers");
    expect(blockerHref("signin", "/p/1")).toBe("/auth/join?returnTo=%2Fp%2F1");
  });
});

import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient, endpoints } from "@/lib/api-client";
import {
  addDays,
  changeLabel,
  DEFAULT_FILTERS,
  heatmapQuery,
  hourBand,
  periodLabel,
  shade,
  toBbox,
  ukToday,
} from "@/lib/heatmap";
import { earliestExpiry, refreshDelay } from "@/lib/links";
import { newViewerCookie, verifyViewerCookie } from "@/lib/viewer-id";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/problem+json" },
        }),
  );
}

const SECRET = "a-test-secret-that-is-at-least-32-characters";

describe("viewer cookie", () => {
  it("signs a random id that only this secret accepts", async () => {
    const { id, value } = await newViewerCookie(SECRET);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await verifyViewerCookie(value, SECRET)).toBe(id);
    expect(await verifyViewerCookie(value, `${SECRET}-other`)).toBeNull();

    const [, signature] = value.split(".");
    expect(await verifyViewerCookie(`AAAAAAAAAAAAAAAAAAAAAA.${signature}`, SECRET)).toBeNull();
    expect(await verifyViewerCookie(undefined, SECRET)).toBeNull();
    expect(await verifyViewerCookie("not-a-cookie", SECRET)).toBeNull();
  });
});

describe("reels and heat map API calls", () => {
  it("sends the viewer id with reel requests and turns 403 daily_limit into isDailyLimit", async () => {
    const fetchImpl = fakeFetch(403, {
      status: 403,
      code: "daily_limit",
      resetsAt: "2026-10-19T23:00:00Z",
      limit: 10,
    });
    const api = endpoints(createApiClient("https://api.example.com", fetchImpl as unknown as typeof fetch));

    const error = await api.reels
      .list(null, "viewer-123", { category: "Tailgating" })
      .catch((e: unknown) => e);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.example.com/api/reels?category=Tailgating");
    expect((init.headers as Record<string, string>)["X-Viewer-Id"]).toBe("viewer-123");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isDailyLimit).toBe(true);
    expect((error as ApiError).problem?.resetsAt).toBe("2026-10-19T23:00:00Z");
  });

  it("posts plays and asks for heat map cells with the filters", async () => {
    const fetchImpl = fakeFetch(200, {});
    const api = endpoints(createApiClient("https://api.example.com", fetchImpl as unknown as typeof fetch));

    await api.reels.play("t", null, "p1");
    await api.heatmap.get("t", { bbox: "-2,53,-1,54", zoom: 9, categories: "ClosePass", days: "Weekdays" });
    await api.heatmap.area("t", { bbox: "-2,53,-1,54", zoom: 9 });

    const calls = fetchImpl.mock.calls as unknown as [URL, RequestInit][];
    expect(calls[0]![0].pathname).toBe("/api/reels/p1/play");
    expect(calls[0]![1].method).toBe("POST");
    expect(calls[1]![0].toString()).toBe(
      "https://api.example.com/api/heatmap?bbox=-2%2C53%2C-1%2C54&zoom=9&categories=ClosePass&days=Weekdays",
    );
    expect(calls[2]![0].searchParams.has("zoom")).toBe(false);
  });
});

describe("heat map helpers", () => {
  it("shades cells on the brand's cyan scale", () => {
    expect(shade(3, 40)).toBe("#E6F7FC");
    expect(shade(40, 40)).toBe("#00607F");
    expect(shade(3, 3)).toBe("#00B5E5");
  });

  it("labels hour bands, changes and periods", () => {
    expect(hourBand(8)).toBe("8–9am");
    expect(hourBand(11)).toBe("11am–12pm");
    expect(hourBand(12)).toBe("12–1pm");
    expect(hourBand(23)).toBe("11pm–12am");
    expect(changeLabel(12)).toBe("+12%");
    expect(changeLabel(-5)).toBe("−5%");
    expect(changeLabel(0)).toBe("no change");
    expect(periodLabel({ from: "2026-10-13", to: "2026-10-19" })).toBe("last 7 days");
    expect(periodLabel({ from: "2025-10-20", to: "2026-10-19" })).toBe("last 12 months");
  });

  it("builds the API query from the view and filters, in UK dates", () => {
    expect(ukToday(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(toBbox(-2.123456, 53.5, -1, 54.25)).toBe("-2.1235,53.5000,-1.0000,54.2500");
    expect(heatmapQuery("b", 10, { ...DEFAULT_FILTERS, period: "7d", hours: "7-10" }, "2026-10-19")).toEqual({
      bbox: "b",
      zoom: 10,
      from: "2026-10-13",
      to: "2026-10-19",
      categories: undefined,
      hours: "7-10",
      days: undefined,
    });
  });
});

describe("signed links", () => {
  it("finds the earliest expiry and refreshes 30 seconds before it", () => {
    const posts = [
      { media: [{ linksExpireAt: "2026-10-19T10:10:00Z" }, { linksExpireAt: null }] },
      { media: [{ linksExpireAt: "2026-10-19T10:05:00Z" }] },
      { media: [] },
    ];
    expect(earliestExpiry(posts)).toBe("2026-10-19T10:05:00.000Z");
    expect(earliestExpiry([{ media: [{}] }])).toBeNull();
    expect(refreshDelay("2026-10-19T10:05:00Z", Date.parse("2026-10-19T10:00:00Z"))).toBe(270_000);
    expect(refreshDelay("2026-10-19T10:05:00Z", Date.parse("2026-10-19T11:00:00Z"))).toBe(0);
    expect(refreshDelay(null)).toBeNull();
  });
});

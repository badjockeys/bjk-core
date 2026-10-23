import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient, endpoints } from "@/lib/api-client";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

describe("api client", () => {
  it("sends the bearer token and query, and parses JSON", async () => {
    const fetchImpl = fakeFetch(200, { items: [], page: 2, pageSize: 20, totalCount: 0 });
    const api = endpoints(createApiClient("https://api.example.com/", fetchImpl as unknown as typeof fetch));

    const page = await api.posts.list("token-1", { category: "DoubleYellows", page: 2 });

    expect(page.page).toBe(2);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://api.example.com/api/posts?category=DoubleYellows&page=2&pageSize=20",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    expect(init.cache).toBe("no-store");
  });

  it("caches anonymous reads when asked, and sends no Authorization header", async () => {
    const fetchImpl = fakeFetch(200, { items: [], page: 1, pageSize: 1, totalCount: 7 });
    const api = endpoints(createApiClient("https://api.example.com", fetchImpl as unknown as typeof fetch));

    await api.posts.list(null, { category: "ClosePassCyclist", pageSize: 1 }, 300);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      URL,
      RequestInit & { next?: { revalidate: number } },
    ];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.next).toEqual({ revalidate: 300 });
  });

  it("sends JSON bodies and handles 204", async () => {
    const fetchImpl = fakeFetch(204);
    const api = endpoints(createApiClient("https://api.example.com", fetchImpl as unknown as typeof fetch));

    await expect(api.posts.react("t", "abc", "Angry")).resolves.toBeUndefined();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/posts/abc/reaction");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ type: "Angry" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("passes the CAPTCHA token and visitor address for public reports", async () => {
    const fetchImpl = fakeFetch(200, {
      reference: "R-1",
      priority: "Normal",
      respondBy: "2026-10-21T00:00:00Z",
    });
    const api = endpoints(createApiClient("https://api.example.com", fetchImpl as unknown as typeof fetch));

    await api.reports.submitPublic(
      {
        target: "https://badjockeys.com/p/1",
        commentId: null,
        reason: "InThisClip",
        details: null,
        reporterName: "Sam",
        reporterEmail: "sam@example.com",
        consent: true,
      },
      "captcha-token",
      "203.0.113.9",
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Captcha-Token"]).toBe("captcha-token");
    expect(headers["CF-Connecting-IP"]).toBe("203.0.113.9");
  });

  it("turns problem details into ApiError with field messages", async () => {
    const fetchImpl = fakeFetch(400, {
      title: "One or more validation errors occurred.",
      status: 400,
      errors: { Title: ["Number plates aren't allowed in titles."] },
    });
    const api = endpoints(createApiClient("https://api.example.com", fetchImpl as unknown as typeof fetch));

    const error = await api.comments.add("t", "p", "hi").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.fieldErrors).toEqual({ title: ["Number plates aren't allowed in titles."] });
    expect(apiError.userMessage).toBe("Number plates aren't allowed in titles.");
  });

  it("recognises the age check problem", async () => {
    const fetchImpl = fakeFetch(403, {
      status: 403,
      title: "Age check needed.",
      detail: "Complete the age check before you post.",
      code: "age_verification_required",
    });
    const api = endpoints(createApiClient("https://api.example.com", fetchImpl as unknown as typeof fetch));

    const error = (await api.posts.react("t", "p", "Like").catch((e: unknown) => e)) as ApiError;

    expect(error.isAgeCheckNeeded).toBe(true);
    expect(error.userMessage).toBe("Complete the age check before you post.");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// One request: React's cache memoises for the request, so each test gets fresh modules (and a fresh "request").
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      let done = false;
      let value: R;
      return (...args: A) => {
        if (!done) {
          value = fn(...args);
          done = true;
        }
        return value;
      };
    },
  };
});

const api = {
  profiles: { me: vi.fn() },
  timelines: { forYou: vi.fn() },
};

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/lib/config", () => ({ getConfig: () => ({ authSecret: "x" }), isSecure: () => false }));
vi.mock("@/lib/session", () => ({
  readSession: async () => ({ sub: "u1", accessToken: "stale", accessTokenExpiresAt: 4_000_000_000 }),
  isExpired: () => false,
  writeSession: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock("@/lib/refresh", () => ({ refreshOnce: vi.fn() }));
vi.mock("@/lib/api", async () => ({ ApiError: (await import("@/lib/api-client")).ApiError, api: () => api }));

/** Built from the module copy the code under test sees (each test resets the modules). */
const apiError = async (...args: ConstructorParameters<typeof import("@/lib/api-client").ApiError>) =>
  new (await import("@/lib/api-client")).ApiError(...args);

const refused = () =>
  apiError(
    401,
    undefined,
    "/api/profiles/me",
    'Bearer error="invalid_token", error_description="The signature key was not found"',
  );

describe("a session the API refuses (e.g. after the local database was reset)", () => {
  beforeEach(() => {
    vi.resetModules();
    api.profiles.me.mockReset();
    api.timelines.forYou.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the page signed out, and stops using the token for the rest of the request", async () => {
    api.profiles.me.mockRejectedValue(await refused());
    const { getAccessToken, getViewer } = await import("@/lib/auth");

    const viewer = await getViewer();

    expect(viewer.signedIn).toBe(false);
    expect(viewer.sessionRefused).toBe(true);
    expect(await getAccessToken()).toBeNull();
  });

  it("loads For you as a visitor", async () => {
    api.profiles.me.mockRejectedValue(await refused());
    api.timelines.forYou.mockResolvedValue({ items: [], page: 1, pageSize: 20, totalCount: 0 });
    const { getViewer } = await import("@/lib/auth");
    const { homePage } = await import("@/lib/feed");

    await getViewer();
    const page = await homePage({ kind: "for-you" }, 1);

    expect(page?.totalCount).toBe(0);
    expect(api.timelines.forYou).toHaveBeenCalledWith(null, 1);
  });

  it("shows an empty feed rather than an error page if even the visitor's view fails", async () => {
    api.profiles.me.mockResolvedValue({ handle: "aaron" });
    api.timelines.forYou
      .mockRejectedValueOnce(await apiError(401, undefined, "/api/timelines/for-you"))
      .mockRejectedValueOnce(await apiError(401, undefined, "/api/timelines/for-you"));
    const { homePage } = await import("@/lib/feed");

    await expect(homePage({ kind: "for-you" }, 1)).resolves.toBeNull();
  });

  it("keeps a working session signed in", async () => {
    api.profiles.me.mockResolvedValue({ handle: "aaron", displayName: "Aaron" });
    const { getAccessToken, getViewer } = await import("@/lib/auth");

    const viewer = await getViewer();

    expect(viewer.signedIn).toBe(true);
    expect(viewer.sessionRefused).toBeUndefined();
    expect(await getAccessToken()).toBe("stale");
  });
});

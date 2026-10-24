import { expect, test } from "@playwright/test";

import { MOCK, resetMock, SEED, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("visitors see the feed, sensitive posts blurred and no comments", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Parked across two disabled bays, again")).toBeVisible();
  await expect(page.getByText("Undertaking a lorry on the M62")).toBeVisible();
  await expect(page.getByText("Caught a bad driver on camera?")).toBeVisible();

  // Sensitive posts are in the feed, but only as a blurred preview with "Join to view" (and a sign-in link).
  const sensitive = page.getByRole("article").filter({ hasText: "Serious crash on the A64" });
  await expect(sensitive.getByText("Injuries or a serious crash")).toBeVisible();
  await expect(sensitive.getByRole("link", { name: "Join to view" })).toHaveAttribute(
    "href",
    `/auth/join?returnTo=${encodeURIComponent(`/p/${SEED.sensitivePost}`)}`,
  );
  await expect(sensitive.locator('img[src$="/media/m-5-preview.png"]')).toHaveCount(1);
  await expect(sensitive.locator('img[src$="/media/m-5.png"]')).toHaveCount(0);

  // Photos in the feed are the 1080 px feed copies.
  const photos = page.getByRole("article").filter({ hasText: "Parked across two disabled bays" });
  await expect(photos.locator('img[src$="/media/m-1-feed.png"]')).toHaveCount(1);

  await page.getByText("Parked across two disabled bays, again").click();
  await expect(page).toHaveURL(new RegExp(`/p/${SEED.photoPost}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: "Parked across two disabled bays, again" }),
  ).toBeVisible();
  await expect(page.getByText("Join to see comments")).toBeVisible();
  await expect(page.getByText("Report it to the store too")).toHaveCount(0);

  // Preview cards for WhatsApp, X and Facebook.
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Parked across two disabled bays, again",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/media\/m-1-thumb\.png$/,
  );

  // A sensitive post's page shows the blurred preview too.
  await page.goto(`/p/${SEED.sensitivePost}`);
  await expect(page.getByRole("heading", { level: 1, name: "Serious crash on the A64" })).toBeVisible();
  await expect(page.getByText("Sensitive content", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join to view" })).toBeVisible();
});

test("visitors see every section in the side nav, but only Home works without joining", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  for (const [name, path] of [
    ["Reels", "/reels"],
    ["Map", "/map"],
    ["Communities", "/communities"],
    ["Notifications", "/notifications"],
    ["Bookmarks", "/bookmarks"],
    ["Your profile", "/profile/new"],
  ] as const) {
    await expect(
      nav.getByRole("link", { name: `${name} (join or sign in first)`, exact: true }),
    ).toHaveAttribute("href", `/auth/join?returnTo=${encodeURIComponent(path)}`);
  }
  await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");

  // The right-hand panel scrolls on its own when its cards are taller than the window.
  const aside = page.locator("aside.d-aside");
  await page.setViewportSize({ width: 1280, height: 500 });
  await expect(aside).toHaveCSS("overflow-y", "auto");
  const fits = await aside.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight + 1);
  expect(fits).toBe(true);
  await aside.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(aside.getByRole("link", { name: "Report content" })).toBeInViewport();
  // Its cards keep their full height (they used to be squashed to fit, cutting off the Join card's Sign in).
  for (const card of await aside.locator(".card").all()) {
    expect(await card.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  }
  await aside.getByRole("link", { name: "Sign in", exact: true }).scrollIntoViewIfNeeded();
  await expect(aside.getByRole("link", { name: "Sign in", exact: true })).toBeInViewport();
  // Account is behind the ⋯ on your own profile, not in the side nav.
  await expect(nav.getByRole("link", { name: /^Account/ })).toHaveCount(0);
});

test("members who haven't verified their age are offered the age check for sensitive posts", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__next-user`, { data: "larry" });
  await signIn(page, `/p/${SEED.sensitivePost}`);
  // Since 19 Oct the age check is only for sensitive posts: no banner, and commenting isn't gated on it.
  await expect(page.getByText("Check your age to join in.")).toHaveCount(0);
  await expect(page.getByText("Check your age to comment.")).toHaveCount(0);
  const verify = page.getByRole("link", { name: "Verify your age to view" });
  await expect(verify).toHaveAttribute(
    "href",
    `/auth/check-age?returnTo=${encodeURIComponent(`/p/${SEED.sensitivePost}`)}`,
  );

  // The (mock) age check passes and the identity server signs the member in again: the real photo now shows.
  await verify.click();
  await page.waitForURL((url) => url.pathname === `/p/${SEED.sensitivePost}`);
  await expect(page.getByRole("link", { name: "Verify your age to view" })).toHaveCount(0);
  await expect(page.locator('img[src$="/media/m-5-feed.png"]').first()).toBeAttached();
});

test("category trends show each type's line, total and change; Free is the last 7 days", async ({ page }) => {
  await page.goto("/");
  const trends = page.locator(".trends");
  await expect(trends.getByRole("heading", { name: "Category trends" })).toBeVisible();
  const parking = trends.getByRole("link", { name: /Disabled bay/ });
  await expect(parking).toContainText("48 incidents");
  await expect(parking).toContainText("▲ 60%");
  await expect(parking.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Disabled bay, no badge showing: 48 incidents, counted a day",
  );
  await expect(parking).toContainText("Parking");
  await expect(trends.getByRole("link", { name: /Speeding in a 20 or 30/ })).not.toContainText("%");
  await expect(
    trends.getByText("2 other types had fewer than 3 incidents, so they aren't shown."),
  ).toBeVisible();
  await expect(trends.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(trends.getByRole("button", { name: "30 days" })).toBeDisabled();
  await expect(trends.getByRole("link", { name: "Premium" })).toHaveAttribute("href", "/premium");
});

test("Premium members choose a longer range and narrow trends to an area", async ({ page, request }) => {
  await request.post("http://localhost:4010/__next-user", { data: "dave" });
  await signIn(page, "/");
  const trends = page.locator(".trends");
  await trends.getByRole("button", { name: "30 days" }).click();
  await expect(trends.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(trends.getByRole("link", { name: /Disabled bay/ })).toContainText("84 incidents");
  await expect(trends.getByLabel("Area")).toBeVisible();
  await trends.getByRole("button", { name: "Custom" }).click();
  await expect(trends.getByLabel("From")).toBeVisible();
});

test("hashtags in posts link to the tag's page, and Trending shows tags and places", async ({ page }) => {
  await page.goto("/");
  const trending = page.locator(".card", {
    has: page.getByRole("heading", { name: "Trending", exact: true }),
  });
  await expect(trending.getByRole("link", { name: /#M62/ })).toContainText("12 posts today");
  await expect(trending.getByText("Leeds · 9 posts today")).toBeVisible();

  await page.getByRole("link", { name: "#Undertaking" }).first().click();
  await expect(page).toHaveURL(/\/tag\/undertaking$/);
  await expect(page.getByRole("heading", { name: "#Undertaking" })).toBeVisible();
  await expect(page.getByText("1 post", { exact: true })).toBeVisible();
  await expect(page.getByText("Undertaking a lorry on the M62")).toBeVisible();
  await expect(page.getByText("Parked across two disabled bays, again")).toHaveCount(0);

  await page.goto("/tag/nothinghere");
  await expect(page.getByRole("heading", { name: "No posts with #nothinghere yet" })).toBeVisible();
});

test("category pages filter the feed, from Category trends, with an empty state", async ({ page }) => {
  await page.goto("/");
  await page
    .locator(".trends")
    .getByRole("link", { name: /Disabled bay/ })
    .click();
  await expect(page).toHaveURL(/\/c\/disabled-bay-no-badge-showing$/);
  await expect(page.getByText("Parked across two disabled bays, again")).toBeVisible();
  await expect(page.getByText("Undertaking a lorry on the M62")).toHaveCount(0);

  // The subcategory links up to its group, whose page lists every kind of parking.
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Parking" }).click();
  await expect(page).toHaveURL(/\/c\/parking$/);
  await expect(page.getByRole("heading", { name: "Parking", exact: true })).toBeVisible();
  await expect(page.getByText("Parked across two disabled bays, again")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Kinds of parking" })
      .getByRole("link", { name: "On double yellow lines" }),
  ).toHaveAttribute("href", "/c/on-double-yellow-lines");

  await page.goto("/c/tailgating");
  await expect(page.getByRole("heading", { name: "No tailgating posts yet" })).toBeVisible();
});

test("signing in goes to the identity server and comes back to the page", async ({ page }) => {
  const visited: string[] = [];
  page.on("request", (r) => visited.push(r.url()));

  await page.goto("/post/new");

  await expect(page).toHaveURL(/\/post\/new$/);
  await expect(page.getByRole("heading", { name: "Create post" })).toBeVisible();
  expect(
    visited.some(
      (u) => u.startsWith(`${MOCK}/connect/authorize`) && u.includes("code_challenge_method=S256"),
    ),
  ).toBe(true);

  // Signed in: the three-column navigation shows the member's links, and the session cookie can't be read by scripts.
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Your profile" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain("bjk_session");
  await expect(page.getByText("Serious crash on the A64")).toBeVisible();
  await expect(page.getByRole("link", { name: "Join to view" })).toHaveCount(0);

  // Your own profile shows posts that are still processing, which only you can see.
  await page.goto("/@roadhog");
  await expect(page.getByText("Wrong way round the roundabout")).toBeVisible();
  await expect(page.getByText("Processing: only you can see this for now")).toBeVisible();
});

test("members can sign out", async ({ page }) => {
  await signIn(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Caught a bad driver on camera?")).toBeVisible();
});

test("members switch between For you, Following and a custom timeline, and follow people", async ({
  page,
}) => {
  await signIn(page, "/");
  const tabs = page.getByRole("navigation", { name: "Timelines" });
  await expect(tabs.getByRole("link", { name: "For you" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Undertaking a lorry on the M62")).toBeVisible();

  // Following starts empty: only your own posts and people you follow.
  await tabs.getByRole("link", { name: "Following" }).click();
  await expect(page).toHaveURL(/\/following$/);
  await expect(page.getByRole("heading", { name: "Nothing from people you follow yet" })).toBeVisible();

  // Follow from Who to follow, then their posts show in Following.
  const who = page.locator(".card", { has: page.getByRole("heading", { name: "Who to follow" }) });
  await who.getByRole("button", { name: "Follow @dashcam_dave" }).click();
  await expect(page.getByText("Undertaking a lorry on the M62")).toBeVisible();

  // The profile shows the follow and the counts.
  await page.goto("/u/dashcam_dave");
  await expect(page.getByRole("button", { name: "Unfollow @dashcam_dave" })).toBeVisible();
  await expect(page.getByRole("link", { name: /1 Follower/ })).toBeVisible();

  // Free members get one custom timeline.
  await page.goto("/timelines");
  await page.getByLabel("Name").fill("Parking");
  await page
    .getByRole("group", { name: "Types of bad driving" })
    .getByLabel("Parking", { exact: true })
    .check();
  await page.getByRole("button", { name: "Add timeline" }).click();
  await expect(page.getByRole("link", { name: "Parking" })).toBeVisible();
  await expect(page.getByText("You have 1 of 1.")).toBeVisible();

  await page.goto("/");
  await page.getByRole("navigation", { name: "Timelines" }).getByRole("link", { name: "Parking" }).click();
  await expect(page.getByText("Parked across two disabled bays, again")).toBeVisible();
  await expect(page.getByText("Undertaking a lorry on the M62")).toHaveCount(0);
});

test("new posts show as a pill at the top of the feed, without reloading the page", async ({
  page,
  request,
}) => {
  await page.clock.install();
  await signIn(page, "/");
  const first = page.locator("article").first();
  await expect(first).toBeVisible();

  // Nothing new yet: no pill after the first check.
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("button", { name: /new post/ })).toBeHidden();

  // Someone posts; the next check (every 30 seconds) offers it rather than moving the feed.
  await request.post(`${MOCK}/__new-post`, { data: "Straight through the red on the A6" });
  await page.clock.fastForward(31_000);
  const pill = page.getByRole("button", { name: "↑ 1 new post" });
  await expect(pill).toBeVisible();
  await expect(page.getByText("Straight through the red on the A6")).toBeHidden();

  await pill.click();
  await expect(page.getByText("Straight through the red on the A6")).toBeVisible();
  await expect(pill).toBeHidden();
});

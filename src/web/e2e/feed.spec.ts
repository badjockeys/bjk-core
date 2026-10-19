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

  // Sensitive posts are in the feed, but only as a blurred preview with "Sign in to view".
  const sensitive = page.getByRole("article").filter({ hasText: "Serious crash on the A64" });
  await expect(sensitive.getByText("Injuries or a serious crash")).toBeVisible();
  await expect(sensitive.getByRole("link", { name: "Sign in to view" })).toHaveAttribute(
    "href",
    `/auth/sign-in?returnTo=${encodeURIComponent(`/p/${SEED.sensitivePost}`)}`,
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
  await expect(page.getByText("Sign in to see comments")).toBeVisible();
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
  await expect(page.getByRole("link", { name: "Sign in to view" })).toBeVisible();
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

test("category tabs filter the feed, with an empty state", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Categories" })
    .getByRole("link", { name: "Bad parking" })
    .click();
  await expect(page).toHaveURL(/\/c\/bad-parking$/);
  await expect(page.getByText("Parked across two disabled bays, again")).toBeVisible();
  await expect(page.getByText("Undertaking a lorry on the M62")).toHaveCount(0);

  await page.goto("/c/tailgating");
  await expect(page.getByRole("heading", { name: "No tailgating posts yet" })).toBeVisible();
});

test("signing in goes to the identity server and comes back to the page", async ({ page }) => {
  const visited: string[] = [];
  page.on("request", (r) => visited.push(r.url()));

  await page.goto("/post/new");

  await expect(page).toHaveURL(/\/post\/new$/);
  await expect(page.getByRole("heading", { name: "What did you catch?" })).toBeVisible();
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
  await expect(page.getByRole("link", { name: "Sign in to view" })).toHaveCount(0);

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

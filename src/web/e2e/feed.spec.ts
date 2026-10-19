import { expect, test } from "@playwright/test";

import { MOCK, resetMock, SEED, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("visitors see the feed, but no sensitive posts and no comments", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Parked across two disabled bays, again")).toBeVisible();
  await expect(page.getByText("Undertaking a lorry on the M62")).toBeVisible();
  await expect(page.getByText("Serious crash on the A64")).toHaveCount(0);
  await expect(page.getByText("Caught a bad driver on camera?")).toBeVisible();

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

  // A sensitive post's link doesn't work for visitors.
  await page.goto(`/p/${SEED.sensitivePost}`);
  await expect(page.getByRole("heading", { name: "Nothing to see here" })).toBeVisible();
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

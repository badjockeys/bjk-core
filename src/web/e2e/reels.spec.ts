import { expect, test } from "@playwright/test";

import { resetMock, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("visitors watch their free reels, then are asked to join", async ({ page }) => {
  // The mock API allows 2 reels a day when logged out (the real API: 10), counted by the signed viewer cookie.
  await page.goto("/reels");
  await expect(page.getByRole("heading", { name: "Reels", exact: true })).toBeVisible();
  // No "N of 2 free today" count and no category filter (owner, 22 Oct): the limit only shows once it's reached.
  await expect(page.getByText(/free today/)).toHaveCount(0);
  await expect(page.getByLabel("Category")).toHaveCount(0);
  expect(await page.evaluate(() => document.cookie)).not.toContain("bjk_viewer");

  // Only video posts are reels; the first one plays, and counts after 3 seconds.
  await expect(page.getByRole("region", { name: "Undertaking a lorry on the M62" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Parked across two disabled bays, again" })).toHaveCount(0);
  // Each reel counts after 3 seconds of watching; the limit sheet is added once the second has counted.
  await page.waitForTimeout(4_000);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("heading", { name: "That's today's 2 free reels" })).toBeAttached({ timeout: 15_000 });

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("heading", { name: "That's today's 2 free reels" })).toBeVisible();
  await expect(page.getByText("Join to keep watching.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Join Bad Jockeys" })).toHaveAttribute(
    "href",
    "/auth/join?returnTo=%2Freels",
  );

  // Coming back the same day goes straight to the limit.
  await page.reload();
  await expect(page.getByRole("heading", { name: "That's today's 2 free reels" })).toBeVisible();
});

test("members see every reel, with no count or category filter, and can open the premium page", async ({
  page,
}) => {
  await signIn(page, "/reels");
  await expect(page.getByRole("region", { name: "Undertaking a lorry on the M62" })).toBeVisible();
  await expect(page.getByText(/free today/)).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Reels" }),
  ).toHaveAttribute("aria-current", "page");

  await expect(page.getByLabel("Category")).toHaveCount(0);

  await page.getByRole("link", { name: "Get Premium" }).first().click();
  await expect(page.getByRole("heading", { name: "Premium is coming soon" })).toBeVisible();
  await expect(page.getByText("£19.99/year")).toBeVisible();
});

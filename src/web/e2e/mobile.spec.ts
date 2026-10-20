import { expect, test } from "@playwright/test";

import { resetMock, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("phones get the sign-up bar, then the glass tab bar and + button once signed in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Join to post, react and comment.")).toBeVisible();
  await expect(page.getByRole("link", { name: "New post" })).toHaveCount(0);

  await signIn(page);
  await expect(page.getByRole("link", { name: "New post" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" }).last();
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link")).toHaveText(["Home", "Reels", "Map", "Profile"]);

  // Account is on your own profile, as on Instagram.
  await nav.getByRole("link", { name: "Profile" }).click();
  await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Account settings" }).click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Your posts/ })).toBeVisible();
});

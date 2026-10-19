import { expect, test } from "@playwright/test";

import { resetMock, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("visitors are asked to sign in to see the incident map", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "Sign in to see the incident map" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute(
    "href",
    "/auth/sign-in?returnTo=%2Fmap",
  );
});

test("Free members get the 7-day preview with filters locked, and area figures", async ({ page }) => {
  await signIn(page, "/map");
  await expect(page.getByRole("heading", { name: "Incident map" })).toBeVisible();
  await expect(page.getByText("Free preview", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Category")).toBeDisabled();
  await expect(page.getByLabel("Time of day")).toBeDisabled();
  await expect(
    page.getByText(/Built from rounded locations\. Areas with fewer than 3 incidents are hidden/),
  ).toBeVisible();

  // The cells are drawn as squares; selecting one shows that area's figures.
  const cells = page.locator(".hm-map path.leaflet-interactive");
  await expect(cells).toHaveCount(3);
  await cells.first().click({ force: true });
  await expect(page.getByText("Kirkstall Road, Leeds", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("+12%")).toBeVisible();
  await expect(page.getByText("8–9am")).toBeVisible();
  await expect(page.getByText("Bad parking 36% · Tailgating 29%")).toBeVisible();
});

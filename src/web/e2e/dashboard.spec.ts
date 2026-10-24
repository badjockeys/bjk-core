import { expect, test } from "@playwright/test";

import { MOCK, resetMock, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

const panel = (page: import("@playwright/test").Page) => page.locator("aside.d-aside");

test("visitors see the default cards and are asked to join to make their own", async ({ page }) => {
  await page.goto("/");
  await expect(panel(page).getByRole("heading", { name: "Category trends" })).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Join to make your own" })).toHaveAttribute(
    "href",
    "/auth/join?returnTo=%2F",
  );
  await expect(panel(page).getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("Free members see the greyed-out Premium card and can hide and move the built-in cards", async ({
  page,
}) => {
  await signIn(page, "/");
  const aside = panel(page);
  await expect(aside.getByRole("heading", { name: "Your own stats" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "See Premium" })).toHaveAttribute("href", "/premium");
  await expect(aside.getByRole("button", { name: "Add a widget" })).toHaveCount(0);

  await aside.getByRole("button", { name: "Edit" }).click();
  await expect(aside.getByText("Your own widgets come with Premium.", { exact: false })).toBeVisible();
  await aside.getByRole("button", { name: "Hide Category trends" }).click();
  await expect(aside.getByRole("button", { name: "Show Category trends" })).toBeVisible();
  await aside.getByRole("button", { name: "Move Trending down" }).click();
  await expect(aside.getByRole("list", { name: "Your dashboard's cards" }).locator("b")).toHaveText([
    "Who to follow",
    "Trending",
    "Category trends",
  ]);
  await aside.getByRole("button", { name: "Done" }).click();
  await expect(aside.getByRole("heading", { name: "Category trends" })).toHaveCount(0);

  // Kept after a reload.
  await page.reload();
  await expect(panel(page).getByRole("heading", { name: "Category trends" })).toHaveCount(0);
});

test("Premium members add, change and delete their own widgets, up to 3", async ({ page, request }) => {
  await request.post(`${MOCK}/__next-user`, { data: "dave" });
  await signIn(page, "/");
  const aside = panel(page);
  await expect(aside.getByRole("heading", { name: "Your own stats" })).toHaveCount(0);

  await aside.getByRole("button", { name: "Add a widget" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a widget" });
  await expect(dialog.getByText("Choose a place to see the figures.")).toBeVisible();
  await dialog.getByLabel("Where").fill("Rain");
  await dialog.getByRole("option", { name: /Rainhill/ }).click();
  await dialog.getByLabel("5 km", { exact: true }).check();
  // The preview shows what the widget will.
  await expect(dialog.getByLabel("Preview").getByText("27", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Add widget" }).click();
  await expect(dialog).toBeHidden();

  const widget = aside.getByRole("region", { name: /^Incidents, Rainhill · within 5 km · last 30 days$/ });
  await expect(widget.getByText("27", { exact: true })).toBeVisible();
  await expect(widget.getByText("▲ 12%")).toBeVisible();
  await expect(widget.getByText("Tailgating")).toBeVisible();

  // Change it to top roads.
  await aside.getByRole("button", { name: "Edit", exact: true }).click();
  await aside.getByRole("button", { name: "Edit Incidents" }).click();
  const change = page.getByRole("dialog", { name: "Change widget" });
  await change.getByLabel("Top roads").check();
  await change.getByRole("button", { name: "Save changes" }).click();
  await aside.getByRole("button", { name: "Done" }).click();
  await expect(aside.getByText("A57 Warrington Road, Prescot")).toBeVisible();

  // One type's trend needs its type before it can be counted.
  await aside.getByRole("button", { name: "Add a widget" }).click();
  const second = page.getByRole("dialog", { name: "Add a widget" });
  await second.getByLabel("One type's trend").check();
  await second.getByLabel("Where").fill("Rain");
  await second.getByRole("option", { name: /Rainford/ }).click();
  await expect(second.getByText("Choose the type to see the figures.")).toBeVisible();
  await second.getByLabel("Type of bad driving").selectOption("PhoneInHand");
  await expect(second.getByLabel("Preview").getByText("27", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Add widget" }).click();
  await expect(aside.getByRole("region", { name: /^Phone in hand, Rainford/ })).toBeVisible();

  // Delete the first.
  await aside.getByRole("button", { name: "Edit", exact: true }).click();
  await aside.getByRole("button", { name: "Delete Top roads" }).click();
  await expect(aside.getByText("1 of 3 widgets.", { exact: false })).toBeVisible();
});

test("on your own profile, phones get a Dashboard tab", async ({ page, request }) => {
  await request.post(`${MOCK}/__next-user`, { data: "dave" });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/");
  await page.goto("/@dashcam_dave");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/tab=dashboard/);
  await expect(
    page.getByRole("region", { name: "Your dashboard" }).getByRole("button", { name: "Add a widget" }),
  ).toBeVisible();

  // The profile's tabs switch the page (they're plain links: Next.js's in-page navigation didn't, on /@handle).
  await page.getByRole("link", { name: "Replies", exact: true }).click();
  await expect(page.getByRole("link", { name: "Replies", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Not on other people's profiles.
  await page.goto("/@roadhog");
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
});

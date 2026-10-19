import { expect, test } from "@playwright/test";

import { PNG, resetMock, SEED, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test.describe("posting", () => {
  test.use({ geolocation: { latitude: 53.8155, longitude: -1.6024 }, permissions: ["geolocation"] });

  test("a photo post goes live after processing", async ({ page }) => {
    await signIn(page, "/post/new");
    await expect(page.getByRole("heading", { name: "What did you catch?" })).toBeVisible();

    await page
      .locator('input[type="file"][multiple]')
      .setInputFiles({ name: "parking.png", mimeType: "image/png", buffer: PNG });

    await expect(page.getByText("(1 of 10)")).toBeVisible();
    await page.getByLabel("Title").fill("Parked on the zigzags outside the school");
    await page.getByLabel("What happened?").selectOption("BadParking");
    await page.getByLabel("Where?").fill("Kirkstall Road, Leeds");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(/Pin placed/)).toBeVisible();
    await page.getByLabel(/I took these photos/).check();

    const post = page.getByRole("button", { name: "Post", exact: true });
    await expect(post).toBeEnabled({ timeout: 20_000 });
    await post.click();

    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
    await expect(page.getByText("Posted. Thanks for sharing.")).toBeVisible();
    await expect(page.getByText(/Processing your photos/)).toBeVisible();

    // The mock finishes processing after a couple of seconds; the page checks again by itself.
    await expect(page.getByText(/Processing your photos/)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Like 0" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Parked on the zigzags outside the school")).toBeVisible();
  });
});

test("comment, reply and react", async ({ page }) => {
  await signIn(page, `/p/${SEED.photoPost}`);

  await page.getByRole("button", { name: "Angry 2" }).click();
  await expect(page.getByRole("button", { name: "Angry 3" })).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByText("Report it to the store too, they can fine them.")).toBeVisible();
  await page.getByPlaceholder("Add a comment").fill("Same car was outside the school yesterday.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByText("Same car was outside the school yesterday.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 comments" })).toBeVisible();

  const larry = page.locator(".comment", { hasText: "Report it to the store too" });
  await larry.getByRole("button", { name: "Reply" }).click();
  await page
    .getByPlaceholder("Reply to @lane_one_larry")
    .fill("Already done, they said they'd look into it.");
  await page
    .locator("form", { has: page.getByPlaceholder("Reply to @lane_one_larry") })
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await expect(page.getByText("Already done, they said they'd look into it.")).toBeVisible();
  await expect(page.getByText("· replying to @lane_one_larry")).toBeVisible();

  await larry.getByRole("button", { name: /^0 reactions/ }).click();
  await expect(larry.getByRole("button", { name: /^1 reactions/ })).toHaveAttribute("aria-pressed", "true");

  // Everything was saved.
  await page.reload();
  await expect(page.getByRole("button", { name: "Angry 3" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Already done, they said they'd look into it.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "3 comments" })).toBeVisible();
});

test("members report a post from its ⋯ menu", async ({ page, request }) => {
  await signIn(page, `/p/${SEED.photoPost}`);
  await page.getByRole("button", { name: "More: report or copy link" }).click();
  await page.getByRole("menuitem", { name: "Report post" }).click();
  const dialog = page.getByRole("dialog", { name: "Report this post" });
  await dialog.getByLabel("Spam").check();
  await dialog.getByLabel(/Anything else/).fill("Posted the same thing three times.");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks. Our moderators will review it.")).toBeVisible();

  const state = await (await request.get("http://localhost:4010/__state")).json();
  expect(state.reports).toEqual([expect.objectContaining({ target: SEED.photoPost, reason: "Spam" })]);
});

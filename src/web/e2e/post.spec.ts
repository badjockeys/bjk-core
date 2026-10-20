import { expect, test } from "@playwright/test";

import { PNG, resetMock, SEED, signIn } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test.describe("posting", () => {
  test.use({ geolocation: { latitude: 53.8155, longitude: -1.6024 }, permissions: ["geolocation"] });

  test("a photo post goes live after processing", async ({ page }) => {
    await signIn(page, "/post/new");
    await expect(page.getByRole("heading", { name: "Create post" })).toBeVisible();
    const post = page.getByRole("button", { name: "Post", exact: true });
    await expect(post).toBeDisabled();
    await expect(page.getByText("Still needed: photos or a video, title")).toBeVisible();

    await page
      .getByTestId("photo-input")
      .setInputFiles({ name: "parking.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("1 of 10")).toBeVisible();

    await page.getByLabel("Title").fill("Parked on the zigzags outside the school");
    await page.getByLabel("What happened? (optional)").fill("Right on the zigzags at home time.");
    await expect(page.getByText("34 / 500")).toBeVisible();

    // Several types: each shows as a tag, the first chosen is the main one.
    await page.getByRole("button", { name: "What kind of bad driving?" }).click();
    const types = page.getByRole("group", { name: "Types of bad driving" });
    await types.getByLabel("Bad parking").check();
    await types.getByLabel("Other").check();
    await page.getByRole("button", { name: "Done · 2 chosen" }).click();
    await expect(page.getByRole("button", { name: "Remove Other" })).toBeVisible();

    await page.getByRole("button", { name: "Add where it happened" }).click();
    await page.getByLabel("Road and town").fill("Kirkstall Road, Leeds");
    await page.getByRole("button", { name: "Use my location" }).click();
    await page.getByRole("button", { name: "Use this place" }).click();
    await expect(page.getByRole("button", { name: "Where: Kirkstall Road, Leeds. Change" })).toBeVisible();

    await expect(page.getByText("Still needed: confirm you took them")).toBeVisible();
    await page.getByLabel(/I took these photos/).check();

    await expect(post).toBeEnabled({ timeout: 20_000 });
    await post.click();

    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
    await expect(page.getByText("Posted. Thanks for sharing.")).toBeVisible();
    const tags = page.getByRole("list", { name: "Types of bad driving" }).first();
    await expect(tags.getByRole("link")).toHaveText(["Bad parking", "Other"]);
    await expect(page.getByText(/Processing your photos/)).toBeVisible();

    // The mock finishes processing after a couple of seconds; the page checks again by itself.
    await expect(page.getByText(/Processing your photos/)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Like 0" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Parked on the zigzags outside the school")).toBeVisible();
  });

  test("the composer opens as a pop-up over the feed and closes after posting", async ({ page }) => {
    await signIn(page, "/");
    await page.getByRole("link", { name: /Seen some bad driving/ }).click();

    // The pop-up is named after what it shows: "Create post", or the panel open in it.
    const dialog = page.getByRole("dialog");
    await expect(page.getByRole("dialog", { name: "Create post" })).toBeVisible();
    await expect(page).toHaveURL(/\/post\/new$/);

    // Closing an untouched composer goes straight back to the feed.
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("link", { name: /Seen some bad driving/ }).click();
    await dialog
      .getByTestId("photo-input")
      .setInputFiles({ name: "tailgate.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByLabel("Title").fill("Tailgated for two miles on the A57");
    await dialog.getByRole("button", { name: "What kind of bad driving?" }).click();
    await dialog.getByLabel("Tailgating").check();
    await dialog.getByRole("button", { name: "Done · 1 chosen" }).click();
    await dialog.getByRole("button", { name: "Add where it happened" }).click();
    await dialog.getByLabel("Road and town").fill("A57 Warrington Road, Rainhill");
    await dialog.getByRole("button", { name: "Use my location" }).click();
    await dialog.getByRole("button", { name: "Use this place" }).click();

    // Driving incidents can have passengers: they're asked to accept before their name shows.
    await dialog.getByRole("button", { name: "Tag a passenger" }).click();
    await dialog.getByLabel("Passenger's username").fill("@lane_one_larry");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Remove @lane_one_larry" })).toBeVisible();

    await dialog.getByLabel(/I took these photos/).check();
    await dialog.getByRole("button", { name: "Post", exact: true }).click();

    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Posted. Thanks for sharing.")).toBeVisible();
    await expect(page.getByText("Waiting for @lane_one_larry to accept")).toBeVisible();
  });

  test("a passenger approves their tag from the account page", async ({ page }) => {
    await signIn(page, "/account");
    const requests = page.getByRole("region", { name: "Approve tags" });
    await expect(requests.getByRole("link", { name: "Undertaking a lorry on the M62" })).toBeVisible();
    await requests.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("heading", { name: "Approve tags" })).toBeHidden();

    await page.goto(`/p/${SEED.videoPost}`);
    await expect(page.getByText("You're shown on this post as a passenger.")).toBeVisible();
    await expect(page.locator(".with-line").first()).toContainText("with Road Hog");
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

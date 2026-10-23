import { expect, test } from "@playwright/test";

import { MOCK, resetMock, signIn } from "./helpers";

// Ask Bad Jockeys is hidden while it's on hold (ASK_BAD_JOCKEYS_ENABLED in src/lib/chat.ts). Remove this line when
// it's switched on again.
test.skip(true, "Ask Bad Jockeys is switched off in the web app for now.");

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("Premium members ask about their own town and open the answer on the map", async ({ page, request }) => {
  await request.post(`${MOCK}/__next-user`, { data: "dave" });
  await request.post(`${MOCK}/__home-area`, {
    data: { user: "dave", placeName: "Prescot", latitude: 53.43, longitude: -2.8 },
  });
  await signIn(page, "/");

  await page.getByRole("button", { name: "Ask Bad Jockeys" }).click();
  const chat = page.getByRole("dialog", { name: "Ask Bad Jockeys" });
  await expect(chat.getByText("20 questions left today")).toBeVisible();
  await expect(
    chat.getByRole("button", { name: "How many incidents have there been in Prescot this month?" }),
  ).toBeVisible();

  await chat.getByRole("button", { name: "Worst roads for tailgating in Prescot" }).click();
  await expect(
    chat.getByText("The A57 Warrington Road had the most tailgating reports in the last year."),
  ).toBeVisible();
  await expect(chat.getByText("fewer than 3", { exact: true })).toBeVisible();
  await expect(chat.getByText("19 questions left today")).toBeVisible();

  await chat.getByRole("link", { name: "Open on the map" }).click();
  await page.waitForURL(/\/map\?lat=53\.430&lng=-2\.800&zoom=13&types=Tailgating/);
  await expect(page.getByRole("heading", { name: "Incident map" })).toBeVisible();
});

test("Free members without a home area see untailored examples and the locked preview", async ({ page }) => {
  await signIn(page, "/");

  await page.getByRole("button", { name: "Ask Bad Jockeys" }).click();
  const chat = page.getByRole("dialog", { name: "Ask Bad Jockeys" });
  await expect(chat.getByText("Ask Bad Jockeys is part of Premium")).toBeVisible();
  await expect(
    chat.getByRole("button", { name: "Which towns have had the most incidents this month?" }),
  ).toBeDisabled();
  await expect(chat.getByText(/Prescot|Warrington/)).toHaveCount(0);
  await expect(chat.getByLabel("Your question")).toBeDisabled();
});

import { expect, test } from "@playwright/test";

import { MOCK, resetMock, SEED } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("anyone can report content with the public form", async ({ page, request }) => {
  const link = `http://localhost:3000/p/${SEED.videoPost}`;
  await page.goto(`/report?post=${encodeURIComponent(link)}`);

  await expect(page.getByRole("heading", { name: "Report content" })).toBeVisible();
  await expect(page.getByLabel("Link to the post")).toHaveValue(link);
  await page.getByLabel("I'm in this clip and want it blurred or removed").check();
  await page.getByLabel("Tell us more").fill("I'm the cyclist at 0:12. My club kit is clearly visible.");
  await page.getByLabel("Your name").fill("Sam Patel");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByLabel(/I confirm this report is true/).check();

  // Cloudflare's test site key always passes; the button waits for the token.
  const send = page.getByRole("button", { name: "Send report" });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();

  await expect(page.getByRole("heading", { name: "Thanks, we've got your report" })).toBeVisible();
  await expect(page.getByText(/Your reference is R-\d+/)).toBeVisible();

  const state = await (await request.get(`${MOCK}/__state`)).json();
  expect(state.publicReports).toEqual([
    expect.objectContaining({
      target: link,
      reason: "InThisClip",
      reporterEmail: "sam@example.com",
      consent: true,
    }),
  ]);
  expect(state.publicReports[0].captcha).toBeTruthy();
});

import { expect, test } from "@playwright/test";

import { MOCK, PNG, resetMock, SEED, signIn } from "./helpers";

// Communities (owner, 23 Oct 2026). The mock seeds Manchester Road Watch (roadhog's a member), a private Didsbury
// School Run and a Cyclists topic, all run by dave.

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test("members see a community's shared posts and can reply to its discussions", async ({ page }) => {
  await signIn(page, "/communities");
  await expect(page.getByRole("heading", { name: "Communities" })).toBeVisible();
  await page
    .getByRole("link", { name: /Manchester Road Watch/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/communities\/manchester-road-watch/);
  await expect(page.getByText("Joined").first()).toBeVisible();
  await expect(page.locator(`a[href="/p/${SEED.photoPost}"]`).first()).toBeVisible();

  await page
    .getByRole("navigation", { name: "Community" })
    .getByRole("link", { name: "Discussions" })
    .click();
  await page.getByRole("link", { name: /Mancunian Way roadworks/ }).click();
  await page.getByLabel("Your reply").fill("Every morning at the Oxford Road exit.");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByText("Every morning at the Oxford Road exit.")).toBeVisible();
});

test("a private community stays locked until you're let in", async ({ page }) => {
  await signIn(page, "/communities/didsbury-school-run");
  await expect(page.getByRole("heading", { name: "Only members can see inside" })).toBeVisible();
  await page.getByRole("button", { name: "Ask to join: Didsbury School Run" }).click();
  await expect(page.getByText("You've asked to join. An admin or moderator will decide.")).toBeVisible();
});

test.describe("sharing when posting", () => {
  // Central Manchester: inside Manchester Road Watch's 25 km.
  test.use({ geolocation: { latitude: 53.4794, longitude: -2.2453 }, permissions: ["geolocation"] });

  test("the composer recommends the community covering where it happened and shares into it", async ({
    page,
    request,
  }) => {
    await signIn(page, "/post/new");
    await page
      .getByTestId("photo-input")
      .setInputFiles({ name: "parking.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Title").fill("Across two bays on Deansgate");
    await page.getByRole("button", { name: "What kind of bad driving?" }).click();
    await page.getByRole("group", { name: "Types of bad driving" }).getByLabel("Bad parking").check();
    await page.getByRole("button", { name: "Done · 1 chosen" }).click();
    await page.getByRole("button", { name: "Add where it happened" }).click();
    await page.getByLabel("Road and town").fill("Deansgate, Manchester");
    await page.getByRole("button", { name: "Use my location" }).click();
    await page.getByRole("button", { name: "Use this place" }).click();

    const share = page.getByRole("group", { name: "Share with your communities" });
    await expect(share.getByText("Recommended: covers where this happened")).toBeVisible();
    await expect(share.getByRole("checkbox", { name: /Manchester Road Watch/ })).toBeChecked();
    await expect(share.getByRole("checkbox", { name: /Cyclists/ })).not.toBeChecked();

    await page.getByLabel(/I took these photos/).check();
    const post = page.getByRole("button", { name: "Post", exact: true });
    await expect(post).toBeEnabled({ timeout: 20_000 });
    await post.click();
    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);

    const id = new URL(page.url()).pathname.split("/").pop();
    const state = await (await request.get(`${MOCK}/__state`)).json();
    expect(state.communityPosts).toContainEqual(
      expect.objectContaining({ communityId: "c0000000-0000-4000-8000-000000000001", postId: id }),
    );
  });
});

test("an admin invites someone, who hears about it and accepts", async ({ page, request }) => {
  await request.post(`${MOCK}/__next-user`, { data: "dave" });
  await signIn(page, "/communities/didsbury-school-run/manage?tab=invited");
  await expect(page.getByText("No open invitations.")).toBeVisible();
  await page.getByLabel("Invite someone").fill("@roadhog");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByRole("button", { name: /Cancel the invitation to/ })).toBeVisible();

  await page.context().clearCookies();
  await request.post(`${MOCK}/__next-user`, { data: "roadhog" });
  await signIn(page, "/notifications");
  await page.getByRole("link", { name: /invited you to join Didsbury School Run/ }).click();
  await expect(page).toHaveURL(/\/communities\/didsbury-school-run/);
  await expect(page.getByText("You've been invited. Accept to see inside.")).toBeVisible();
  await page.getByRole("button", { name: "Accept the invitation to join Didsbury School Run" }).click();
  await expect(page.getByRole("navigation", { name: "Community" })).toBeVisible();
});

test("replying to someone's discussion tells them", async ({ page, request }) => {
  await signIn(page, "/communities/manchester-road-watch/d/d0000000-0000-4000-8000-000000000001");
  await page.getByLabel("Your reply").fill("Seen it too, every morning.");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByText("Seen it too, every morning.")).toBeVisible();

  await page.context().clearCookies();
  await request.post(`${MOCK}/__next-user`, { data: "dave" });
  await signIn(page, "/notifications");
  await expect(page.getByRole("link", { name: /replied to your discussion “Mancunian Way roadworks”/ })).toHaveAttribute(
    "href",
    "/communities/manchester-road-watch/d/d0000000-0000-4000-8000-000000000001",
  );
});

import { expect, test } from "@playwright/test";

import { MOCK, PNG, resetMock, SEED, signIn } from "./helpers";

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

    // Several types, found by searching: each shows as a tag, the first chosen is the main one.
    await page.getByRole("button", { name: "What kind of bad driving?" }).click();
    const search = page.getByLabel("Search the types of bad driving");
    await search.fill("zig");
    await page.getByLabel("On school zig-zags").check();
    await search.fill("phone");
    await page.getByLabel("Phone in hand").check();
    await search.fill("");
    await expect(page.getByText("Parking · 1 chosen")).toBeVisible();
    await page.getByRole("button", { name: "Done · 2 chosen" }).click();
    await expect(page.getByRole("button", { name: "Remove Phone in hand" })).toBeVisible();

    await page.getByRole("button", { name: "Add where it happened" }).click();
    await page.getByLabel("Road and town").fill("Kirkstall Road, Leeds");
    await page.getByRole("button", { name: "Use my location" }).click();
    await page.getByRole("button", { name: "Use this place" }).click();
    await expect(page.getByRole("button", { name: "Where: Kirkstall Road, Leeds. Change" })).toBeVisible();

    // The vehicle, from lists. Whether it was reported isn't asked: that's offered under the post.
    await page.getByRole("button", { name: "Add the vehicle" }).click();
    await page.getByLabel("Car", { exact: true }).check();
    await page.getByLabel("Make").selectOption("BMW");
    await page.getByLabel("Model").selectOption("3 Series");
    await page.getByLabel("Black").check();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("button", { name: "Vehicle: Black BMW 3 Series (car). Change" }),
    ).toBeVisible();

    await expect(page.getByText("Still needed: confirm you took them")).toBeVisible();
    await page.getByLabel(/I took these photos/).check();

    await expect(post).toBeEnabled({ timeout: 20_000 });
    await post.click();

    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
    await expect(page.getByText("Posted. Thanks for sharing.")).toBeVisible();
    const tags = page.getByRole("list", { name: "Types of bad driving" }).first();
    await expect(tags.getByRole("link")).toHaveText(["On school zig-zags", "Phone in hand"]);
    await expect(page.getByText("Black BMW 3 Series (car)").first()).toBeVisible();
    await expect(page.getByText(/Processing your photos/)).toBeVisible();

    // The mock finishes processing after a couple of seconds; the page checks again by itself.
    await expect(page.getByText(/Processing your photos/)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Like", exact: true })).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Parked on the zigzags outside the school")).toBeVisible();
  });

  test("the composer pops out in a dialog from the top of the feed and closes after posting", async ({
    page,
  }) => {
    await signIn(page, "/");
    const open = page.getByRole("button", { name: "Seen some bad driving, Road?" });
    await open.click();

    // A pop-out dialog, like Facebook; its panels open in the same dialog.
    const dialog = page.getByRole("dialog");
    await expect(page.getByRole("dialog", { name: "Create post" })).toBeVisible();
    await expect(dialog.getByLabel("Title")).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    // Closing an untouched composer closes the dialog straight away.
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Type and Location under the bar open the dialog on that step.
    await page.getByRole("button", { name: "Location", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Where did it happen?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Back to your post" }).click();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Type", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "What kind of bad driving?" })).toBeVisible();
    // Open a group and pick from it.
    await dialog.locator("summary", { hasText: "Following too close" }).click();
    await dialog.getByLabel("Tailgating").check();
    await dialog.getByRole("button", { name: "Done · 1 chosen" }).click();
    await expect(page.getByRole("dialog", { name: "Create post" })).toBeVisible();

    await dialog
      .getByTestId("photo-input")
      .setInputFiles({ name: "tailgate.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByLabel("Title").fill("Tailgated for two miles on the A57");
    await dialog.getByRole("button", { name: "Where it happened", exact: true }).click();
    await dialog.getByLabel("Road and town").fill("A57 Warrington Road, Rainhill");
    await dialog.getByRole("button", { name: "Use my location" }).click();
    await dialog.getByRole("button", { name: "Use this place" }).click();
    await expect(
      dialog.getByRole("button", { name: "Where: A57 Warrington Road, Rainhill. Change" }),
    ).toBeVisible();

    // Driving incidents can have passengers: they're asked to accept before their name shows.
    await dialog.getByRole("button", { name: "Tag a passenger" }).click();
    // Not yourself: the author can't be their own passenger.
    const passenger = dialog.getByLabel("Passenger's name or username");
    await passenger.fill("@roadhog");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("You can't tag yourself.")).toBeVisible();
    // Typing the start of a name drops down people to pick, your followers first (like Facebook and Instagram).
    await passenger.fill("La");
    const people = dialog.getByRole("listbox", { name: "People to tag" });
    await expect(people.getByRole("option").first()).toContainText("Lane One Larry");
    await expect(people.getByRole("option").first()).toContainText("@lane_one_larry · Follows you");
    await people.getByRole("option", { name: /Lane One Larry/ }).click();
    await expect(dialog.getByRole("button", { name: "Remove @lane_one_larry" })).toBeVisible();

    await dialog.getByLabel(/I took these photos/).check();
    await dialog.getByRole("button", { name: "Post", exact: true }).click();

    // Posted: still on the feed, the dialog closed, with a link to the post.
    await expect(page.getByText(/Posted\. Thanks for sharing\./)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("link", { name: "View post" }).click();
    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
    await expect(page.getByText("Waiting for @lane_one_larry to accept")).toBeVisible();
  });

  test("closing a started post offers to keep it as a draft, which reopens later and posts", async ({
    page,
  }) => {
    await signIn(page, "/");
    const open = page.getByRole("button", { name: "Seen some bad driving, Road?" });
    const dialog = page.getByRole("dialog");
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await open.click();
    await dialog
      .getByTestId("photo-input")
      .setInputFiles({ name: "parked.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByLabel("Title").fill("Parked across the dropped kerb");
    await expect(dialog.getByText("Uploading…")).toBeHidden();

    // Closing asks: save it as a draft, throw it away, or keep going.
    await close.click();
    await expect(page.getByRole("dialog", { name: "Save this post as a draft?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(dialog).toBeHidden();

    // Next time, the composer offers the draft; opening it brings everything back.
    await open.click();
    await dialog.getByRole("button", { name: /You have 1 draft saved/ }).click();
    await expect(page.getByRole("dialog", { name: "Drafts" })).toBeVisible();
    await expect(dialog.getByText("1 of 5 drafts")).toBeVisible();
    await dialog.getByRole("button", { name: "Open Parked across the dropped kerb" }).click();
    await expect(dialog.getByLabel("Title")).toHaveValue("Parked across the dropped kerb");

    // Leaving an opened draft asks about the changes; discarding them keeps the draft as it was.
    await close.click();
    await expect(page.getByRole("dialog", { name: "Save your changes?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(dialog).toBeHidden();

    // Finish it and post: the draft goes.
    await open.click();
    await dialog.getByRole("button", { name: /You have 1 draft saved/ }).click();
    await dialog.getByRole("button", { name: "Open Parked across the dropped kerb" }).click();
    await dialog.getByRole("button", { name: "What kind of bad driving?" }).click();
    await dialog.getByLabel("Search the types of bad driving").fill("dropped");
    await dialog.getByLabel("Blocking a driveway or dropped kerb").check();
    await dialog.getByRole("button", { name: "Done · 1 chosen" }).click();
    await dialog.getByRole("button", { name: "Add where it happened" }).click();
    await dialog.getByLabel("Road and town").fill("The Headrow, Leeds");
    await dialog.getByRole("button", { name: "Use my location" }).click();
    await dialog.getByRole("button", { name: "Use this place" }).click();
    await dialog.getByLabel(/I took these photos/).check();
    await dialog.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(/Posted\. Thanks for sharing\./)).toBeVisible();

    await open.click();
    await expect(page.getByRole("dialog", { name: "Create post" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /draft saved/ })).toBeHidden();
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

test("typing # in a post suggests hashtags, most used first", async ({ page }) => {
  await signIn(page, "/post/new");
  const text = page.getByLabel("What happened? (optional)");
  await text.pressSequentially("Same lorry on the #m6");
  const suggestions = page.getByRole("listbox", { name: "Hashtags" });
  await expect(suggestions.getByRole("option", { name: /#M62/ })).toBeVisible();
  await text.press("Enter");
  await expect(text).toHaveValue("Same lorry on the #M62 ");
  await expect(suggestions).toHaveCount(0);
});

test("the post's author hides a comment and turns comments off", async ({ page, request }) => {
  await request.post("http://localhost:4010/__next-user", { data: "dave" });
  await signIn(page, `/p/${SEED.photoPost}`);

  const larry = page.locator(".comment", { hasText: "Report it to the store too" });
  await larry.getByRole("button", { name: /More options for this comment/ }).click();
  await page.getByRole("menuitem", { name: "Hide comment" }).click();
  await expect(larry.getByText("You hid this. Nobody else can see it or its replies.")).toBeVisible();

  await page.getByRole("button", { name: "Edit or delete your post" }).click();
  await page.getByRole("menuitem", { name: "Turn off comments" }).click();
  await expect(page.getByText("Comments are off. The ones already there stay.")).toBeVisible();
  // The author can still comment.
  await expect(page.getByPlaceholder("Add a comment")).toBeVisible();

  // Everyone else sees a placeholder, and can't comment.
  await page.context().clearCookies();
  await request.post("http://localhost:4010/__next-user", { data: "roadhog" });
  await signIn(page, `/p/${SEED.photoPost}`);
  await expect(page.getByText("Hidden by the post's author")).toBeVisible();
  await expect(page.getByText("Report it to the store too")).toHaveCount(0);
  await expect(page.getByText("The author has turned comments off on this post.")).toBeVisible();
  await expect(page.getByPlaceholder("Add a comment")).toHaveCount(0);
});

test("comment, reply and react", async ({ page }) => {
  await signIn(page, `/p/${SEED.photoPost}`);

  // React from the picker (arrow up opens it from the keyboard), then see who reacted.
  const like = page.getByRole("button", { name: "Like", exact: true });
  await like.focus();
  await page.keyboard.press("ArrowUp");
  await page.getByRole("group", { name: "Choose a reaction" }).getByRole("button", { name: "Angry" }).click();
  await expect(page.getByRole("button", { name: "Angry: tap to remove your reaction" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "4 reactions. See who reacted" }).click();
  const who = page.getByRole("dialog", { name: "Reactions" });
  await expect(who.getByRole("link", { name: /Lane One Larry/ })).toBeVisible();
  await expect(who.getByRole("link", { name: /Road Hog/ })).toBeVisible();
  await who.getByRole("tab", { name: "Angry 3" }).click();
  await expect(who.getByRole("link", { name: /Lane One Larry/ })).toHaveCount(0);
  await expect(who.getByText("And 2 others.")).toBeVisible();
  await who.getByPlaceholder("Search by name").fill("road");
  await expect(who.getByRole("link", { name: /Road Hog/ })).toBeVisible();
  await who.getByRole("button", { name: "Close" }).click();

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

  // Your own comment's ⋯ menu edits it; it then shows as edited.
  const mine = page.locator(".comment", { hasText: "Same car was outside the school yesterday." });
  await mine.getByRole("button", { name: /More options for this comment/ }).click();
  await page.getByRole("menuitem", { name: "Edit comment" }).click();
  // While editing, the comment's text is in the box, so find the box and Save on the page.
  await page.getByLabel("Edit your comment").fill("Same car was outside the school on Monday.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const edited = page.locator(".comment", { hasText: "Same car was outside the school on Monday." });
  await expect(edited).toBeVisible();

  // "Edited" shows every version, newest first.
  await edited.getByRole("button", { name: "Edited: see earlier versions" }).click();
  const history = page.getByRole("dialog", { name: "Edit history" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByRole("listitem").first()).toContainText(
    "Same car was outside the school on Monday.",
  );
  await expect(history.getByRole("listitem").last()).toContainText(
    "Same car was outside the school yesterday.",
  );
  await history.getByRole("button", { name: "Close" }).last().click();
  await expect(history).toBeHidden();

  // Reply is in someone else's ⋯ menu too, with Report.
  await larry.getByRole("button", { name: /More options for this comment/ }).click();
  await expect(page.getByRole("menuitem", { name: "Report comment" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await expect(page.getByPlaceholder("Reply to @lane_one_larry")).toBeVisible();

  await larry.getByRole("button", { name: /^0 reactions/ }).click();
  await expect(larry.getByRole("button", { name: /^1 reactions/ })).toHaveAttribute("aria-pressed", "true");

  // Your replies show on your profile's Replies tab, with the post they're on.
  await page.goto("/u/roadhog?tab=replies");
  await expect(page.getByRole("link", { name: "Replies" })).toHaveAttribute("aria-current", "page");
  const replies = page.getByRole("region", { name: "Replies" });
  await expect(replies.getByText("Already done, they said they'd look into it.")).toBeVisible();
  await expect(replies.getByText("Replying to @lane_one_larry on")).toBeVisible();
  await page.goBack();

  // Everything was saved.
  await page.reload();
  await expect(page.getByRole("button", { name: "Angry: tap to remove your reaction" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Already done, they said they'd look into it.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "3 comments" })).toBeVisible();
});

test("members report a post from its ⋯ menu", async ({ page, request }) => {
  await signIn(page, `/p/${SEED.photoPost}`);
  await page.getByRole("button", { name: "More: report or copy link" }).click();
  await page.getByRole("menuitem", { name: "Report post" }).click();
  const dialog = page.getByRole("dialog", { name: "Report this post" });
  // "Not about driving" is the first choice: a few of those hold a post for a moderator straight away.
  await expect(dialog.getByRole("radio").first()).toHaveAccessibleName("Not about driving");
  await dialog.getByLabel("Not about driving").check();
  await dialog.getByLabel(/Anything else/).fill("It's an advert for a car wash, not bad driving.");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks. Our moderators will review it.")).toBeVisible();

  const state = await (await request.get("http://localhost:4010/__state")).json();
  expect(state.reports).toEqual([
    expect.objectContaining({ target: SEED.photoPost, reason: "NotADrivingIncident" }),
  ]);
});

test("the bell shows unread notifications until you open them", async ({ page }) => {
  await signIn(page, "/");
  const bell = page.getByRole("link", { name: "Notifications, 1 unread" }).first();
  await expect(bell).toBeVisible();
  await bell.click();

  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(
    page.getByText("Dashcam Dave tagged you as a passenger on \u201cUndertaking a lorry on the M62\u201d."),
  ).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Notifications", exact: true }).first()).toBeVisible();

  // Settings: email for comments too.
  await page.goto("/account/notifications");
  await page.getByLabel("Comments on your posts: by email").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Comments on your posts: by email")).toBeChecked();
});

test("Premium members choose a home area and switch on area alerts", async ({ page, request }) => {
  await request.post("http://localhost:4010/__next-user", { data: "dave" });
  await signIn(page, "/account/notifications");

  const section = page.getByRole("region", { name: "Area alerts" });
  await section.getByRole("combobox", { name: "Home area" }).fill("Rain");
  await section.getByRole("option", { name: /Rainhill/ }).click();
  await expect(section.getByText("Rainhill", { exact: true })).toBeVisible();

  await section.getByLabel("Tell me about new posts near Rainhill").check();
  await section.getByLabel("10 km").check();
  await section.getByLabel(/As they're posted/).check();
  await section.getByRole("button", { name: "Save area alerts" }).click();
  await expect(section.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("10 km")).toBeChecked();
});

test("Free members can set a home area but alerts are Premium", async ({ page }) => {
  await signIn(page, "/account/notifications");
  const section = page.getByRole("region", { name: "Area alerts" });
  await section.getByRole("combobox", { name: "Home area" }).fill("Kirk");
  await section.getByRole("option", { name: /Kirkstall/ }).click();
  await expect(section.getByText("Area alerts are part of Premium.")).toBeVisible();
});

test("vote on who's at fault, then save the post to bookmarks", async ({ page }) => {
  await signIn(page, `/p/${SEED.videoPost}`);
  const vote = page.getByRole("region", { name: "Who's at fault?" });
  await expect(vote).toBeVisible();
  await expect(vote.getByText("0 votes")).toBeVisible();

  await vote.getByRole("button", { name: "The undertaker" }).click();
  await expect(vote.getByText("Your vote")).toBeVisible();
  await expect(vote.getByText("100%")).toBeVisible();
  await expect(vote.getByText("1 vote")).toBeVisible();

  await page.getByRole("button", { name: "Save to bookmarks" }).click();
  await expect(page.getByRole("button", { name: "Remove from bookmarks" })).toBeVisible();

  await page.goto("/bookmarks");
  await expect(page.getByRole("heading", { name: "Bookmarks" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Undertaking a lorry on the M62" })).toBeVisible();
});

test("new members get three welcome steps after making a profile", async ({ page }) => {
  await signIn(page, "/welcome?step=3");
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Posting a clip" })).toBeVisible();
  await page.getByRole("link", { name: "Start browsing" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("authors can report their post to the police: the portal in England and Wales, 101 elsewhere", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__next-user`, { data: "dave" });
  await signIn(page, `/p/${SEED.photoPost}`);
  await page.getByRole("button", { name: "Report to the police" }).click();

  const police = page.getByRole("dialog", { name: "Report it to the police" });
  await expect(police.getByText("Asda, Kirkstall, Leeds")).toBeVisible();
  await expect(police.getByLabel("England or Wales")).toBeChecked();
  await expect(police.getByRole("link", { name: /National Dash Cam Safety Portal/ })).toHaveAttribute(
    "href",
    "https://nextbase.co.uk/national-dash-cam-safety-portal/",
  );
  await expect(police.getByText(/Send your original file/)).toBeVisible();

  // Scotland and Northern Ireland don't use the portal.
  await police.getByLabel("Scotland").check();
  await expect(police.getByRole("link", { name: "Call 101" })).toHaveAttribute("href", "tel:101");
  await expect(police.getByRole("link", { name: /National Dash Cam Safety Portal/ })).toBeHidden();
});

test("other people's posts don't offer to report them to the police", async ({ page }) => {
  await signIn(page, `/p/${SEED.photoPost}`);
  await expect(page.getByRole("heading", { name: "Parked across two disabled bays, again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report to the police" })).toBeHidden();
});

test("authors download their video for TikTok, Reels and Shorts, with a caption to paste", async ({
  page,
  request,
}) => {
  await request.post("http://localhost:4010/__next-user", { data: "dave" });
  await signIn(page, `/p/${SEED.videoPost}`);
  await page.getByRole("button", { name: "Edit or delete your post" }).click();
  await page.getByRole("menuitem", { name: "Download for TikTok, Reels and Shorts" }).click();

  const dialog = page.getByRole("dialog", { name: "Share on TikTok, Reels and Shorts" });
  await expect(dialog.getByText(/Making your video/)).toBeVisible();
  const download = dialog.getByRole("link", { name: "Download video" });
  await expect(download).toHaveAttribute("href", /\/share\/m-4\/vertical\.mp4$/);
  await expect(dialog.getByLabel("Caption to paste")).toHaveValue(
    new RegExp(`^Undertaking a lorry on the M62[\\s\\S]*/p/${SEED.videoPost}[\\s\\S]*#dashcam`),
  );
});

test("other people's videos can't be downloaded for sharing", async ({ page }) => {
  await signIn(page, `/p/${SEED.videoPost}`);
  await page.getByRole("button", { name: "More: report or copy link" }).click();
  await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /TikTok/ })).toHaveCount(0);
});

test("your vault keeps clips you add, which you can post or delete", async ({ page }) => {
  await signIn(page, "/u/roadhog?tab=vault");
  const vault = page.getByRole("region", { name: "Your vault" });
  await expect(vault.getByText(/Nothing here yet/)).toBeVisible();
  await expect(vault.getByText(/of 2 GB used · clips are kept for 30 days/)).toBeVisible();
  await expect(vault.getByText(/Only you can see your vault/)).toBeVisible();

  await vault
    .getByTestId("vault-input")
    .setInputFiles({ name: "dashcam-still.png", mimeType: "image/png", buffer: PNG });
  const clips = vault.getByRole("list", { name: "Clips in your vault" });
  await expect(clips.getByText("dashcam-still.png")).toBeVisible();
  await expect(clips.getByText(/Kept until/)).toBeVisible();

  // Posting it opens the composer with the clip already added.
  await clips.getByRole("link", { name: "Post dashcam-still.png" }).click();
  await expect(page).toHaveURL(/\/post\/new\?vault=[0-9a-f-]{36}$/);
  await expect(page.getByText("1 of 10")).toBeVisible();

  // Deleting asks first.
  await page.goto("/u/roadhog?tab=vault");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete dashcam-still.png" }).click();
  await expect(page.getByText(/Nothing here yet/)).toBeVisible();
});

test("other people's profiles have no vault", async ({ page }) => {
  await signIn(page, "/u/dashcam_dave");
  await expect(page.getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vault", exact: true })).toHaveCount(0);
});

test("a Premium author opens their post's analytics, as charts or a table", async ({ page, request }) => {
  await request.post("http://localhost:4010/__next-user", { data: "dave" });
  await signIn(page, `/p/${SEED.photoPost}`);
  await page.getByRole("button", { name: "Analytics" }).click();
  const dialog = page.getByRole("dialog", { name: "Post analytics" });
  await expect(dialog.getByText(/since it was posted\. Only you can see this\./)).toBeVisible();
  await expect(dialog.getByRole("img", { name: /^Views:/ })).toBeVisible();
  await expect(dialog.getByRole("img", { name: /^Reactions:/ })).toBeVisible();
  await expect(dialog.getByText("See Premium")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Show as a table" }).click();
  await expect(dialog.getByRole("columnheader", { name: "Shares" })).toBeVisible();
});

test("members keep their household cars and pick one when posting", async ({ page }) => {
  await signIn(page, "/account/cars");
  await expect(page.getByText("No cars yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add a car" }).click();
  const form = page.getByRole("form", { name: "Add a car" });
  await form.getByLabel("Make").selectOption("BMW");
  await form.getByLabel(/Model/).selectOption("3 Series");
  await expect(form.getByText("Shown on your posts as “Filmed from: BMW 3 Series”.")).toBeVisible();
  await form.getByLabel(/Nickname/).fill("The school-run BMW");
  await form.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByRole("list", { name: "Your cars" }).getByText("The school-run BMW")).toBeVisible();

  await page.goto("/post/new");
  await expect(page.getByLabel(/Filmed from/)).toBeVisible();
  await page.getByLabel(/Filmed from/).selectOption({ label: "The school-run BMW" });
});

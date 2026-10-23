import { describe, expect, it } from "vitest";

import { notificationHref } from "@/lib/notification-links";

const post = "8f2e1c3a-0000-4000-8000-000000000001";

describe("notificationHref", () => {
  it("opens community pages from the API's path", () => {
    expect(
      notificationHref({ type: "CommunityInvite", postId: null, path: "/communities/salford-road-watch" }),
    ).toBe("/communities/salford-road-watch");
  });

  it("opens the post when the path is the post or missing", () => {
    expect(notificationHref({ type: "CommentOnPost", postId: post, path: `/p/${post}` })).toBe(`/p/${post}`);
    expect(notificationHref({ type: "CommentOnPost", postId: post, path: "/notifications" })).toBe(
      `/p/${post}`,
    );
  });

  it("opens a new follower's profile", () => {
    expect(
      notificationHref({
        type: "NewFollower",
        postId: null,
        path: "/notifications",
        actor: { handle: "sam_j" },
      }),
    ).toBe("/@sam_j");
  });

  it("never follows a link to another site", () => {
    expect(notificationHref({ type: "CommunityInvite", postId: null, path: "//evil.example" })).toBeNull();
    expect(
      notificationHref({ type: "CommunityInvite", postId: null, path: "https://evil.example" }),
    ).toBeNull();
  });
});

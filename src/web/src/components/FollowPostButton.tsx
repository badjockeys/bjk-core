"use client";

import { useState, useTransition } from "react";

import { followPost } from "@/actions/engagement";
import { followBlocker } from "@/lib/blockers";

import { BellIcon } from "./icons";
import { toast } from "./toast";

/**
 * Follow a post to hear about new comments and the vote result. Authors follow their own posts, and commenting follows
 * a post, so this is mostly for unfollowing, or following a post you haven't commented on.
 */
export function FollowPostButton({
  postId,
  following: initial,
  signedIn,
}: {
  postId: string;
  following: boolean;
  signedIn: boolean;
}) {
  const [following, setFollowing] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (!signedIn) {
      followBlocker("signin");
      return;
    }
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const result = await followPost(postId, next);
      if (!result.ok) {
        setFollowing(!next);
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
        return;
      }
      toast(next ? "You'll hear about new comments and the vote result" : "You've stopped following this post");
    });
  };

  return (
    <button
      type="button"
      className={`btn btn-sm${following ? " btn-follow-on" : ""}`}
      aria-pressed={following}
      disabled={pending}
      onClick={toggle}
    >
      <BellIcon size={16} filled={following} />
      {following ? "Following post" : "Follow post"}
    </button>
  );
}

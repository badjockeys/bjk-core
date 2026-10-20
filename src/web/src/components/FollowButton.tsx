"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { followUser, unfollowUser } from "@/actions/follows";
import { followBlocker } from "@/lib/blockers";

import { toast } from "./toast";

/**
 * Follow or Following (X style: hovering Following offers Unfollow). Signed-out visitors are sent to sign in. Calls
 * `onChange` with the new state and follower count, and refreshes the page.
 */
export function FollowButton({
  handle,
  following: initial,
  signedIn,
  small = false,
}: {
  handle: string;
  following: boolean;
  signedIn: boolean;
  small?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!signedIn) {
      followBlocker("signin");
      return;
    }
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const result = next ? await followUser(handle) : await unfollowUser(handle);
      if (!result.ok) {
        setFollowing(!next);
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className={`btn ${following ? "btn-follow-on" : "btn-primary"}${small ? " btn-sm" : ""}`}
      aria-pressed={following}
      aria-label={following ? `Unfollow @${handle}` : `Follow @${handle}`}
      disabled={pending}
      onClick={toggle}
    >
      <span className="follow-label">{following ? "Following" : "Follow"}</span>
      {following ? <span className="follow-hover">Unfollow</span> : null}
    </button>
  );
}

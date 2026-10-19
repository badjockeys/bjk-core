"use client";

import { useState, useTransition } from "react";

import { reactToPost } from "@/actions/posts";
import { followBlocker } from "@/lib/blockers";
import type { ReactionType } from "@/lib/types";

import { ThumbIcon } from "./icons";
import { toast } from "./toast";

/**
 * The reactions count on a feed card. Tapping it likes the post (or takes your reaction back); the post page has the
 * full set of reactions.
 */
export function ReactionCount({
  postId,
  total,
  mine,
  signedIn,
}: {
  postId: string;
  total: number;
  mine: ReactionType | null;
  signedIn: boolean;
}) {
  const [state, setState] = useState({ total, mine });
  const [pending, startTransition] = useTransition();
  const on = state.mine !== null;

  const toggle = () => {
    if (!signedIn) {
      followBlocker("signin");
      return;
    }
    const previous = state;
    const next = on
      ? { total: state.total - 1, mine: null }
      : { total: state.total + 1, mine: "Like" as const };
    setState(next);
    startTransition(async () => {
      const result = await reactToPost(postId, next.mine);
      if (!result.ok) {
        setState(previous);
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
      }
    });
  };

  return (
    <button
      type="button"
      className={`tw-act${on ? " tw-act-on" : ""}`}
      aria-label={`${state.total} reactions${on ? ", including yours" : ""}. ${on ? "Remove your reaction" : "Like"}`}
      aria-pressed={on}
      disabled={pending}
      onClick={toggle}
    >
      <ThumbIcon on={on} />
      {state.total}
    </button>
  );
}

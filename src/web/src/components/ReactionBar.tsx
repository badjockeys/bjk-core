"use client";

import { useState, useTransition } from "react";

import { reactToPost } from "@/actions/posts";
import { followBlocker } from "@/lib/blockers";
import type { ReactionCounts, ReactionType } from "@/lib/types";

import { toast } from "./toast";

const TYPES: readonly ReactionType[] = ["Like", "Angry", "Shocked", "Laugh"];

/** The post page's reactions: one per person, tap again to take it back. */
export function ReactionBar({
  postId,
  counts,
  mine,
  signedIn,
}: {
  postId: string;
  counts: ReactionCounts;
  mine: ReactionType | null;
  signedIn: boolean;
}) {
  const [state, setState] = useState({ counts, mine });
  const [pending, startTransition] = useTransition();

  const choose = (type: ReactionType) => {
    if (!signedIn) {
      followBlocker("signin");
      return;
    }
    const previous = state;
    const nextMine = state.mine === type ? null : type;
    const nextCounts = { ...state.counts };
    if (state.mine) {
      nextCounts[state.mine] = Math.max(0, (nextCounts[state.mine] ?? 0) - 1);
    }
    if (nextMine) {
      nextCounts[nextMine] = (nextCounts[nextMine] ?? 0) + 1;
    }
    setState({ counts: nextCounts, mine: nextMine });
    startTransition(async () => {
      const result = await reactToPost(postId, nextMine);
      if (!result.ok) {
        setState(previous);
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
      }
    });
  };

  return (
    <div className="reacts" role="group" aria-label="React">
      {TYPES.map((type) => {
        const on = state.mine === type;
        return (
          <button
            key={type}
            type="button"
            className={`react${on ? " react-on" : ""}`}
            aria-pressed={on}
            disabled={pending}
            onClick={() => choose(type)}
          >
            {type} {state.counts[type] ?? 0}
          </button>
        );
      })}
    </div>
  );
}

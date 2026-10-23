"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { reactToPost } from "@/actions/posts";
import { followBlocker } from "@/lib/blockers";
import { plural } from "@/lib/format";
import { applyReaction, REACTIONS, reactionOf, reactionTotal, topReactions } from "@/lib/reactions";
import type { ReactionCounts, ReactionType } from "@/lib/types";

import { CommentIcon, ThumbIcon } from "./icons";
import { ReactionsDialog } from "./ReactionsDialog";
import { SaveButton } from "./SaveButton";
import { ShareButton } from "./ShareButton";
import { toast } from "./toast";

/** How long a press (or a hover on desktop) takes to open the reaction picker. */
const HOLD_MS = 450;

/**
 * Under a post, like Facebook (owner, 22 Oct 2026): a summary line (the reactions used, as emoji bubbles with the
 * total, which opens who reacted; then the comment and share counts), then a row of Like, Comment and Share. Tap Like
 * to like (or take your reaction back); press and hold, or hover on desktop, to choose another reaction.
 */
export function PostFooter({
  postId,
  title,
  href,
  counts,
  mine,
  commentCount,
  shareCount,
  saved,
  signedIn,
  commentHref,
}: {
  postId: string;
  title: string;
  href: string;
  counts: ReactionCounts;
  mine: ReactionType | null;
  commentCount: number;
  shareCount: number;
  saved: boolean;
  signedIn: boolean;
  /** Where Comment goes: the post's comments (default) or the comment box on the post page. */
  commentHref?: string;
}) {
  const [state, setState] = useState({ counts, mine });
  const [shares, setShares] = useState(shareCount);
  const [picker, setPicker] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const [pending, startTransition] = useTransition();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  // Shares count once per viewer per day, so only the first share here adds one.
  const shared = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);

  const total = reactionTotal(state.counts);
  const bubbles = topReactions(state.counts);

  useEffect(() => {
    if (!picker) return;
    const close = (e: Event) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setPicker(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [picker]);

  const choose = (type: ReactionType | null) => {
    setPicker(false);
    if (!signedIn) {
      followBlocker("signin");
      return;
    }
    const previous = state;
    setState({ counts: applyReaction(state.counts, state.mine, type), mine: type });
    startTransition(async () => {
      const result = await reactToPost(postId, type);
      if (!result.ok) {
        setState(previous);
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
      }
    });
  };

  const startHold = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setPicker(true);
    }, HOLD_MS);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const mineInfo = state.mine ? reactionOf(state.mine) : null;

  return (
    <div className="pf">
      {total > 0 || commentCount > 0 || shares > 0 ? (
        <div className="pf-summary">
          {total > 0 ? (
            <button
              type="button"
              className="pf-who"
              aria-label={`${plural(total, "reaction")}. See who reacted`}
              onClick={() => (signedIn ? setShowWho(true) : followBlocker("signin"))}
            >
              <span className="pf-bubbles" aria-hidden="true">
                {bubbles.map((type) => (
                  <span key={type} className={`pf-bubble pf-bubble-${type.toLowerCase()}`}>
                    {reactionOf(type).emoji}
                  </span>
                ))}
              </span>
              <span>{total}</span>
            </button>
          ) : (
            <span />
          )}
          <span className="pf-counts">
            {commentCount > 0 ? (
              <Link href={commentHref ?? `${href}#comments`} className="pf-count">
                {plural(commentCount, "comment")}
              </Link>
            ) : null}
            {shares > 0 ? <span className="pf-count">{plural(shares, "share")}</span> : null}
          </span>
        </div>
      ) : null}

      <div className="pf-actions">
        <div
          ref={wrap}
          className="pf-react"
          onPointerEnter={(e) => (e.pointerType === "mouse" ? startHold() : undefined)}
          onPointerLeave={(e) => {
            endHold();
            if (e.pointerType === "mouse") setPicker(false);
          }}
        >
          {picker ? (
            <div className="pf-picker" role="group" aria-label="Choose a reaction">
              {REACTIONS.map((r) => (
                <button
                  key={r.type}
                  type="button"
                  className={`pf-pick${state.mine === r.type ? " pf-pick-on" : ""}`}
                  aria-label={r.label}
                  aria-pressed={state.mine === r.type}
                  title={r.label}
                  onClick={() => choose(state.mine === r.type ? null : r.type)}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className={`pf-btn${mineInfo ? ` pf-btn-on pf-on-${mineInfo.type.toLowerCase()}` : ""}`}
            aria-pressed={Boolean(mineInfo)}
            aria-haspopup="true"
            aria-expanded={picker}
            aria-label={mineInfo ? `${mineInfo.label}: tap to remove your reaction` : "Like"}
            title="Press and hold for more reactions"
            disabled={pending}
            onPointerDown={(e) => (e.pointerType !== "mouse" ? startHold() : undefined)}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setPicker(true);
              }
            }}
            onClick={() => {
              if (held.current) {
                held.current = false;
                return;
              }
              choose(state.mine ? null : "Like");
            }}
          >
            {mineInfo && mineInfo.type !== "Like" ? (
              <span aria-hidden="true">{mineInfo.emoji}</span>
            ) : (
              <ThumbIcon on={Boolean(mineInfo)} />
            )}
            <span>{mineInfo?.label ?? "Like"}</span>
          </button>
        </div>
        <Link href={commentHref ?? `${href}#comments`} className="pf-btn">
          <CommentIcon />
          <span>Comment</span>
        </Link>
        <ShareButton
          path={href}
          title={title}
          postId={postId}
          className="pf-btn"
          label="Share"
          onShared={() => {
            if (!shared.current) {
              shared.current = true;
              setShares((n) => n + 1);
            }
          }}
        />
        <SaveButton postId={postId} saved={saved} signedIn={signedIn} />
      </div>

      {showWho ? (
        <ReactionsDialog postId={postId} counts={state.counts} onClose={() => setShowWho(false)} />
      ) : null}
    </div>
  );
}

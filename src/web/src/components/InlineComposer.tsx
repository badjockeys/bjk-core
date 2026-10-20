"use client";

import Link from "next/link";
import { useState } from "react";

import { postPath } from "@/lib/paths";

import { Avatar } from "./Avatar";
import { PhotoIcon } from "./icons";
import { PostComposer, type ComposerData } from "./PostComposer";

/**
 * Desktop: the composer at the top of the feed, like X (UI overhaul, 20 Oct 2026). "Seen some bad driving?" until
 * it's clicked, then the full composer in place. Closing it, keeping it as a draft or posting folds it away again;
 * a new composer starts empty each time.
 */
export function InlineComposer(props: ComposerData) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [posted, setPosted] = useState<{ id: string; kind: "Image" | "Video" } | null>(null);

  const fold = () => {
    setOpen(false);
    setRound((n) => n + 1);
  };

  return (
    <div className="d-only">
      {posted ? (
        <p className="notice composer-posted" role="status">
          <span>
            Posted. Thanks for sharing.{" "}
            {posted.kind === "Video"
              ? "Your video shows in the feed once it's processed."
              : "Your photos show in the feed once they're processed."}
          </span>
          <Link href={postPath(posted.id)}>View post</Link>
        </p>
      ) : null}
      {open ? (
        <PostComposer
          key={round}
          mode="inline"
          {...props}
          onClose={fold}
          onPosted={(post) => {
            setPosted(post);
            fold();
          }}
        />
      ) : (
        <button
          type="button"
          className="feed-composer"
          onClick={() => {
            setPosted(null);
            setOpen(true);
          }}
        >
          <Avatar name={props.author.name} url={props.author.avatarUrl} />
          <span className="composer-in">
            <span className="composer-ph">Seen some bad driving?</span>
            <span className="composer-bar">
              <span className="row" style={{ gap: 6 }}>
                <PhotoIcon size={20} color="#111111" strokeWidth={1.8} />
                <span className="small muted">Photos or a video</span>
              </span>
              <span className="btn btn-primary btn-sm" aria-hidden="true">
                Post
              </span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

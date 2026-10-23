"use client";

import Link from "next/link";
import { useState } from "react";

import { postPath } from "@/lib/paths";

import { VideoIcon } from "./icons";
import { PostComposer, type ComposerData } from "./PostComposer";

/**
 * The card at the top of the feed (owner sign-off, 23 Oct 2026, option 2): one honest control, not a pretend text box.
 * "+ Post" opens the composer (`onOpen`) or, for members who need a profile first, links to /post/new.
 */
function Card({ onOpen }: { onOpen?: () => void }) {
  return (
    <section className="feed-composer d-only" aria-labelledby="fc-title">
      <span className="fc-tile" aria-hidden="true">
        <VideoIcon size={22} color="#00607F" />
      </span>
      <span className="fc-text">
        <strong id="fc-title">Caught some bad driving?</strong>
        <span className="small muted">Faces and number plates are blurred for you.</span>
      </span>
      {onOpen ? (
        <button type="button" className="btn btn-primary fc-post" onClick={onOpen}>
          + Post
        </button>
      ) : (
        <Link href="/post/new" className="btn btn-primary fc-post">
          + Post
        </Link>
      )}
    </section>
  );
}

/** Members without a profile yet: the same card, linking to /post/new, which asks them to make one first. */
export function ComposerLinkBar() {
  return <Card />;
}

/**
 * Desktop: the "Caught some bad driving?" card at the top of the feed. "+ Post" pops out the composer in a "Create
 * post" dialog. Closing it, keeping it as a draft or posting closes the dialog; a new one starts empty each time.
 * Phones use the floating + button instead.
 */
export function ComposerBar(props: ComposerData) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [posted, setPosted] = useState<{ id: string; kind: "Image" | "Video" } | null>(null);

  const close = () => {
    setOpen(false);
    setRound((n) => n + 1);
  };

  return (
    <>
      {posted ? (
        <p className="notice composer-posted d-only" role="status">
          <span>
            Posted. Thanks for sharing.{" "}
            {posted.kind === "Video"
              ? "Your video shows in the feed once it's processed."
              : "Your photos show in the feed once they're processed."}
          </span>
          <Link href={postPath(posted.id)}>View post</Link>
        </p>
      ) : null}
      <Card
        onOpen={() => {
          setPosted(null);
          setOpen(true);
        }}
      />
      {open ? (
        <PostComposer
          key={round}
          mode="dialog"
          {...props}
          onClose={close}
          onPosted={(post) => {
            setPosted(post);
            close();
          }}
        />
      ) : null}
    </>
  );
}

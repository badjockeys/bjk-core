"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { composerPrompt } from "@/lib/composer";
import { postPath } from "@/lib/paths";

import { Avatar } from "./Avatar";
import { PhotoIcon, PinIcon, TagIcon } from "./icons";
import { PostComposer, type ComposerData, type ComposerStart } from "./PostComposer";

const ACTIONS: { start: ComposerStart; label: string; icon: ReactNode }[] = [
  { start: "photos", label: "Photo or video", icon: <PhotoIcon size={20} color="#00B5E5" strokeWidth={2} /> },
  { start: "types", label: "Type", icon: <TagIcon size={20} /> },
  { start: "where", label: "Location", icon: <PinIcon size={20} color="#111111" /> },
];

/** The bar itself, as buttons (`onOpen`) or, for members who need a profile first, as links to /post/new. */
function Bar({
  name,
  avatarUrl,
  onOpen,
}: {
  name: string;
  avatarUrl: string | null;
  onOpen?: (start: ComposerStart) => void;
}) {
  const prompt = composerPrompt(name);
  return (
    <div className="feed-composer d-only">
      <div className="fc-top">
        <Avatar name={name} url={avatarUrl} />
        {onOpen ? (
          <button type="button" className="fc-pill" onClick={() => onOpen("compose")}>
            {prompt}
          </button>
        ) : (
          <Link href="/post/new" className="fc-pill">
            {prompt}
          </Link>
        )}
      </div>
      <div className="fc-actions">
        {ACTIONS.map((action) =>
          onOpen ? (
            <button key={action.start} type="button" className="fc-act" onClick={() => onOpen(action.start)}>
              {action.icon}
              {action.label}
            </button>
          ) : (
            <Link key={action.start} href="/post/new" className="fc-act">
              {action.icon}
              {action.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

/** Members without a profile yet: the same bar, linking to /post/new, which asks them to make one first. */
export function ComposerLinkBar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return <Bar name={name} avatarUrl={avatarUrl} />;
}

/**
 * Desktop: "Seen some bad driving, Aaron?" at the top of the feed, like Facebook (owner feedback, 22 Oct 2026). It
 * looks like a text box, so clicking it pops out the whole composer in a "Create post" dialog; Photo or video, Type
 * and Location open the dialog on that step. Closing it, keeping it as a draft or posting closes the dialog; a new
 * one starts empty each time.
 */
export function ComposerBar(props: ComposerData) {
  const [start, setStart] = useState<ComposerStart | null>(null);
  const [round, setRound] = useState(0);
  const [posted, setPosted] = useState<{ id: string; kind: "Image" | "Video" } | null>(null);

  const close = () => {
    setStart(null);
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
      <Bar
        name={props.author.name}
        avatarUrl={props.author.avatarUrl}
        onOpen={(next) => {
          setPosted(null);
          setStart(next);
        }}
      />
      {start ? (
        <PostComposer
          key={round}
          mode="dialog"
          start={start}
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

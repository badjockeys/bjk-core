import Link from "next/link";

import { inlineComposerProps } from "@/app/post/new/composer-props";
import type { Viewer } from "@/lib/viewer";

import { Avatar } from "./Avatar";
import { InlineComposer } from "./InlineComposer";
import { LogoMark, PhotoIcon } from "./icons";
import { NotificationBell } from "./NotificationBell";

/** The top of the feed: avatar, logo (phones) or "Home" (desktop). */
export function FeedHeader({ viewer, title = "Home" }: { viewer: Viewer; title?: string }) {
  return (
    <>
      <header className="m-head m-only">
        {viewer.signedIn ? (
          <Link href="/account" aria-label="Your account">
            <Avatar name={viewer.displayName ?? viewer.email} url={viewer.avatarUrl} size="sm" />
          </Link>
        ) : (
          <span />
        )}
        <Link href="/" className="logo" aria-label="Bad Jockeys home">
          <LogoMark size={28} />
        </Link>
        {viewer.signedIn ? <NotificationBell /> : <span />}
      </header>
      <header className="c-head d-only">
        <h1>{title}</h1>
      </header>
    </>
  );
}

/**
 * Desktop: "Seen some bad driving?" at the top of the feed, which opens the composer in place. Members without a
 * profile yet get a link to /post/new, which asks them to make one first.
 */
export function Composer({ viewer }: { viewer: Viewer }) {
  const data = inlineComposerProps(viewer);
  if (data) {
    return <InlineComposer {...data} />;
  }
  return (
    <Link href="/post/new" className="feed-composer d-only">
      <Avatar name={viewer.displayName ?? viewer.email} url={viewer.avatarUrl} />
      <span className="composer-in">
        <span className="composer-ph">Seen some bad driving?</span>
        <span className="composer-bar">
          <span className="row" style={{ gap: 6 }}>
            <PhotoIcon size={20} color="#111111" strokeWidth={1.8} />
            <span className="small muted">Photos or a video</span>
          </span>
          <span className="btn btn-primary btn-sm">Post</span>
        </span>
      </span>
    </Link>
  );
}

import Link from "next/link";

import { inlineComposerProps } from "@/app/post/new/composer-props";
import type { Viewer } from "@/lib/viewer";

import { Avatar } from "./Avatar";
import { ComposerBar, ComposerLinkBar } from "./ComposerBar";
import { LogoMark } from "./icons";
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
 * Desktop: "Seen some bad driving, Aaron?" at the top of the feed, which pops out the composer in a dialog. Members
 * without a profile yet get the same bar linking to /post/new, which asks them to make one first.
 */
export function Composer({ viewer }: { viewer: Viewer }) {
  const data = inlineComposerProps(viewer);
  if (data) {
    return <ComposerBar {...data} />;
  }
  return <ComposerLinkBar name={viewer.displayName ?? viewer.email ?? "You"} avatarUrl={viewer.avatarUrl} />;
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { loadNotifications } from "@/actions/notifications";
import { timeAgo } from "@/lib/format";
import { postPath, profilePath } from "@/lib/paths";
import type { NotificationDto, PagedResult } from "@/lib/types";

import { Avatar } from "./Avatar";
import { BellIcon } from "./icons";

/** The notifications, newest first; unread ones are tinted until the page has been opened. */
export function NotificationList({ first }: { first: PagedResult<NotificationDto> }) {
  const [items, setItems] = useState(first.items);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(first.totalCount);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const more = () =>
    startLoading(async () => {
      const next = await loadNotifications(page + 1);
      if (!next.ok) {
        setError(next.error);
        return;
      }
      setItems((current) => [...current, ...next.data.items]);
      setPage(page + 1);
      setTotal(next.data.totalCount);
    });

  if (items.length === 0) {
    return (
      <div className="notif-empty">
        <BellIcon size={40} />
        <h2 className="h2">Nothing yet</h2>
        <p className="muted">
          When someone comments, reacts or tags you as a passenger, you&apos;ll see it here.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="notif-list">
        {items.map((n) => (
          <li key={n.id} className={n.isRead ? "notif" : "notif notif-new"}>
            <Item notification={n} />
          </li>
        ))}
      </ul>
      {error ? (
        <p className="error pad" role="alert">
          {error}
        </p>
      ) : null}
      {items.length < total ? (
        <div className="pad">
          <button type="button" className="btn btn-block" disabled={loading} onClick={more}>
            {loading ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </>
  );
}

function Item({ notification: n }: { notification: NotificationDto }) {
  const body = (
    <>
      <Avatar name={n.actor?.displayName ?? "Bad Jockeys"} url={n.actor?.avatarUrl ?? null} />
      <span className="notif-body">
        <span>{n.text}</span>
        <time className="small muted" dateTime={n.at} suppressHydrationWarning>
          {timeAgo(n.at)}
        </time>
      </span>
      {!n.isRead ? <span className="notif-dot" aria-label="New" /> : null}
    </>
  );
  // A new follower opens their profile; everything else opens the post.
  const href = n.postId
    ? postPath(n.postId)
    : n.type === "NewFollower" && n.actor?.handle
      ? profilePath(n.actor.handle)
      : null;
  return href ? (
    <Link href={href} className="notif-link">
      {body}
    </Link>
  ) : (
    <div className="notif-link">{body}</div>
  );
}

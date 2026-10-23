"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { loadPosts, type FeedSource } from "@/actions/posts";
import { countNewPosts, NEW_POSTS_POLL_MS, PULL_TO_REFRESH_PX, pullDistance } from "@/lib/new-posts";
import { plural } from "@/lib/format";

/**
 * New posts without reloading the browser (owner feedback, 22 Oct 2026, item 6). While the tab is open the feed
 * checks the first page every 30 seconds and, when there's something new, shows an "N new posts" pill at the top
 * rather than moving the feed under the reader; tapping it scrolls to the top and loads them. On phones, pulling
 * down from the top of the page does the same. Older posts keep loading at the bottom (FeedList).
 *
 * Rendered on the first page of live feeds only; keyed by the posts shown, so it starts afresh after a refresh.
 */
export function NewPosts({
  source,
  shownIds,
  newestAt,
}: {
  source: FeedSource;
  /** The posts on the server-rendered first page. */
  shownIds: string[];
  /** When the newest of them was posted, or null if there are none. */
  newestAt: string | null;
}) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [pull, setPull] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const known = useRef(new Set(shownIds));
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current || document.visibilityState !== "visible") {
      return;
    }
    checking.current = true;
    const result = await loadPosts(source, 1);
    checking.current = false;
    if (result.ok) {
      setCount(countNewPosts(result.data.items, known.current, newestAt));
    }
  }, [source, newestAt]);

  const refresh = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    startRefresh(() => router.refresh());
  }, [router]);

  // Every 30 seconds while the tab is visible, and straight away when the reader comes back to it.
  useEffect(() => {
    const timer = window.setInterval(() => void check(), NEW_POSTS_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  // Phones: pull down from the very top to refresh. The browser's own pull-to-refresh (a full reload) is turned off
  // while the feed is showing, so the two don't both happen.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) {
      return;
    }
    const root = document.documentElement;
    const before = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    let startY: number | null = null;
    let distance = 0;
    const onStart = (event: TouchEvent) => {
      startY = window.scrollY <= 0 && event.touches.length === 1 ? event.touches[0]!.clientY : null;
      distance = 0;
    };
    const onMove = (event: TouchEvent) => {
      if (startY === null) {
        return;
      }
      distance = pullDistance(event.touches[0]!.clientY - startY);
      setPull(distance);
    };
    const onEnd = () => {
      if (startY !== null && distance >= PULL_TO_REFRESH_PX) {
        refresh();
      }
      startY = null;
      distance = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      root.style.overscrollBehaviorY = before;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh]);

  const ready = pull >= PULL_TO_REFRESH_PX;
  return (
    <>
      {pull > 0 || refreshing ? (
        <div
          className="ptr"
          style={{ height: refreshing ? PULL_TO_REFRESH_PX : pull }}
          role="status"
          aria-live="polite"
        >
          <span className={`ptr-spin${refreshing ? " ptr-going" : ""}`} aria-hidden="true">
            ↓
          </span>
          <span className="small muted">
            {refreshing ? "Loading new posts…" : ready ? "Let go to refresh" : "Pull to refresh"}
          </span>
        </div>
      ) : null}
      {count > 0 && !refreshing ? (
        <div className="new-posts">
          <button type="button" className="new-posts-pill" onClick={refresh}>
            ↑ {plural(count, "new post")}
          </button>
        </div>
      ) : null}
    </>
  );
}

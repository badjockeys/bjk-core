"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { getPost, loadPosts, type FeedSource } from "@/actions/posts";
import { earliestExpiry, refreshDelay } from "@/lib/links";
import type { PostDto } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";

import { PostCard } from "./PostCard";

/**
 * Infinite scrolling. The first page is rendered on the server (passed as children, so it's in the HTML for search
 * engines and link previews); later pages load as the reader nears the end. The API pages by number, not by cursor,
 * so posts that shift between pages while someone scrolls are de-duplicated here. Without JavaScript, "Show older
 * posts" is a plain link to the next page.
 */
export function FeedList({
  source,
  viewer,
  firstPageIds,
  startPage = 1,
  hasMore,
  nextHref,
  children,
}: {
  source: FeedSource;
  viewer: Viewer;
  firstPageIds: string[];
  /** The page number the server rendered. */
  startPage?: number;
  hasMore: boolean;
  /** The next page's address, for browsers without JavaScript. */
  nextHref: string;
  children: ReactNode;
}) {
  const [posts, setPosts] = useState<PostDto[]>([]);
  const [page, setPage] = useState(startPage);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(new Set(firstPageIds));
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setLoading(true);
    setError(null);
    const result = await loadPosts(source, page + 1);
    busy.current = false;
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const fresh = result.data.items.filter((p) => !seen.current.has(p.id));
    fresh.forEach((p) => seen.current.add(p.id));
    setPosts((current) => [...current, ...fresh]);
    setPage(result.data.page);
    setMore(result.data.page * result.data.pageSize < result.data.totalCount && result.data.items.length > 0);
  }, [page, source]);

  // Signed links to sensitive media (age-verified members) expire after about 10 minutes: fetch those posts again
  // just before. The server-rendered first page is refreshed by LinkExpiryRefresh.
  const expiresAt = earliestExpiry(posts);
  const latest = useRef(posts);
  useEffect(() => {
    latest.current = posts;
  }, [posts]);
  useEffect(() => {
    const delay = refreshDelay(expiresAt);
    if (delay === null) {
      return;
    }
    const timer = setTimeout(
      async () => {
        const signed = latest.current.filter((p) => p.media.some((m) => m.linksExpireAt));
        const fresh = await Promise.all(signed.map((p) => getPost(p.id)));
        const byId = new Map<string, PostDto>();
        for (const result of fresh) {
          if (result.ok) {
            byId.set(result.data.id, result.data);
          }
        }
        setPosts((current) => current.map((p) => byId.get(p.id) ?? p));
      },
      Math.max(delay, 1_000),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !more || error) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, more, error]);

  return (
    <>
      {children}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} viewer={viewer} />
      ))}
      <div ref={sentinel} className="centre" style={{ padding: "20px 16px 32px" }} aria-live="polite">
        {loading ? <span className="muted small">Loading more posts…</span> : null}
        {error ? (
          <>
            <span className="error">{error}</span>
            <button type="button" className="btn btn-sm" onClick={() => void loadMore()}>
              Try again
            </button>
          </>
        ) : null}
        {more && !loading && !error ? (
          <a
            href={nextHref}
            className="link"
            onClick={(e) => {
              e.preventDefault();
              void loadMore();
            }}
          >
            Show older posts
          </a>
        ) : null}
        {!more && (posts.length > 0 || firstPageIds.length > 0) ? (
          <span className="muted small">You&apos;re all caught up.</span>
        ) : null}
      </div>
    </>
  );
}

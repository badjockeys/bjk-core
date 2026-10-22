import Link from "next/link";

import type { FeedSource } from "@/actions/posts";
import { earliestExpiry } from "@/lib/links";
import { isLiveFeed, newestOf } from "@/lib/new-posts";
import { signInPath } from "@/lib/paths";
import type { PagedResult, PostDto } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";

import { FeedList } from "./FeedList";
import { LogoMark } from "./icons";
import { LinkExpiryRefresh } from "./LinkExpiryRefresh";
import { NewPosts } from "./NewPosts";
import { PostCard } from "./PostCard";

/**
 * A server-rendered first page of posts, continued by FeedList in the browser. On the first page of a live feed,
 * NewPosts offers anything posted since. Both are keyed by the posts shown, so a refresh that brings new posts starts
 * them afresh (the reader is back at the top by then).
 */
export function Feed({
  page,
  source,
  viewer,
  basePath,
  empty,
}: {
  page: PagedResult<PostDto>;
  source: FeedSource;
  viewer: Viewer;
  /** The page's own address, for the no-JavaScript "next page" link. */
  basePath: string;
  empty: React.ReactNode;
}) {
  const ids = page.items.map((p) => p.id);
  const shownKey = ids.join(",");
  const watcher =
    page.page === 1 && isLiveFeed(source) ? (
      <NewPosts key={shownKey} source={source} shownIds={ids} newestAt={newestOf(page.items)} />
    ) : null;
  if (page.items.length === 0 && page.page === 1) {
    return (
      <>
        {watcher}
        {empty}
      </>
    );
  }
  const hasMore = page.page * page.pageSize < page.totalCount;
  const separator = basePath.includes("?") ? "&" : "?";
  return (
    <>
      {watcher}
      <FeedList
        key={shownKey}
        source={source}
        viewer={viewer}
        firstPageIds={ids}
        startPage={page.page}
        hasMore={hasMore}
        nextHref={`${basePath}${separator}page=${page.page + 1}`}
      >
        <LinkExpiryRefresh expiresAt={earliestExpiry(page.items)} />
        {page.items.map((post) => (
          <PostCard key={post.id} post={post} viewer={viewer} />
        ))}
      </FeedList>
    </>
  );
}

/** Screen 03: nothing in this category yet. */
export function EmptyCategory({ label, signedIn }: { label: string | null; signedIn: boolean }) {
  return (
    <section className="centre" style={{ padding: "96px 32px" }}>
      <LogoMark size={64} ring="#B5B5B0" dot={false} />
      <h1 className="h2">{label ? `No ${label.toLowerCase()} posts yet` : "No posts yet"}</h1>
      <p className="muted">Caught some on camera? Be the first to post it.</p>
      {signedIn ? (
        <Link href="/post/new" className="btn btn-primary">
          Post photos or a video
        </Link>
      ) : (
        // A plain link: signing in leaves for the identity server, which an in-app (RSC) navigation can't follow.
        <a href={signInPath("/post/new")} className="btn btn-primary">
          Post photos or a video
        </a>
      )}
      {label ? (
        <Link href="/" className="link">
          See all posts
        </Link>
      ) : null}
    </section>
  );
}

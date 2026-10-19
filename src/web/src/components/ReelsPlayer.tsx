"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { getPost } from "@/actions/posts";
import { loadMoreReels, recordReelPlay } from "@/actions/reels";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { duration, timeAgo } from "@/lib/format";
import { earliestExpiry, refreshDelay } from "@/lib/links";
import { joinPath, postPath, profilePath, signInPath } from "@/lib/paths";
import type { IncidentCategory, PostDto, ReelsPage } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";

import { Avatar } from "./Avatar";
import { BackIcon, ChevronIcon, CommentIcon } from "./icons";
import { PostMoreMenu } from "./PostMoreMenu";
import { isBlurred } from "./PostMedia";
import { totalReactions } from "./PostCard";
import { ReactionCount } from "./ReactionCount";
import { SensitiveCover } from "./SensitiveCover";
import { ShareButton } from "./ShareButton";
import { toast } from "./toast";

/** A reel counts as played once this much has been watched (or the whole clip, if it's shorter). */
export const PLAY_AFTER_SECONDS = 3;

/** "18 of 25 free today", or null for unlimited plans. */
export function allowanceLabel(remaining: number | null, limit: number | null): string | null {
  return remaining === null || limit === null ? null : `${remaining} of ${limit} free today`;
}

interface Allowance {
  remaining: number | null;
  limit: number | null;
}

/**
 * Screens 27 and 29: reels, one video post per full-screen slide. Swipe or scroll (the slides snap), or use the arrow
 * keys and the desktop's up/down buttons. The reel in view plays (muted: audio is removed from every video) and loops;
 * after 3 seconds it's reported as played, which counts towards the day's free reels (10 logged out, 25 on Free,
 * unlimited on Premium). When they're used up the last slide is the daily-limit sheet. More reels load as the viewer
 * nears the end. Signed links to sensitive media (age-verified members) are refreshed before they expire.
 */
export function ReelsPlayer({
  initial,
  limitReached: initiallyLimited,
  failed,
  viewer,
  category,
}: {
  initial: ReelsPage | null;
  limitReached: { limit: number | null } | null;
  failed: boolean;
  viewer: Viewer;
  category: IncidentCategory | null;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<PostDto[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [allowance, setAllowance] = useState<Allowance>({
    remaining: initiallyLimited ? 0 : (initial?.playsRemainingToday ?? null),
    limit: initiallyLimited ? initiallyLimited.limit : (initial?.dailyPlayLimit ?? null),
  });
  const [limited, setLimited] = useState(initiallyLimited !== null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const counted = useRef(new Set<string>());
  const loading = useRef(false);
  const latest = useRef({ cursor, count: posts.length, limited });
  const latestPosts = useRef(posts);
  const jumpToLimit = useRef(false);

  useEffect(() => {
    latest.current = { cursor, count: posts.length, limited };
    latestPosts.current = posts;
  }, [cursor, posts, limited]);

  const slideCount = posts.length + (limited || (!cursor && posts.length > 0) ? 1 : 0);

  const goTo = useCallback((index: number) => {
    const slides = list.current?.querySelectorAll<HTMLElement>("[data-slide]");
    const target = slides?.[Math.max(0, Math.min(index, slides.length - 1))];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const loadMore = useCallback(async () => {
    const { cursor: next, limited: done } = latest.current;
    if (loading.current || !next || done) {
      return;
    }
    loading.current = true;
    const result = await loadMoreReels(next, category);
    loading.current = false;
    if (result === null) {
      toast("We couldn't load more reels. Please try again.");
      return;
    }
    if (!result.ok) {
      setLimited(true);
      setCursor(null);
      return;
    }
    setPosts((current) => {
      const seen = new Set(current.map((p) => p.id));
      return [...current, ...result.page.items.filter((p) => !seen.has(p.id))];
    });
    setCursor(result.page.nextCursor);
    setAllowance({ remaining: result.page.playsRemainingToday, limit: result.page.dailyPlayLimit });
  }, [category]);

  // Which slide is in view: it plays, and near the end the next page loads.
  useEffect(() => {
    const root = list.current;
    if (!root) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.slide);
            setActive(index);
            if (index >= latest.current.count - 3) {
              void loadMore();
            }
          }
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-slide]").forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [slideCount, loadMore]);

  // Arrow keys (and Page Up / Page Down) move between reels.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, dialog, [role=menu]")) {
        return;
      }
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        goTo(active + 1);
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        goTo(active - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo]);

  // Signed links to sensitive media stop working after about 10 minutes: fetch those reels again just before.
  const expiresAt = earliestExpiry(posts);
  useEffect(() => {
    const delay = refreshDelay(expiresAt);
    if (delay === null) {
      return;
    }
    const timer = setTimeout(
      async () => {
        const signed = latestPosts.current.filter((p) => p.media.some((m) => m.linksExpireAt));
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

  // When a play finds the limit already reached (e.g. reels watched in another tab), show the limit sheet.
  useEffect(() => {
    if (limited && jumpToLimit.current) {
      jumpToLimit.current = false;
      goTo(Number.MAX_SAFE_INTEGER);
    }
  }, [limited, goTo]);

  const onWatched = useCallback(async (postId: string) => {
    if (counted.current.has(postId)) {
      return;
    }
    counted.current.add(postId);
    const outcome = await recordReelPlay(postId);
    if (outcome.ok) {
      const { playsRemainingToday, dailyPlayLimit } = outcome.result;
      setAllowance({ remaining: playsRemainingToday, limit: dailyPlayLimit });
      if (playsRemainingToday === 0) {
        // Whatever's loaded beyond this was never part of today's allowance: the next slide is the limit sheet.
        setPosts((current) => current.slice(0, current.findIndex((p) => p.id === postId) + 1));
        setCursor(null);
        setLimited(true);
      }
    } else if (outcome.limitReached) {
      setAllowance((a) => ({ ...a, remaining: 0 }));
      setPosts((current) =>
        current.slice(
          0,
          Math.max(
            0,
            current.findIndex((p) => p.id === postId),
          ),
        ),
      );
      setCursor(null);
      jumpToLimit.current = true;
      setLimited(true);
    } else {
      counted.current.delete(postId);
    }
  }, []);

  const label = allowanceLabel(allowance.remaining, allowance.limit);
  const selectCategory = (value: string) => {
    const slug = CATEGORIES.find((c) => c.value === value)?.slug;
    router.replace(slug ? `/reels?category=${slug}` : "/reels");
  };

  return (
    <div className="reels-wrap">
      <div className="reels-bar">
        <span className="row" style={{ gap: 8 }}>
          <h1 className="reels-title">Reels</h1>
          <label className="sr-only" htmlFor="reels-category">
            Category
          </label>
          <select
            id="reels-category"
            className="reels-select"
            value={category ?? ""}
            onChange={(e) => selectCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </span>
        {label ? (
          <span className="reels-count" aria-live="polite">
            {label}
          </span>
        ) : null}
      </div>

      <div ref={list} className="reels" aria-label="Reels" tabIndex={-1}>
        {posts.map((post, index) => (
          <ReelSlide
            key={post.id}
            index={index}
            post={post}
            viewer={viewer}
            active={index === active}
            near={Math.abs(index - active) <= 1}
            onWatched={onWatched}
          />
        ))}
        {limited ? (
          <LimitSlide index={posts.length} limit={allowance.limit} signedIn={viewer.signedIn} />
        ) : !cursor && posts.length > 0 ? (
          <section className="reel reel-end" data-slide={posts.length}>
            <div className="reel-note">
              <strong>You&apos;re all caught up</strong>
              <span>
                That&apos;s every reel{category ? ` in ${categoryLabel(category).toLowerCase()}` : ""}.
              </span>
              <Link href="/" className="btn btn-sm btn-light">
                Back to the feed
              </Link>
            </div>
          </section>
        ) : null}
        {posts.length === 0 && !limited ? (
          <section className="reel reel-end" data-slide={0}>
            <div className="reel-note">
              <strong>{failed ? "We couldn't load reels" : "No reels yet"}</strong>
              <span>
                {failed
                  ? "Please try again in a moment."
                  : "Reels are the video posts. Caught something on camera? Post it."}
              </span>
            </div>
          </section>
        ) : null}
      </div>

      <div className="reels-steps d-only">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous reel"
          onClick={() => goTo(active - 1)}
        >
          <BackIcon style={{ transform: "rotate(90deg)" }} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next reel" onClick={() => goTo(active + 1)}>
          <ChevronIcon style={{ transform: "rotate(90deg)" }} />
        </button>
      </div>
    </div>
  );
}

function ReelSlide({
  index,
  post,
  viewer,
  active,
  near,
  onWatched,
}: {
  index: number;
  post: PostDto;
  viewer: Viewer;
  active: boolean;
  near: boolean;
  onWatched: (postId: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const media = post.media.find((m) => m.mediaType === "Video") ?? post.media[0];
  const href = postPath(post.id);
  const blurred = isBlurred(post);

  useEffect(() => {
    const el = video.current;
    if (!el) {
      return;
    }
    if (active) {
      el.currentTime = 0;
      void el.play().catch(() => {
        // Autoplay refused (e.g. data saver): the controls let the viewer start it.
      });
    } else {
      el.pause();
    }
  }, [active]);

  const onTime = () => {
    const el = video.current;
    if (!el || !active) {
      return;
    }
    if (progress.current && el.duration) {
      progress.current.style.width = `${Math.min(100, (el.currentTime / el.duration) * 100)}%`;
    }
    const needed = el.duration ? Math.min(PLAY_AFTER_SECONDS, el.duration - 0.25) : PLAY_AFTER_SECONDS;
    if (el.currentTime >= needed) {
      onWatched(post.id);
    }
  };

  const facts = [post.location.placeName, categoryLabel(post.category), duration(media?.durationSeconds)]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="reel" data-slide={index} aria-label={post.title}>
      <div className="reel-frame">
        {blurred || !media?.playbackUrl ? (
          <SensitiveCover
            previewUrl={media?.previewUrl}
            signedIn={viewer.signedIn}
            returnTo="/reels"
            className="reel-media"
          />
        ) : (
          <video
            ref={video}
            className="reel-media"
            src={media.playbackUrl}
            poster={media.thumbnailUrl ?? undefined}
            muted
            playsInline
            loop
            preload={near ? "auto" : "none"}
            onTimeUpdate={onTime}
            onClick={(e) => {
              const el = e.currentTarget;
              if (el.paused) {
                void el.play().catch(() => undefined);
              } else {
                el.pause();
              }
            }}
            aria-label={`Video: ${post.title}`}
          />
        )}

        <div className="reel-actions">
          {post.author.handle ? (
            <Link href={profilePath(post.author.handle)} aria-label={`@${post.author.handle}`}>
              <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
            </Link>
          ) : (
            <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
          )}
          <ReactionCount
            postId={post.id}
            total={totalReactions(post)}
            mine={post.myReaction}
            signedIn={viewer.signedIn}
          />
          <Link href={`${href}#comments`} className="tw-act" aria-label={`${post.commentCount} comments`}>
            <CommentIcon />
            {post.commentCount}
          </Link>
          <ShareButton path={href} title={post.title} />
          <PostMoreMenu
            postId={post.id}
            title={post.title}
            authorHandle={post.author.handle}
            isMine={viewer.userId === post.author.id}
            signedIn={viewer.signedIn}
            className="icon-btn"
          />
        </div>

        <div className="reel-info">
          {post.author.handle ? (
            <Link href={profilePath(post.author.handle)} className="reel-author">
              @{post.author.handle}{" "}
              <span>
                ·{" "}
                <time dateTime={post.createdAt} suppressHydrationWarning>
                  {timeAgo(post.createdAt)}
                </time>
              </span>
            </Link>
          ) : (
            <span className="reel-author">{post.author.displayName}</span>
          )}
          <Link href={href}>
            <strong>{post.title}</strong>
            {post.description ? <span className="reel-text">{post.description}</span> : null}
          </Link>
          {facts ? <span className="reel-facts">{facts}</span> : null}
        </div>

        <div className="reel-progress" aria-hidden="true">
          <div ref={progress} />
        </div>
      </div>
    </section>
  );
}

/**
 * Screen 29: today's free reels are used up. Free members are offered Premium (subscriptions aren't on sale yet:
 * "Get Premium" goes to /premium); logged-out viewers are asked to join, which raises the limit to 25.
 */
function LimitSlide({ index, limit, signedIn }: { index: number; limit: number | null; signedIn: boolean }) {
  const count = limit ?? (signedIn ? 25 : 10);
  return (
    <section className="reel reel-end" data-slide={index} aria-label="Daily limit">
      <div className="sheet" role="group" aria-labelledby="reels-limit-title">
        <h2 id="reels-limit-title" className="h2" style={{ margin: 0 }}>
          That&apos;s today&apos;s {count} free reels
        </h2>
        {signedIn ? (
          <>
            <p>
              Come back tomorrow for more, or go unlimited with Premium. You can still browse the feed and
              photos.
            </p>
            <div className="plan-box">
              <div className="spread">
                <strong>Premium yearly</strong>
                <strong>£19.99/year</strong>
              </div>
              <span className="small muted">
                Just £1.67 a month. Unlimited reels, comments anywhere, the incident map, alerts.
              </span>
            </div>
            <div className="spread" style={{ padding: "0 14px" }}>
              <span>Premium monthly</span>
              <span>£2.49/month</span>
            </div>
            <Link href="/premium" className="btn btn-primary btn-block">
              Get Premium
            </Link>
          </>
        ) : (
          <>
            <p>
              <strong>Join to keep watching.</strong> Members get 25 free reels a day, and Premium is
              unlimited. You can still browse the feed and photos.
            </p>
            <a href={joinPath("/reels")} className="btn btn-primary btn-block">
              Join Bad Jockeys
            </a>
            <a href={signInPath("/reels")} className="btn btn-block">
              Sign in
            </a>
          </>
        )}
        <Link href="/" className="link" style={{ textAlign: "center" }}>
          Not now, back to the feed
        </Link>
      </div>
    </section>
  );
}

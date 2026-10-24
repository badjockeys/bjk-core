import Link from "next/link";
import type { ReactNode } from "react";

import type { FeedSource } from "@/actions/posts";
import { feedPage, homePage, myTimelines } from "@/lib/feed";
import type { IncidentCategory, IncidentGroup, PagedResult, PostDto, TimelineDto } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";

import { AppShell, FooterLinks } from "./AppShell";
import { EmptyCategory, Feed } from "./Feed";
import { Composer, FeedHeader } from "./FeedHeader";
import { HomeTabs, type HomeTab } from "./HomeTabs";
import { Dashboard } from "./Dashboard";

/**
 * Screens 01–03: the home timelines (For you, Following, custom; UI step 6), or the feed for one category (from
 * Category trends). Visitors get For you with no tabs.
 */
export async function FeedPage({
  viewer,
  category,
  group,
  subnav,
  label,
  basePath,
  page,
  notice,
  home,
}: {
  viewer: Viewer;
  category?: IncidentCategory;
  /** The feed for a whole group of subcategories. */
  group?: IncidentGroup;
  /** Links shown under the heading (a group's subcategories). */
  subnav?: ReactNode;
  label: string | null;
  basePath: string;
  page: number;
  notice?: string | null;
  /** A home timeline; without it, the feed for `category`. */
  home?: HomeTab;
}) {
  let posts: PagedResult<PostDto> | null;
  let source: FeedSource;
  let timelines: TimelineDto[] = [];
  if (home) {
    const [loaded, mine] = await Promise.all([
      homePage(home, page),
      viewer.signedIn ? myTimelines() : Promise.resolve(null),
    ]);
    posts = loaded;
    timelines = mine?.timelines ?? [];
    source = home.kind === "timeline" ? { kind: "timeline", id: home.id } : { kind: home.kind };
  } else {
    posts = await feedPage({ category, group }, page);
    source = { kind: "feed", category, group };
  }
  const current = home?.kind === "timeline" ? timelines.find((t) => t.id === home.id) : undefined;

  return (
    <AppShell
      viewer={viewer}
      section="home"
      returnTo={basePath}
      bottomNav
      fab
      aside={
        <>
          <Dashboard viewer={viewer} returnTo={basePath} />
          <FooterLinks />
        </>
      }
    >
      <FeedHeader viewer={viewer} title={label ?? "Home"} />
      {subnav}
      {home && viewer.signedIn ? (
        <div className="feed-sticky">
          <HomeTabs current={home} timelines={timelines} />
        </div>
      ) : null}
      {notice ? (
        <div className="pad">
          <p className="notice" role="status">
            {notice}
          </p>
        </div>
      ) : null}
      {viewer.signedIn ? <Composer viewer={viewer} /> : null}
      {current ? (
        <p className="small muted pad timeline-about">
          {current.types.length} {current.types.length === 1 ? "type" : "types"} of bad driving
          {current.placeName ? ` within ${current.radiusKm} km of ${current.placeName}` : " anywhere"} ·{" "}
          <Link href="/timelines">Change</Link>
        </p>
      ) : null}
      {posts ? (
        <Feed
          page={posts}
          source={source}
          viewer={viewer}
          basePath={basePath}
          empty={<EmptyFor home={home} label={label} signedIn={viewer.signedIn} />}
        />
      ) : (
        <section className="centre">
          <h1 className="h2">We couldn&apos;t load these posts</h1>
          <p className="muted">Please try again in a moment.</p>
        </section>
      )}
    </AppShell>
  );
}

function EmptyFor({ home, label, signedIn }: { home?: HomeTab; label: string | null; signedIn: boolean }) {
  if (home?.kind === "following") {
    return (
      <section className="centre" style={{ padding: "64px 32px" }}>
        <h2 className="h2">Nothing from people you follow yet</h2>
        <p className="muted">
          Follow people from their profile, or from Who to follow, and their posts show here.
        </p>
      </section>
    );
  }
  if (home?.kind === "timeline") {
    return (
      <section className="centre" style={{ padding: "64px 32px" }}>
        <h2 className="h2">No posts match this timeline yet</h2>
        <p className="muted">
          Try more types of bad driving or a bigger area. <Link href="/timelines">Change it</Link>
        </p>
      </section>
    );
  }
  return <EmptyCategory label={label} signedIn={signedIn} />;
}

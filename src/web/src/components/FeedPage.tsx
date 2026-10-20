import type { IncidentCategory } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";
import { feedPage } from "@/lib/feed";

import { AppShell, FooterLinks } from "./AppShell";
import { TrendsPanel } from "./TrendsPanel";
import { CategoryTabs } from "./CategoryTabs";
import { EmptyCategory, Feed } from "./Feed";
import { Composer, FeedHeader } from "./FeedHeader";

/** Screens 01–03: the feed, for everyone or one category. */
export async function FeedPage({
  viewer,
  category,
  label,
  basePath,
  page,
  notice,
}: {
  viewer: Viewer;
  category?: IncidentCategory;
  label: string | null;
  basePath: string;
  page: number;
  notice?: string | null;
}) {
  const posts = await feedPage({ category }, page);
  return (
    <AppShell
      viewer={viewer}
      section="home"
      returnTo={basePath}
      bottomNav
      fab
      aside={
        <>
          <TrendsPanel />
          <FooterLinks />
        </>
      }
    >
      <FeedHeader viewer={viewer} title={label ?? "Home"} />
      <div className="feed-sticky">
        <CategoryTabs current={category} />
      </div>
      {notice ? (
        <div className="pad">
          <p className="notice" role="status">
            {notice}
          </p>
        </div>
      ) : null}
      {viewer.signedIn ? <Composer viewer={viewer} /> : null}
      {posts ? (
        <Feed
          page={posts}
          source={{ kind: "feed", category }}
          viewer={viewer}
          basePath={basePath}
          empty={<EmptyCategory label={label} signedIn={viewer.signedIn} />}
        />
      ) : (
        <section className="centre">
          <h1 className="h2">We couldn&apos;t load the feed</h1>
          <p className="muted">Please try again in a moment.</p>
        </section>
      )}
    </AppShell>
  );
}

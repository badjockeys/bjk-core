import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { Feed } from "@/components/Feed";
import { TrendingPanel } from "@/components/TrendingPanel";
import { TrendsPanel } from "@/components/TrendsPanel";
import { api, ApiError } from "@/lib/api";
import { getViewer } from "@/lib/auth";
import { feedPage, pageNumber } from "@/lib/feed";
import { plural } from "@/lib/format";
import { tagFromPath, tagPath } from "@/lib/hashtags";
import type { HashtagDto } from "@/lib/types";

type Props = {
  params: Promise<{ tag: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadTag(value: string): Promise<{ key: string; hashtag: HashtagDto | null } | null> {
  const key = tagFromPath(value);
  if (!key) {
    return null;
  }
  try {
    return { key, hashtag: await api().hashtags.get(key) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { key, hashtag: null };
    }
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const key = tagFromPath((await params).tag);
  return key
    ? {
        title: `#${key}`,
        description: `Posts tagged #${key} on Bad Jockeys.`,
        alternates: { canonical: tagPath(key) },
      }
    : {};
}

/** A hashtag's posts, newest first (UI step 5). Tags come from posts' titles and descriptions. */
export default async function TagPage({ params, searchParams }: Props) {
  const found = await loadTag((await params).tag);
  if (!found) {
    notFound();
  }
  const { key, hashtag } = found;
  const viewer = await getViewer();
  const basePath = tagPath(key);
  const posts = hashtag ? await feedPage({ hashtag: key }, pageNumber((await searchParams).page)) : null;
  const shown = hashtag?.tag ?? key;

  return (
    <AppShell
      viewer={viewer}
      section="home"
      returnTo={basePath}
      bottomNav
      fab
      aside={
        <>
          <TrendingPanel />
          <TrendsPanel />
          <FooterLinks />
        </>
      }
    >
      <header className="c-head">
        <BackButton />
        <div>
          <h1>#{shown}</h1>
          {hashtag ? <p className="small muted">{plural(hashtag.uses, "post")}</p> : null}
        </div>
      </header>
      {!hashtag ? (
        <section className="centre">
          <h2 className="h2">No posts with #{shown} yet</h2>
          <p className="muted">
            Add #{shown} to a post&apos;s title or description and it&apos;ll show up here.
          </p>
          <Link href="/" className="btn btn-primary">
            Back to the feed
          </Link>
        </section>
      ) : posts ? (
        <Feed
          page={posts}
          source={{ kind: "hashtag", tag: key }}
          viewer={viewer}
          basePath={basePath}
          empty={
            <section className="centre">
              <h2 className="h2">No posts with #{shown} right now</h2>
              <p className="muted">Posts with it may have been removed.</p>
            </section>
          }
        />
      ) : (
        <section className="centre">
          <h2 className="h2">We couldn&apos;t load these posts</h2>
          <p className="muted">Please try again in a moment.</p>
        </section>
      )}
    </AppShell>
  );
}

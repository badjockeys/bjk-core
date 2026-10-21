import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { Feed } from "@/components/Feed";
import { BookmarkIcon } from "@/components/icons";
import { TrendsPanel } from "@/components/TrendsPanel";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { pageNumber } from "@/lib/feed";
import { signInPath } from "@/lib/paths";
import type { PagedResult, PostDto } from "@/lib/types";

export const metadata: Metadata = { title: "Bookmarks", robots: { index: false } };

/** Posts you saved, most recently saved first. Only you can see them. */
export default async function BookmarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/bookmarks"));
  }
  const page = pageNumber((await searchParams).page);
  const posts = await load(page);

  return (
    <AppShell
      viewer={viewer}
      section="bookmarks"
      returnTo="/bookmarks"
      bottomNav
      aside={
        <>
          <TrendsPanel />
          <FooterLinks />
        </>
      }
    >
      <header className="top">
        <div className="top-left">
          <BackButton />
          <h1 className="h2">Bookmarks</h1>
        </div>
      </header>
      {posts ? (
        <Feed
          page={posts}
          source={{ kind: "bookmarks" }}
          viewer={viewer}
          basePath="/bookmarks"
          empty={
            <section className="centre" style={{ padding: "96px 32px" }}>
              <BookmarkIcon size={48} />
              <h2 className="h2">Nothing saved yet</h2>
              <p className="muted">
                Tap the bookmark on a post to save it here. Only you can see what you&apos;ve saved.
              </p>
            </section>
          }
        />
      ) : (
        <p className="pad muted">Your bookmarks aren&apos;t available right now. Try again in a minute.</p>
      )}
    </AppShell>
  );
}

async function load(page: number): Promise<PagedResult<PostDto> | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().engagement.bookmarks(token, page);
  } catch {
    return null;
  }
}

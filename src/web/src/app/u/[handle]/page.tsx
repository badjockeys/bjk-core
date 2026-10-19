import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { CategoriesPanel } from "@/components/CategoriesPanel";
import { Feed } from "@/components/Feed";
import { CalendarIcon, PinIcon } from "@/components/icons";
import { ProfileMoreMenu } from "@/components/ProfileMoreMenu";
import type { FeedSource } from "@/actions/posts";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { feedPage, pageNumber } from "@/lib/feed";
import { joined, plural } from "@/lib/format";
import { profilePath } from "@/lib/paths";
import type { PagedResult, PostDto, ProfileDto } from "@/lib/types";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const loadProfile = cache(async (raw: string): Promise<ProfileDto | null> => {
  const handle = decodeURIComponent(raw).replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,30}$/.test(handle)) {
    return null;
  }
  try {
    return await api().profiles.get(await getAccessToken(), handle);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).handle);
  if (!profile) {
    return { title: "Not found", robots: { index: false } };
  }
  return {
    title: `${profile.displayName} (@${profile.handle})`,
    description: profile.bio ?? `@${profile.handle} on Bad Jockeys.`,
    // Profiles stay out of search engines by default: people post here, they don't publish themselves.
    robots: { index: false, follow: true },
    alternates: { canonical: profilePath(profile.handle) },
  };
}

/** Screens 10 and 11: someone's profile, or your own, with their posts. */
export default async function ProfilePage({ params, searchParams }: Props) {
  const profile = await loadProfile((await params).handle);
  if (!profile) {
    notFound();
  }
  const viewer = await getViewer();
  const isMe = viewer.userId === profile.id;
  const page = pageNumber((await searchParams).page);
  const here = profilePath(profile.handle);

  // Your own profile includes posts still processing, held or hidden, which only you can see.
  let posts: PagedResult<PostDto> | null;
  let source: FeedSource;
  if (isMe) {
    source = { kind: "mine" };
    const token = await getAccessToken();
    posts = token
      ? await api()
          .posts.mine(token, page)
          .catch(() => null)
      : null;
  } else {
    source = { kind: "author", handle: profile.handle };
    posts = await feedPage({ author: profile.handle }, page);
  }
  const blocked = viewer.signedIn && !isMe ? await isBlocked(profile.id) : false;

  return (
    <AppShell
      viewer={viewer}
      section={isMe ? "profile" : "home"}
      returnTo={here}
      bottomNav
      fab
      aside={
        <>
          <CategoriesPanel />
          <FooterLinks />
        </>
      }
    >
      <header className="c-head">
        <BackButton arrow />
        <div className="c-sub">
          <span>{profile.displayName}</span>
          {posts ? <small>{plural(posts.totalCount, "post")}</small> : null}
        </div>
      </header>
      <section className="col pad" style={{ gap: 12 }} aria-labelledby="profile-name">
        <div className="spread" style={{ alignItems: "flex-end" }}>
          <Avatar name={profile.displayName} url={profile.avatarUrl} size="lg" decorative={false} />
          {isMe ? (
            <Link href="/profile/edit" className="btn btn-sm">
              Edit profile
            </Link>
          ) : (
            <ProfileMoreMenu handle={profile.handle} signedIn={viewer.signedIn} blocked={blocked} />
          )}
        </div>
        <div className="col" style={{ gap: 0 }}>
          <h1 id="profile-name" className="h1">
            {profile.displayName}
          </h1>
          <span className="muted">@{profile.handle}</span>
        </div>
        {profile.bio ? <p className="post-text">{profile.bio}</p> : null}
        <div className="row row-wrap small muted" style={{ gap: 16 }}>
          {profile.location ? (
            <span className="row" style={{ gap: 4 }}>
              <PinIcon size={16} />
              {profile.location}
            </span>
          ) : null}
          <span className="row" style={{ gap: 4 }}>
            <CalendarIcon />
            Joined {joined(profile.createdAt)}
          </span>
        </div>
        {blocked ? (
          <p className="notice">
            You&apos;ve blocked @{profile.handle}. You won&apos;t see their posts or comments.
          </p>
        ) : null}
      </section>
      <nav className="tabs tabs-fill" aria-label="Profile">
        <span className="tab tab-on" aria-current="page">
          Posts
        </span>
      </nav>
      {posts && !blocked ? (
        <Feed
          page={posts}
          source={source}
          viewer={viewer}
          basePath={here}
          empty={
            <section className="centre">
              <h2 className="h2">{isMe ? "You haven't posted yet" : "No posts yet"}</h2>
              {isMe ? (
                <Link href="/post/new" className="btn btn-primary">
                  Post photos or a video
                </Link>
              ) : null}
            </section>
          }
        />
      ) : null}
    </AppShell>
  );
}

async function isBlocked(userId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) {
    return false;
  }
  try {
    return (await api().profiles.blocks(token)).some((b) => b.userId === userId);
  } catch {
    return false;
  }
}

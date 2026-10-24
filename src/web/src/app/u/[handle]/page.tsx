import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { Dashboard } from "@/components/Dashboard";
import { TrendsPanel } from "@/components/TrendsPanel";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { AccountIcon, CalendarIcon, PinIcon } from "@/components/icons";
import { ProfileBadges } from "@/components/ProfileBadges";
import { ProfileMoreMenu } from "@/components/ProfileMoreMenu";
import { ProfileReplies } from "@/components/ProfileReplies";
import type { FeedSource } from "@/actions/posts";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { feedPage, pageNumber } from "@/lib/feed";
import { joined, plural } from "@/lib/format";
import { profilePath } from "@/lib/paths";
import type { PagedResult, PostDto, ProfileDto, ProfileReplyDto } from "@/lib/types";

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
  const query = await searchParams;
  const page = pageNumber(query.page);
  // The vault moved to Account (Instagram-style, with the automatic saving switch); old links still get there.
  if (query.tab === "vault" && isMe) {
    redirect("/account/vault");
  }
  // Dashboard: your own widgets and cards, on your own profile only (phones' place for the right-hand panel).
  const tab: "posts" | "replies" | "dashboard" =
    query.tab === "replies" ? "replies" : query.tab === "dashboard" && isMe ? "dashboard" : "posts";
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

  // Replies need a signed-in viewer, like comments.
  let replies: PagedResult<ProfileReplyDto> | null = null;
  if (tab === "replies" && viewer.signedIn && !blocked) {
    const token = await getAccessToken();
    replies = token
      ? await api()
          .posts.replies(token, profile.handle, page)
          .catch(() => null)
      : null;
  }

  return (
    <AppShell
      viewer={viewer}
      section={isMe ? "profile" : "home"}
      returnTo={here}
      bottomNav
      fab
      aside={
        <>
          <TrendsPanel />
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
            <div className="row" style={{ gap: 8 }}>
              <Link href="/profile/edit" className="btn btn-sm">
                Edit profile
              </Link>
              {/* Phones: Account lives here, as on Instagram, since the bottom bar has four tabs. */}
              <Link href="/account" className="icon-btn m-only" aria-label="Account settings">
                <AccountIcon size={24} />
              </Link>
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <ProfileMoreMenu handle={profile.handle} signedIn={viewer.signedIn} blocked={blocked} />
              {blocked ? null : (
                <FollowButton
                  handle={profile.handle}
                  following={profile.isFollowing === true}
                  signedIn={viewer.signedIn}
                />
              )}
            </div>
          )}
        </div>
        <div className="col" style={{ gap: 0 }}>
          <h1 id="profile-name" className="h1">
            {profile.displayName}
          </h1>
          <span className="muted">
            @{profile.handle}
            {profile.followsYou ? <span className="follows-you">Follows you</span> : null}
          </span>
        </div>
        <ProfileBadges badges={profile.badges} />
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
        <div className="row small" style={{ gap: 16 }}>
          <Link href={`${here}/following`} className="follow-count">
            <b>{profile.followingCount.toLocaleString("en-GB")}</b> <span className="muted">Following</span>
          </Link>
          <Link href={`${here}/followers`} className="follow-count">
            <b>{profile.followerCount.toLocaleString("en-GB")}</b>{" "}
            <span className="muted">{profile.followerCount === 1 ? "Follower" : "Followers"}</span>
          </Link>
        </div>
        {blocked ? (
          <p className="notice">
            You&apos;ve blocked @{profile.handle}. You won&apos;t see their posts or comments.
          </p>
        ) : null}
      </section>
      <nav className="tabs tabs-fill" aria-label="Profile">
        <Link
          href={here}
          className={`tab${tab === "posts" ? " tab-on" : ""}`}
          aria-current={tab === "posts" ? "page" : undefined}
        >
          Posts
        </Link>
        <Link
          href={`${here}?tab=replies`}
          className={`tab${tab === "replies" ? " tab-on" : ""}`}
          aria-current={tab === "replies" ? "page" : undefined}
        >
          Replies
        </Link>
        {isMe ? (
          <Link
            href={`${here}?tab=dashboard`}
            className={`tab m-only${tab === "dashboard" ? " tab-on" : ""}`}
            aria-current={tab === "dashboard" ? "page" : undefined}
          >
            Dashboard
          </Link>
        ) : null}
        {isMe ? (
          <Link href="/account/vault" className="tab">
            Vault
          </Link>
        ) : null}
      </nav>
      {tab === "dashboard" ? (
        <section className="dash-tab pad" aria-label="Your dashboard">
          <Dashboard viewer={viewer} returnTo={`${here}?tab=dashboard`} />
        </section>
      ) : tab === "replies" ? (
        blocked ? null : !viewer.signedIn ? (
          <section className="centre">
            <h2 className="h2">Sign in to see replies</h2>
            <p className="muted">Comments and replies are only shown to members.</p>
          </section>
        ) : replies ? (
          <ProfileReplies page={replies} basePath={here} isMe={isMe} />
        ) : (
          <p className="error pad" role="alert">
            We couldn&apos;t load the replies. Please try again.
          </p>
        )
      ) : posts && !blocked ? (
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

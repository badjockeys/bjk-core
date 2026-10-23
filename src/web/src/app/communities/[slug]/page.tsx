import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { DiscussionComposer } from "@/components/communities/DiscussionComposer";
import { Feed } from "@/components/Feed";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { communityPath, discussionPath } from "@/lib/communities";
import { pageNumber } from "@/lib/feed";
import { plural, timeAgo } from "@/lib/format";
import { signInPath } from "@/lib/paths";
import type { CommunityDiscussionDto, PagedResult, PostDto } from "@/lib/types";

import { CommunityHeader } from "./CommunityHeader";
import { loadCommunity } from "./data";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const community = await loadCommunity((await params).slug);
  return { title: community?.name ?? "Community", robots: { index: false } };
}

/** A community: its posts, discussions, or about (owner's mock-ups, 23 Oct 2026). */
export default async function CommunityPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath(communityPath(slug)));
  }
  const community = await loadCommunity(slug);
  if (!community) {
    notFound();
  }
  const query = await searchParams;
  const tab = query.tab === "discussions" ? "discussions" : query.tab === "about" ? "about" : "posts";
  const page = pageNumber(query.page);
  const here = communityPath(community.slug);
  const token = await getAccessToken();

  let posts: PagedResult<PostDto> | null = null;
  let discussions: PagedResult<CommunityDiscussionDto> | null = null;
  if (community.canSeeInside && token) {
    if (tab === "posts") {
      posts = await api()
        .communities.posts(token, community.slug, page)
        .catch(() => null);
    } else if (tab === "discussions") {
      discussions = await api()
        .communities.discussions(token, community.slug, page)
        .catch(() => null);
    }
  }
  const isMember = community.standing === "Member";

  return (
    <AppShell
      viewer={viewer}
      section="communities"
      returnTo={here}
      bottomNav
      aside={
        <>
          <About community={community} compact />
          <FooterLinks />
        </>
      }
    >
      <header className="c-head">
        <BackButton arrow />
        <div className="c-sub">
          <span>{community.name}</span>
          <small>{plural(community.memberCount, "member")}</small>
        </div>
      </header>
      <CommunityHeader community={community} tab={tab} />

      {!community.canSeeInside ? (
        <section className="community-locked" aria-labelledby="locked-title">
          <h2 id="locked-title" className="h2">
            Only members can see inside
          </h2>
          <p className="small muted">
            {community.standing === "Requested"
              ? "You've asked to join. An admin or moderator will decide."
              : "Ask to join and an admin or moderator will decide. Clips shared here are still public on Bad Jockeys; the discussions are members-only."}
          </p>
          <About community={community} />
        </section>
      ) : tab === "about" ? (
        <div className="pad">
          <About community={community} />
        </div>
      ) : tab === "discussions" ? (
        <>
          {isMember ? (
            <div className="pad">
              <DiscussionComposer slug={community.slug} />
            </div>
          ) : (
            <p className="pad small muted">Join to start a discussion or reply.</p>
          )}
          {!discussions ? (
            <p className="error pad" role="alert">
              We couldn&apos;t load the discussions. Please try again.
            </p>
          ) : discussions.items.length === 0 ? (
            <p className="centre muted pad">No discussions yet.</p>
          ) : (
            <ul className="community-discussions" aria-label="Discussions">
              {discussions.items.map((d) => (
                <li key={d.id}>
                  <Link href={discussionPath(community.slug, d.id)} className="community-discussion">
                    <span className="small muted">
                      {d.author.displayName} · {timeAgo(d.lastActivityAt)}
                    </span>
                    <strong>{d.title}</strong>
                    {d.body ? <span className="small community-discussion-body">{d.body}</span> : null}
                    <span className="small muted">{plural(d.replyCount, "reply", "replies")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {discussions && discussions.page * discussions.pageSize < discussions.totalCount ? (
            <p className="centre pad">
              <Link href={`${here}?tab=discussions&page=${page + 1}`}>Older discussions</Link>
            </p>
          ) : null}
        </>
      ) : posts ? (
        <Feed
          page={posts}
          source={{ kind: "community", slug: community.slug }}
          viewer={viewer}
          basePath={here}
          empty={
            <section className="centre" style={{ padding: "48px 24px" }}>
              <p className="muted">
                Nothing shared yet. When you post, you can share it with the communities you&apos;ve joined.
              </p>
            </section>
          }
        />
      ) : (
        <p className="error pad" role="alert">
          We couldn&apos;t load the posts. Please try again.
        </p>
      )}
    </AppShell>
  );
}

function About({
  community,
  compact = false,
}: {
  community: {
    name: string;
    description: string;
    rules: string | null;
    placeName: string | null;
    radiusKm: number | null;
    owner: { displayName: string; handle: string | null };
  };
  compact?: boolean;
}) {
  return (
    <section className={compact ? "card stack" : "stack"} aria-label={`About ${community.name}`}>
      {compact ? <h2 className="h2">About</h2> : null}
      <p className="small">
        {community.placeName && community.radiusKm
          ? `Covers incidents within ${community.radiusKm} km of ${community.placeName}. Members posting from there are offered this community.`
          : "About a topic rather than a place."}
      </p>
      {community.rules ? (
        <div className="stack" style={{ gap: 4 }}>
          <strong className="small">Rules</strong>
          <p className="small community-rules">{community.rules}</p>
        </div>
      ) : null}
      <p className="small muted">
        Started by {community.owner.displayName}. Bad Jockeys&apos; community guidelines apply.
      </p>
    </section>
  );
}

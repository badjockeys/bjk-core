import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { ContentActions } from "@/components/communities/ContentActions";
import { ReplyComposer } from "@/components/communities/ReplyComposer";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { communityPath, discussionPath } from "@/lib/communities";
import { pageNumber } from "@/lib/feed";
import { plural, timeAgo } from "@/lib/format";
import { signInPath } from "@/lib/paths";
import type { CommunityDiscussionDetailDto } from "@/lib/types";

import { loadCommunity } from "../../data";

type Props = {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: "Discussion", robots: { index: false } };

/** A discussion in a community, its replies (oldest first) and a reply box for members. */
export default async function DiscussionPage({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath(discussionPath(slug, id)));
  }
  const community = await loadCommunity(slug);
  if (!community || !/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }
  if (!community.canSeeInside) {
    redirect(communityPath(community.slug));
  }
  const page = pageNumber((await searchParams).page);
  const token = await getAccessToken();
  const detail: CommunityDiscussionDetailDto | null = token
    ? await api()
        .communities.discussion(token, community.slug, id, page)
        .catch(() => null)
    : null;
  if (!detail) {
    notFound();
  }
  const { discussion, replies } = detail;
  const here = discussionPath(community.slug, discussion.id);
  const isMember = community.standing === "Member";

  return (
    <AppShell viewer={viewer} section="communities" returnTo={here} bottomNav aside={<FooterLinks />}>
      <header className="c-head">
        <BackButton arrow />
        <div className="c-sub">
          <span>Discussion</span>
          <small>
            <Link href={`${communityPath(community.slug)}?tab=discussions`}>{community.name}</Link>
          </small>
        </div>
      </header>
      <article className="pad stack community-thread" aria-labelledby="discussion-title">
        <div className="spread">
          <span className="row" style={{ gap: 10 }}>
            <Avatar name={discussion.author.displayName} url={discussion.author.avatarUrl} size="sm" />
            <span className="c-sub">
              <strong>{discussion.author.displayName}</strong>
              <small>{timeAgo(discussion.createdAt)}</small>
            </span>
          </span>
          <ContentActions
            slug={community.slug}
            discussionId={discussion.id}
            canRemove={discussion.canRemove}
            isMine={discussion.author.id === viewer.userId}
          />
        </div>
        <h1 id="discussion-title" className="h1">
          {discussion.title}
        </h1>
        {discussion.body ? <p className="post-text">{discussion.body}</p> : null}
        <span className="small muted">{plural(discussion.replyCount, "reply", "replies")}</span>
      </article>

      <section aria-label="Replies">
        <ul className="community-replies">
          {replies.items.map((r) => (
            <li key={r.id} className="community-reply">
              <Avatar name={r.author.displayName} url={r.author.avatarUrl} size="sm" />
              <div className="community-reply-text">
                <span className="small">
                  <strong>{r.author.displayName}</strong> <span className="muted">· {timeAgo(r.createdAt)}</span>
                </span>
                <p className="post-text">{r.body}</p>
              </div>
              <ContentActions
                slug={community.slug}
                discussionId={discussion.id}
                replyId={r.id}
                canRemove={r.canRemove}
                isMine={r.author.id === viewer.userId}
              />
            </li>
          ))}
        </ul>
        {replies.page * replies.pageSize < replies.totalCount ? (
          <p className="centre pad">
            <Link href={`${here}?page=${page + 1}`}>More replies</Link>
          </p>
        ) : null}
      </section>

      <div className="pad">
        {isMember ? (
          <ReplyComposer slug={community.slug} discussionId={discussion.id} />
        ) : (
          <p className="small muted">Join the community to reply.</p>
        )}
      </div>
    </AppShell>
  );
}

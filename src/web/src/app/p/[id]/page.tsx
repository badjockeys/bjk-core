import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppealButton } from "@/components/AppealDialog";
import { AppShell, FooterLinks } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { Comments } from "@/components/Comments";
import { Gallery } from "@/components/Gallery";
import { ClockIcon, SpinnerIcon } from "@/components/icons";
import { LinkExpiryRefresh } from "@/components/LinkExpiryRefresh";
import { PostMoreMenu } from "@/components/PostMoreMenu";
import { RoadBadge, WithPassengers } from "@/components/PostPeople";
import { ProcessingWatcher } from "@/components/ProcessingWatcher";
import { isBlurred } from "@/components/PostMedia";
import { ReactionBar } from "@/components/ReactionBar";
import { SensitiveCover } from "@/components/SensitiveCover";
import { TagRequest } from "@/components/TagRequest";
import { appealPost } from "@/actions/posts";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { categoryHref, categoryLabel, postTypes } from "@/lib/categories";
import { dateTime, plural, postedAt } from "@/lib/format";
import { joinPath, postPath, profilePath, signInPath } from "@/lib/paths";
import { earliestExpiry } from "@/lib/links";
import { loadPost, postCount } from "@/lib/posts";
import type { CommentDto, PagedResult, PostDto } from "@/lib/types";
import { describeVehicle } from "@/lib/vehicles";
import { participationBlocker, type Viewer } from "@/lib/viewer";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Link previews (WhatsApp, X, Facebook) and search results: title, area name, category and the blurred thumbnail. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await loadPost((await params).id);
  if (!post) {
    return { title: "Not found", robots: { index: false } };
  }
  const where = post.location.placeName ? ` in ${post.location.placeName}` : "";
  const summary = `${postTypes(post).map(categoryLabel).join(", ")}${where}, ${dateTime(post.incidentAt)}.`;
  const description = post.description ? `${summary} ${post.description.slice(0, 160)}` : summary;
  const first = post.media[0];
  // Thumbnails are made by the media worker after faces and number plates are blurred. Sensitive posts only ever
  // share their heavily blurred preview.
  const image = !first
    ? null
    : post.isSensitive
      ? (first.previewUrl ?? null)
      : (first.thumbnailUrl ?? (first.mediaType === "Image" ? (first.feedUrl ?? first.playbackUrl) : null));
  const visible = post.status === "Published" && (post.mediaState ?? "Ready") === "Ready";
  return {
    title: post.title,
    description,
    alternates: { canonical: postPath(post.id) },
    robots: visible && !post.isSensitive ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: postPath(post.id),
      publishedTime: post.createdAt,
      images: image ? [{ url: image, alt: `${categoryLabel(post.category)}${where}` }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: post.title, description },
  };
}

/** Screens 04, 05 and 06: one post with its photos or video, details, reactions and comments. */
export default async function PostPage({ params, searchParams }: Props) {
  const { id } = await params;
  const post = await loadPost(id);
  if (!post) {
    notFound();
  }
  const posted = (await searchParams).posted;
  const viewer = await getViewer();
  const isMine = viewer.userId === post.author.id;
  const myTag = viewer.userId ? post.passengers?.find((p) => p.person.id === viewer.userId) : undefined;
  const processing = post.mediaState === "Pending";
  const here = postPath(post.id);

  const [comments, authorPosts] = await Promise.all([
    viewer.signedIn && !post.commentsRequireSignIn ? firstComments(post.id) : Promise.resolve(null),
    post.author.handle ? postCount(post.author.handle) : Promise.resolve(null),
  ]);

  return (
    <AppShell
      viewer={viewer}
      section="home"
      returnTo={here}
      aside={
        <>
          <AuthorCard post={post} count={authorPosts} />
          <FooterLinks />
        </>
      }
    >
      <ProcessingWatcher processing={isMine && processing} justPosted={isMine && Boolean(posted)} />
      <LinkExpiryRefresh expiresAt={earliestExpiry([post])} />
      <header className="top">
        <div className="top-left">
          <BackButton />
          <span className="top-title">{isMine && (processing || posted) ? "Your post" : "Post"}</span>
        </div>
      </header>

      {isMine ? <OwnerNotices post={post} kind={typeof posted === "string" ? posted : null} /> : null}

      <article className="post" aria-labelledby="post-title">
        <div className="post-head">
          <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
          <div className="post-who">
            {post.author.handle ? (
              <Link href={profilePath(post.author.handle)}>{post.author.displayName}</Link>
            ) : (
              <span>{post.author.displayName}</span>
            )}
            <RoadBadge value={post.author.roadUser} />
            <span className="muted small">
              {post.author.handle ? `@${post.author.handle} · ` : ""}
              <time dateTime={post.createdAt} suppressHydrationWarning>
                {postedAt(post.createdAt)}
              </time>
            </span>
          </div>
          <PostMoreMenu
            postId={post.id}
            title={post.title}
            authorHandle={post.author.handle}
            isMine={isMine}
            signedIn={viewer.signedIn}
            className="icon-btn"
            afterDelete="home"
            commentSetting={post.commentSetting}
          />
        </div>
        <WithPassengers passengers={post.passengers} showPending={isMine} />
        {myTag ? (
          <TagRequest postId={post.id} authorName={post.author.displayName} status={myTag.status} />
        ) : null}
        <h1 id="post-title" className="h1">
          {post.title}
        </h1>
        {post.description ? <p className="post-text">{post.description}</p> : null}

        <PostBody
          post={post}
          processing={processing}
          kind={typeof posted === "string" ? posted : null}
          signedIn={viewer.signedIn}
          here={here}
        />

        <div className="facts facts-3">
          {post.location.placeName ? (
            <div className="fact">
              <span className="small muted">Where</span>
              <span>{post.location.placeName}</span>
            </div>
          ) : null}
          <div className="fact">
            <span className="small muted">When</span>
            <span>{dateTime(post.incidentAt)}</span>
          </div>
          {post.vehicle ? (
            <div className="fact">
              <span className="small muted">Vehicle</span>
              <span>{describeVehicle(post.vehicle)}</span>
            </div>
          ) : null}
          {post.reportedToPolice !== null && post.reportedToPolice !== undefined ? (
            <div className="fact">
              <span className="small muted">Reported to police</span>
              <span>{post.reportedToPolice ? "Yes" : "No"}</span>
            </div>
          ) : null}
          <div className="fact">
            <span className="small muted">What</span>
            <ul className="type-tags" aria-label="Types of bad driving">
              {postTypes(post).map((type) => (
                <li key={type}>
                  <Link href={categoryHref(type)} className="type-tag">
                    {categoryLabel(type)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {post.isSensitive ? (
          <p className="help">
            Marked sensitive: injuries or a serious crash. It&apos;s blurred until you&apos;ve verified your
            age.
          </p>
        ) : null}

        {!processing && post.status === "Published" ? (
          <ReactionBar
            postId={post.id}
            counts={post.reactions}
            mine={post.myReaction}
            signedIn={viewer.signedIn}
          />
        ) : null}
      </article>

      {viewer.signedIn && !post.commentsRequireSignIn ? (
        <Comments
          postId={post.id}
          viewer={viewer}
          initial={comments}
          totalCount={post.commentCount}
          postAuthorId={post.author.id}
          commentsOff={post.commentSetting === "Off"}
          blockerNotice={commentBlocker(viewer, here)}
        />
      ) : (
        <section id="comments" className="stack pad" aria-labelledby="comments-title">
          <h2 id="comments-title" className="h2">
            {plural(post.commentCount, "comment")}
          </h2>
          <div className="notice">
            <span className="col">
              <strong>Sign in to see comments</strong>
              <span>Comments are only shown to members, to keep the conversation civil.</span>
              <span className="row" style={{ marginTop: 6 }}>
                <a href={signInPath(here)} className="btn btn-sm">
                  Sign in
                </a>
                <a href={joinPath(here)} className="btn btn-sm btn-primary">
                  Join
                </a>
              </span>
            </span>
          </div>
        </section>
      )}
    </AppShell>
  );
}

async function firstComments(postId: string): Promise<PagedResult<CommentDto> | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().comments.list(token, postId, 1);
  } catch {
    return null;
  }
}

function PostBody({
  post,
  processing,
  kind,
  signedIn,
  here,
}: {
  post: PostDto;
  processing: boolean;
  kind: string | null;
  signedIn: boolean;
  here: string;
}) {
  if (processing && post.media.length === 0) {
    return (
      <div className="media tw-processing ph" role="status">
        <SpinnerIcon />
        <span className="small muted">{kind === "video" ? "Processing video…" : "Processing…"}</span>
      </div>
    );
  }
  if (post.media.length > 0 && isBlurred(post)) {
    return (
      <SensitiveCover
        previewUrl={post.media[0]!.previewUrl}
        signedIn={signedIn}
        returnTo={here}
        className="media"
      />
    );
  }
  const video = post.media.find((m) => m.mediaType === "Video");
  if (video?.playbackUrl) {
    return (
      <video
        className="post-video"
        controls
        playsInline
        muted
        preload="metadata"
        poster={video.thumbnailUrl ?? undefined}
        src={video.playbackUrl}
        aria-label={`Video: ${post.title}`}
      >
        Your browser can&apos;t play this video.
      </video>
    );
  }
  const photos = post.media.filter((m) => m.mediaType === "Image");
  return photos.length > 0 ? <Gallery photos={photos} title={post.title} /> : null;
}

function OwnerNotices({ post, kind }: { post: PostDto; kind: string | null }) {
  if (post.mediaState === "Pending") {
    const what = kind === "video" ? "video" : kind === "photos" ? "photos" : "photos or video";
    return (
      <div className="pad" style={{ paddingBottom: 0 }}>
        <div className="notice" role="status">
          <ClockIcon />
          <span>
            <strong>Processing your {what}.</strong> Your post appears in the feed as soon as it&apos;s ready,
            usually within a minute. You can leave this page.
          </span>
        </div>
      </div>
    );
  }
  if (post.mediaState === "Failed") {
    return (
      <div className="pad" style={{ paddingBottom: 0 }}>
        <div className="notice notice-warn" role="alert">
          <span>
            <strong>We couldn&apos;t publish this post.</strong>{" "}
            {post.mediaFailureReason ?? "A photo or video couldn't be processed."} Delete it from the ⋯ menu
            and try again.
          </span>
        </div>
      </div>
    );
  }
  if (post.status === "HeldForReview") {
    return (
      <div className="pad" style={{ paddingBottom: 0 }}>
        <div className="notice" role="status">
          <span>
            <strong>A moderator is checking your post.</strong> Others will see it once it&apos;s been
            approved.
          </span>
        </div>
      </div>
    );
  }
  if (post.status === "Hidden") {
    return (
      <div className="pad" style={{ paddingBottom: 0 }}>
        <div className="notice notice-warn" role="status">
          <span className="col">
            <span>
              <strong>Hidden by our moderators.</strong> {post.hiddenReason ?? ""} Only you can see it. If you
              think this is wrong, you can appeal.
            </span>
            <AppealButton what="post" submit={appealPost.bind(null, post.id)} />
          </span>
        </div>
      </div>
    );
  }
  return null;
}

function commentBlocker(viewer: Viewer, returnTo: string): React.ReactNode {
  const blocker = participationBlocker(viewer, { profile: true, email: true });
  if (blocker === "profile") {
    return (
      <div className="notice">
        <span>
          Create your profile to comment.{" "}
          <Link className="link" href={`/profile/new?returnTo=${encodeURIComponent(returnTo)}`}>
            Create profile
          </Link>
        </span>
      </div>
    );
  }
  if (blocker === "email") {
    return (
      <div className="notice">
        <span>Confirm your email address to comment: use the link we emailed you when you joined.</span>
      </div>
    );
  }
  return null;
}

function AuthorCard({ post, count }: { post: PostDto; count: number | null }) {
  const handle = post.author.handle;
  return (
    <div className="box stack">
      <div className="row">
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
        <span className="col" style={{ gap: 0 }}>
          <strong>{post.author.displayName}</strong>
          <span className="small muted">
            {handle ? `@${handle}` : ""}
            {count !== null ? ` · ${plural(count, "post")}` : ""}
          </span>
        </span>
      </div>
      {handle ? (
        <Link href={profilePath(handle)} className="btn btn-sm">
          View profile
        </Link>
      ) : null}
    </div>
  );
}

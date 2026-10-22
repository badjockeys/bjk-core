import Link from "next/link";

import { categoryHref, categoryLabel, postTypes } from "@/lib/categories";
import { timeAgo } from "@/lib/format";
import { postPath, profilePath } from "@/lib/paths";
import type { PostDto } from "@/lib/types";
import { describeVehicle } from "@/lib/vehicles";
import type { Viewer } from "@/lib/viewer";

import { Avatar } from "./Avatar";
import { HashtagText } from "./HashtagText";
import { CommentIcon, PinIcon, TagIcon } from "./icons";
import { PostMedia } from "./PostMedia";
import { PostMoreMenu } from "./PostMoreMenu";
import { WithPassengers } from "./PostPeople";
import { ReactionCount } from "./ReactionCount";
import { SaveButton } from "./SaveButton";
import { SeenMarker } from "./SeenMarker";
import { ShareButton } from "./ShareButton";

const FEED_TEXT_LIMIT = 280;

export function totalReactions(post: Pick<PostDto, "reactions">): number {
  return Object.values(post.reactions ?? {}).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** One post in a timeline, X style: author row, title and text, where and what, media, then actions. */
export function PostCard({ post, viewer }: { post: PostDto; viewer: Viewer }) {
  const href = postPath(post.id);
  const authorHref = post.author.handle ? profilePath(post.author.handle) : undefined;
  const isMine = viewer.userId !== null && viewer.userId === post.author.id;
  const text =
    post.description && post.description.length > FEED_TEXT_LIMIT
      ? `${post.description.slice(0, FEED_TEXT_LIMIT).trimEnd()}…`
      : post.description;

  return (
    <article className="tw" aria-labelledby={`post-${post.id}-title`}>
      {post.status === "Published" && !isMine ? <SeenMarker postId={post.id} /> : null}
      {authorHref ? (
        <Link href={authorHref} tabIndex={-1} aria-hidden="true">
          <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
        </Link>
      ) : (
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
      )}
      <div className="tw-body">
        <div className="tw-head">
          {authorHref ? (
            <Link href={authorHref} className="tw-name">
              {post.author.displayName}
            </Link>
          ) : (
            <span className="tw-name">{post.author.displayName}</span>
          )}
          {post.author.handle ? <span className="tw-handle">@{post.author.handle}</span> : null}
          <span className="tw-time">
            ·{" "}
            <time dateTime={post.createdAt} suppressHydrationWarning>
              {timeAgo(post.createdAt)}
            </time>
          </span>
          <PostMoreMenu
            postId={post.id}
            title={post.title}
            authorHandle={post.author.handle}
            isMine={isMine}
            signedIn={viewer.signedIn}
            commentSetting={post.commentSetting}
          />
        </div>
        <WithPassengers passengers={post.passengers} showPending={isMine} />
        <StatusBadge post={post} isMine={isMine} />
        <div className="tw-text">
          <Link href={href} id={`post-${post.id}-title`} className="tw-title">
            <strong>{post.title}</strong>
          </Link>
          {text ? (
            <p className="tw-desc">
              <HashtagText text={text} />
            </p>
          ) : null}
        </div>
        <div className="tw-ctx">
          {post.location.placeName ? (
            <span>
              <PinIcon />
              {post.location.placeName}
            </span>
          ) : null}
          {post.vehicle ? <span>{describeVehicle(post.vehicle)}</span> : null}
          {post.reportedToPolice ? <span>Reported to police</span> : null}
          {post.isSensitive ? <span>Sensitive</span> : null}
        </div>
        <ul className="type-tags" aria-label="Types of bad driving">
          {postTypes(post).map((type) => (
            <li key={type}>
              <Link href={categoryHref(type)} className="type-tag">
                <TagIcon />
                {categoryLabel(type)}
              </Link>
            </li>
          ))}
        </ul>
        <PostMedia post={post} signedIn={viewer.signedIn} />
        <div className="tw-actions">
          <Link href={`${href}#comments`} className="tw-act" aria-label={`${post.commentCount} comments`}>
            <CommentIcon />
            {post.commentCount}
          </Link>
          <ReactionCount
            postId={post.id}
            total={totalReactions(post)}
            mine={post.myReaction}
            signedIn={viewer.signedIn}
          />
          <SaveButton postId={post.id} saved={post.isSaved ?? false} signedIn={viewer.signedIn} />
          <ShareButton path={href} title={post.title} postId={post.id} />
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ post, isMine }: { post: PostDto; isMine: boolean }) {
  if (!isMine) {
    return null;
  }
  if (post.mediaState === "Pending") {
    return <span className="tw-status">Processing: only you can see this for now</span>;
  }
  if (post.mediaState === "Failed") {
    return <span className="tw-status tw-status-warn">Couldn&apos;t be posted</span>;
  }
  if (post.status === "HeldForReview") {
    return <span className="tw-status">Waiting for a moderator to check it</span>;
  }
  if (post.status === "Hidden") {
    return <span className="tw-status tw-status-warn">Hidden by our moderators</span>;
  }
  return null;
}

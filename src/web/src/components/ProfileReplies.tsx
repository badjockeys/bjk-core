import Link from "next/link";

import { timeAgo } from "@/lib/format";
import { postPath, profilePath } from "@/lib/paths";
import type { PagedResult, ProfileReplyDto } from "@/lib/types";

import { Avatar } from "./Avatar";

/**
 * The Replies tab on a profile: the person's comments and replies, newest first, each with the post it's on.
 * Server-rendered; paging is by ?page in the address, like the posts tab.
 */
export function ProfileReplies({
  page,
  basePath,
  isMe,
}: {
  page: PagedResult<ProfileReplyDto>;
  basePath: string;
  isMe: boolean;
}) {
  if (page.items.length === 0) {
    return (
      <section className="centre">
        <h2 className="h2">{isMe ? "You haven't replied to anything yet" : "No replies yet"}</h2>
        <p className="muted">Comments and replies on posts show here.</p>
      </section>
    );
  }

  const pages = Math.max(1, Math.ceil(page.totalCount / page.pageSize));
  return (
    <section aria-label="Replies">
      <ul className="profile-replies">
        {page.items.map(({ comment, post, replyingTo }) => (
          <li key={comment.id} className="profile-reply">
            <Avatar
              name={comment.author?.displayName ?? "Former member"}
              url={comment.author?.avatarUrl ?? null}
              size="sm"
            />
            <div className="col" style={{ gap: 4, minWidth: 0 }}>
              <span className="small muted">
                {replyingTo ? <>Replying to @{replyingTo} on </> : <>Commented on </>}
                <Link href={postPath(post.id)} className="profile-reply-post">
                  {post.title}
                </Link>
                {post.author.handle ? (
                  <>
                    {" "}
                    by <Link href={profilePath(post.author.handle)}>@{post.author.handle}</Link>
                  </>
                ) : null}
              </span>
              <span className="comment-text">{comment.body}</span>
              <span className="small muted">
                <time dateTime={comment.createdAt} suppressHydrationWarning>
                  {timeAgo(comment.createdAt)}
                </time>
                {comment.editedAt ? " · edited" : ""}
                {comment.status === "HeldForReview"
                  ? " · only you can see this until a moderator checks it"
                  : ""}
                {comment.status === "Hidden" ? " · hidden by our moderators" : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav className="row pad" style={{ justifyContent: "space-between" }} aria-label="More replies">
          {page.page > 1 ? (
            <Link href={`${basePath}?tab=replies&page=${page.page - 1}`} className="btn btn-sm">
              Newer
            </Link>
          ) : (
            <span />
          )}
          {page.page < pages ? (
            <Link href={`${basePath}?tab=replies&page=${page.page + 1}`} className="btn btn-sm">
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}

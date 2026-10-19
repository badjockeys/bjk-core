"use client";

import { useId, useState, useTransition } from "react";

import {
  addComment,
  appealComment,
  deleteComment,
  loadComments,
  loadReplies,
  reactToComment,
  replyToComment,
  reportComment,
} from "@/actions/comments";
import { followBlocker } from "@/lib/blockers";
import { plural, timeAgo } from "@/lib/format";
import type { CommentDto, PagedResult } from "@/lib/types";
import type { Blocker, Viewer } from "@/lib/viewer";

import { AppealButton } from "./AppealDialog";
import { Avatar } from "./Avatar";
import { MoreIcon, ThumbIcon } from "./icons";
import { Menu, type MenuItem } from "./Menu";
import { ReportDialog } from "./ReportDialog";
import { toast } from "./toast";

function reactionTotal(c: CommentDto): number {
  return Object.values(c.reactions ?? {}).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/**
 * Comments on a post (screens 04/05), for signed-in members: newest at the bottom, replies one level deep under the
 * comment they answer, and a reaction on each.
 */
export function Comments({
  postId,
  viewer,
  initial,
  totalCount,
  blockerNotice,
}: {
  postId: string;
  viewer: Viewer;
  initial: PagedResult<CommentDto> | null;
  /** The post's comment count, replies included. */
  totalCount: number;
  /** Shown instead of the comment box when the viewer can't comment yet (age check, profile, email). */
  blockerNotice: React.ReactNode;
}) {
  const [comments, setComments] = useState<CommentDto[]>(initial?.items ?? []);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [topLevelTotal, setTopLevelTotal] = useState(initial?.totalCount ?? 0);
  const [count, setCount] = useState(totalCount);
  const [loadError, setLoadError] = useState<string | null>(
    initial ? null : "We couldn't load the comments.",
  );
  const [pending, startTransition] = useTransition();

  const remaining = Math.max(0, topLevelTotal - comments.length);

  const showMore = () =>
    startTransition(async () => {
      const result = await loadComments(postId, page + 1);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setComments((current) => {
        const ids = new Set(current.map((c) => c.id));
        return [...current, ...result.data.items.filter((c) => !ids.has(c.id))];
      });
      setPage(result.data.page);
      setTopLevelTotal(result.data.totalCount);
    });

  const update = (id: string, change: (c: CommentDto) => CommentDto) =>
    setComments((current) =>
      current.map((c) =>
        c.id === id
          ? change(c)
          : { ...c, replies: c.replies?.map((r) => (r.id === id ? change(r) : r)) ?? c.replies },
      ),
    );

  const remove = (id: string) => {
    setComments((current) =>
      current
        .filter((c) => c.id !== id || (c.replies?.length ?? 0) > 0)
        .map((c) =>
          c.id === id
            ? { ...c, isRemoved: true, body: "", author: null }
            : { ...c, replies: c.replies?.filter((r) => r.id !== id) ?? c.replies },
        ),
    );
    setCount((n) => Math.max(0, n - 1));
  };

  return (
    <section id="comments" className="stack pad" aria-labelledby="comments-title">
      <h2 id="comments-title" className="h2">
        {plural(count, "comment")}
      </h2>

      {blockerNotice ?? (
        <CommentBox
          viewer={viewer}
          label="Add a comment"
          button="Comment"
          onSubmit={async (body) => {
            const result = await addComment(postId, body);
            if (result.ok) {
              setComments((current) => [...current, { ...result.data, replies: [], replyCount: 0 }]);
              setTopLevelTotal((n) => n + 1);
              setCount((n) => n + 1);
              if (result.data.status === "HeldForReview") {
                toast("Thanks. A moderator will check your comment before others see it.");
              }
            }
            return result;
          }}
        />
      )}

      {comments.map((comment) => (
        <CommentThread
          key={comment.id}
          postId={postId}
          comment={comment}
          viewer={viewer}
          canReply={blockerNotice === null}
          onChange={update}
          onRemoved={remove}
          onReplied={(reply) => {
            update(comment.id, (c) => ({
              ...c,
              replies: [...(c.replies ?? []), reply],
              replyCount: (c.replyCount ?? 0) + 1,
            }));
            setCount((n) => n + 1);
          }}
          onRepliesLoaded={(replies) =>
            update(comment.id, (c) => {
              const ids = new Set((c.replies ?? []).map((r) => r.id));
              return { ...c, replies: [...(c.replies ?? []), ...replies.filter((r) => !ids.has(r.id))] };
            })
          }
        />
      ))}

      {loadError ? (
        <p className="error" role="alert">
          {loadError}
        </p>
      ) : null}
      {remaining > 0 ? (
        <button
          type="button"
          className="link"
          style={{ alignSelf: "flex-start" }}
          disabled={pending}
          onClick={showMore}
        >
          {pending ? "Loading…" : `Show ${plural(remaining, "more comment")}`}
        </button>
      ) : null}
    </section>
  );
}

function CommentThread({
  postId,
  comment,
  viewer,
  canReply,
  onChange,
  onRemoved,
  onReplied,
  onRepliesLoaded,
}: {
  postId: string;
  comment: CommentDto;
  viewer: Viewer;
  canReply: boolean;
  onChange: (id: string, change: (c: CommentDto) => CommentDto) => void;
  onRemoved: (id: string) => void;
  onReplied: (reply: CommentDto) => void;
  onRepliesLoaded: (replies: CommentDto[]) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [repliesPage, setRepliesPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const replies = comment.replies ?? [];
  const moreReplies = Math.max(0, (comment.replyCount ?? replies.length) - replies.length);

  const loadMoreReplies = () =>
    startTransition(async () => {
      const next = repliesPage + 1;
      const result = await loadReplies(postId, comment.id, next);
      if (result.ok) {
        setRepliesPage(next);
        onRepliesLoaded(result.data.items);
      } else {
        toast(result.error);
      }
    });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <CommentItem
        postId={postId}
        comment={comment}
        viewer={viewer}
        onReply={canReply && !comment.isRemoved ? () => setReplying((v) => !v) : undefined}
        onChange={onChange}
        onRemoved={onRemoved}
      />
      {replies.length > 0 || moreReplies > 0 || replying ? (
        <div className="replies">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              postId={postId}
              comment={reply}
              viewer={viewer}
              replyingTo={comment.author?.handle ?? null}
              onChange={onChange}
              onRemoved={onRemoved}
            />
          ))}
          {moreReplies > 0 ? (
            <button
              type="button"
              className="link"
              style={{ alignSelf: "flex-start" }}
              disabled={pending}
              onClick={loadMoreReplies}
            >
              {pending ? "Loading…" : `Show ${plural(moreReplies, "more reply", "more replies")}`}
            </button>
          ) : null}
          {replying ? (
            <CommentBox
              viewer={viewer}
              label={comment.author?.handle ? `Reply to @${comment.author.handle}` : "Reply"}
              button="Reply"
              autoFocus
              onSubmit={async (body) => {
                const result = await replyToComment(postId, comment.id, body);
                if (result.ok) {
                  onReplied(result.data);
                  setReplying(false);
                }
                return result;
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CommentItem({
  postId,
  comment,
  viewer,
  replyingTo,
  onReply,
  onChange,
  onRemoved,
}: {
  postId: string;
  comment: CommentDto;
  viewer: Viewer;
  replyingTo?: string | null;
  onReply?: () => void;
  onChange: (id: string, change: (c: CommentDto) => CommentDto) => void;
  onRemoved: (id: string) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [pending, startTransition] = useTransition();

  if (comment.isRemoved || !comment.author) {
    return (
      <div className="comment">
        <span className="avatar avatar-sm" aria-hidden="true" />
        <p className="muted small" style={{ alignSelf: "center" }}>
          Comment removed
        </p>
      </div>
    );
  }

  const author = comment.author;
  const isMine = viewer.userId === author.id;
  const total = reactionTotal(comment);
  const on = Boolean(comment.myReaction);

  const toggleReaction = () => {
    const next = on ? null : ("Like" as const);
    const before = comment;
    const was = comment.myReaction ?? null;
    onChange(comment.id, (c) => {
      const reactions = { ...c.reactions };
      if (was) {
        reactions[was] = Math.max(0, (reactions[was] ?? 0) - 1);
      }
      if (next) {
        reactions[next] = (reactions[next] ?? 0) + 1;
      }
      return { ...c, myReaction: next, reactions };
    });
    startTransition(async () => {
      const result = await reactToComment(postId, comment.id, next);
      if (!result.ok) {
        onChange(comment.id, () => before);
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
      }
    });
  };

  const items: MenuItem[] = [];
  if (isMine) {
    items.push({
      label: "Delete comment",
      danger: true,
      onSelect: async () => {
        if (!window.confirm("Delete your comment?")) {
          return;
        }
        const result = await deleteComment(postId, comment.id);
        if (result.ok) {
          onRemoved(comment.id);
        } else {
          toast(result.error);
        }
      },
    });
  } else {
    items.push({ label: "Report comment", onSelect: () => setReporting(true) });
  }

  return (
    <div className="comment">
      <Avatar name={author.displayName} url={author.avatarUrl} size="sm" />
      <div className="col comment-body">
        <span className="small">
          <strong>{author.handle ? `@${author.handle}` : author.displayName}</strong>{" "}
          <span className="muted">
            {replyingTo ? `· replying to @${replyingTo} ` : ""}·{" "}
            <time dateTime={comment.createdAt} suppressHydrationWarning>
              {timeAgo(comment.createdAt)}
            </time>
          </span>
        </span>
        <span className="comment-text">{comment.body}</span>
        {comment.status === "HeldForReview" ? (
          <span className="help">Only you can see this until a moderator checks it.</span>
        ) : null}
        {comment.status === "Hidden" && isMine ? (
          <span className="row row-wrap">
            <span className="help">Hidden by our moderators.</span>
            <AppealButton
              what="comment"
              submit={(statement) => appealComment(postId, comment.id, statement)}
            />
          </span>
        ) : null}
        <div className="row" style={{ gap: 4, marginLeft: -8 }}>
          <button
            type="button"
            className={`tw-act${on ? " tw-act-on" : ""}`}
            aria-pressed={on}
            aria-label={`${total} reactions. ${on ? "Remove your reaction" : "Like this comment"}`}
            disabled={pending}
            onClick={toggleReaction}
          >
            <ThumbIcon on={on} size={15} />
            {total}
          </button>
          {onReply ? (
            <button type="button" className="tw-act" onClick={onReply}>
              Reply
            </button>
          ) : null}
          <Menu label="More: report or delete" items={items} buttonClassName="tw-act">
            <MoreIcon />
          </Menu>
        </div>
      </div>
      {!isMine ? (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          what="comment"
          submit={(reason, details) => reportComment(postId, comment.id, reason, details)}
        />
      ) : null}
    </div>
  );
}

function CommentBox({
  viewer,
  label,
  button,
  autoFocus,
  onSubmit,
}: {
  viewer: Viewer;
  label: string;
  button: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<{ ok: boolean; error?: string; blocker?: Blocker }>;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <form
      className="stack"
      style={{ gap: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await onSubmit(body);
          if (result.ok) {
            setBody("");
          } else if (!followBlocker(result.blocker)) {
            setError(result.error ?? "Something went wrong.");
          }
        });
      }}
    >
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar name={viewer.displayName} url={viewer.avatarUrl} size="sm" />
        <label className="field" style={{ flex: 1 }} htmlFor={id}>
          <span className="sr-only">{label}</span>
          <textarea
            id={id}
            className="textarea"
            rows={2}
            maxLength={2000}
            placeholder={label}
            value={body}
            autoFocus={autoFocus}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm d-only" disabled={pending || !body.trim()}>
          {button}
        </button>
      </div>
      <button
        type="submit"
        className="btn btn-primary btn-sm m-only"
        style={{ alignSelf: "flex-start", marginLeft: 42 }}
        disabled={pending || !body.trim()}
      >
        {button}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

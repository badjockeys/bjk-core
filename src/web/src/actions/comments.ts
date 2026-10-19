"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { IN_APP_REASONS, isReason } from "@/lib/reasons";
import type { CommentDto, PagedResult, ReactionType, ReportReason } from "@/lib/types";

import { asUser } from "./run";

export async function loadComments(
  postId: string,
  page: number,
): Promise<ActionResult<PagedResult<CommentDto>>> {
  return asUser((t) => api().comments.list(t, postId, Math.max(1, Math.floor(page))));
}

export async function loadReplies(
  postId: string,
  commentId: string,
  page: number,
): Promise<ActionResult<PagedResult<CommentDto>>> {
  return asUser((t) => api().comments.replies(t, postId, commentId, Math.max(1, Math.floor(page))));
}

export async function addComment(postId: string, body: string): Promise<ActionResult<CommentDto>> {
  if (!body.trim()) {
    return { ok: false, error: "Write something first." };
  }
  return asUser((t) => api().comments.add(t, postId, body.trim()));
}

/** Reply to a top-level comment. Replies go one level deep. */
export async function replyToComment(
  postId: string,
  commentId: string,
  body: string,
): Promise<ActionResult<CommentDto>> {
  if (!body.trim()) {
    return { ok: false, error: "Write something first." };
  }
  return asUser((t) => api().comments.reply(t, postId, commentId, body.trim()));
}

export async function reactToComment(
  postId: string,
  commentId: string,
  type: ReactionType | null,
): Promise<ActionResult> {
  return asUser((t) =>
    type ? api().comments.react(t, postId, commentId, type) : api().comments.unreact(t, postId, commentId),
  );
}

export async function deleteComment(postId: string, commentId: string): Promise<ActionResult> {
  return asUser((t) => api().comments.remove(t, postId, commentId));
}

export async function reportComment(
  postId: string,
  commentId: string,
  reason: ReportReason,
  details: string,
): Promise<ActionResult> {
  if (!isReason(reason, IN_APP_REASONS)) {
    return { ok: false, error: "Choose a reason." };
  }
  return asUser((t) => api().comments.report(t, postId, commentId, reason, details.trim() || null));
}

export async function appealComment(
  postId: string,
  commentId: string,
  statement: string,
): Promise<ActionResult<{ reference: string }>> {
  if (!statement.trim()) {
    return { ok: false, error: "Tell us why the decision should change." };
  }
  return asUser(async (t) => ({
    reference: (await api().comments.appeal(t, postId, commentId, statement.trim())).reference,
  }));
}

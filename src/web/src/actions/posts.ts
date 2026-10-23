"use server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { CATEGORIES, GROUPS } from "@/lib/categories";
import type { ActionResult } from "@/lib/action-result";
import type {
  CommentSetting,
  CreatePostRequest,
  IncidentCategory,
  IncidentGroup,
  PagedResult,
  PostDto,
  PostReactionsDto,
  ReactionType,
  ReportReason,
} from "@/lib/types";
import { tagFromPath } from "@/lib/hashtags";
import { REACTION_TYPES } from "@/lib/reactions";
import { IN_APP_REASONS, isReason } from "@/lib/reasons";

import { asUser, run } from "./run";

export type FeedSource =
  | { kind: "feed"; category?: IncidentCategory; group?: IncidentGroup }
  | { kind: "author"; handle: string }
  | { kind: "hashtag"; tag: string }
  | { kind: "for-you" }
  | { kind: "following" }
  | { kind: "timeline"; id: string }
  | { kind: "community"; slug: string }
  | { kind: "mine" }
  | { kind: "bookmarks" };

/** The next page of a feed, for infinite scrolling. */
export async function loadPosts(
  source: FeedSource,
  page: number,
): Promise<ActionResult<PagedResult<PostDto>>> {
  const token = await getAccessToken();
  const safePage = Math.max(1, Math.floor(page));
  if (source.kind === "mine") {
    return asUser((t) => api().posts.mine(t, safePage));
  }
  if (source.kind === "bookmarks") {
    return asUser((t) => api().engagement.bookmarks(t, safePage));
  }
  if (source.kind === "author") {
    return run(() => api().posts.list(token, { author: source.handle, page: safePage }));
  }
  if (source.kind === "for-you") {
    return run(() => api().timelines.forYou(token, safePage));
  }
  if (source.kind === "following") {
    return asUser((t) => api().timelines.following(t, safePage));
  }
  if (source.kind === "community") {
    if (!/^[a-z0-9-]{1,70}$/.test(source.slug)) {
      return { ok: false, error: "That community doesn't exist." };
    }
    return asUser((t) => api().communities.posts(t, source.slug, safePage));
  }
  if (source.kind === "timeline") {
    if (!/^[0-9a-f-]{36}$/i.test(source.id)) {
      return { ok: false, error: "That timeline doesn't exist." };
    }
    return asUser((t) => api().timelines.posts(t, source.id, safePage));
  }
  if (source.kind === "hashtag") {
    const tag = tagFromPath(source.tag);
    if (!tag) {
      return { ok: false, error: "That isn't a hashtag." };
    }
    return run(() => api().posts.list(token, { hashtag: tag, page: safePage }));
  }
  const category = CATEGORIES.some((c) => c.value === source.category) ? source.category : undefined;
  const group = GROUPS.some((g) => g.value === source.group) ? source.group : undefined;
  return run(() => api().posts.list(token, { category, group, page: safePage }));
}

/** Set (or with null, remove) your reaction to a post. */
export async function reactToPost(postId: string, type: ReactionType | null): Promise<ActionResult> {
  if (type !== null && !REACTION_TYPES.includes(type)) {
    return { ok: false, error: "Choose a reaction." };
  }
  return asUser((t) => (type ? api().posts.react(t, postId, type) : api().posts.unreact(t, postId)));
}

/** Who reacted to a post (signed-in members only), filtered by reaction and searched by name. */
export async function listReactions(
  postId: string,
  q: { type: ReactionType | null; search: string; page: number; pageSize: number },
): Promise<ActionResult<PostReactionsDto>> {
  const type = q.type && REACTION_TYPES.includes(q.type) ? q.type : undefined;
  const search = q.search.trim().slice(0, 50) || undefined;
  return asUser((t) =>
    api().posts.reactions(t, postId, { type, search, page: Math.max(1, q.page), pageSize: q.pageSize }),
  );
}

export async function reportPost(
  postId: string,
  reason: ReportReason,
  details: string,
): Promise<ActionResult> {
  if (!isReason(reason, IN_APP_REASONS)) {
    return { ok: false, error: "Choose a reason." };
  }
  return asUser((t) => api().posts.report(t, postId, reason, details.trim() || null));
}

export async function deletePost(postId: string): Promise<ActionResult> {
  return asUser((t) => api().posts.remove(t, postId));
}

/** On your own post: turn comments off (existing ones stay) or back on. */
export async function setCommentSetting(postId: string, setting: CommentSetting): Promise<ActionResult> {
  if (setting !== "Everyone" && setting !== "Off" && setting !== "Following") {
    return { ok: false, error: "Choose who can comment." };
  }
  return asUser((t) => api().posts.setCommentSetting(t, postId, setting));
}

export async function appealPost(
  postId: string,
  statement: string,
): Promise<ActionResult<{ reference: string }>> {
  if (!statement.trim()) {
    return { ok: false, error: "Tell us why the decision should change." };
  }
  return asUser(async (t) => {
    const appeal = await api().posts.appeal(t, postId, statement.trim());
    return { reference: appeal.reference };
  });
}

/** Create the post. Its photos or video may still be processing: it then goes live when they're ready. */
export async function createPost(request: CreatePostRequest): Promise<ActionResult<{ id: string }>> {
  return asUser(async (t) => {
    const post = await api().posts.create(t, {
      ...request,
      title: request.title.trim(),
      description: request.description?.trim() || null,
      placeName: request.placeName?.trim() || null,
    });
    return { id: post.id };
  });
}

/** The latest version of one post (e.g. to see whether it has finished processing). */
export async function getPost(postId: string): Promise<ActionResult<PostDto>> {
  const token = await getAccessToken();
  return run(() => api().posts.get(token, postId));
}

"use server";

import { revalidatePath } from "next/cache";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type {
  CommunityDiscussionDto,
  CommunityDto,
  CommunityMemberDto,
  CommunityReplyDto,
  CommunityRequest,
  CommunityRole,
  CommunitySuggestionDto,
  ReportReason,
} from "@/lib/types";

import { asUser } from "./run";

/** Community addresses are lower-case letters, digits and dashes. */
const SLUG = /^[a-z0-9-]{1,70}$/;
const ID = /^[0-9a-f-]{36}$/i;
const NOT_FOUND = { ok: false as const, error: "That community doesn't exist." };

function changed(slug?: string) {
  revalidatePath("/communities");
  if (slug) {
    revalidatePath(`/communities/${slug}`, "layout");
  }
}

/** Start a community (Premium, adults). */
export async function createCommunity(body: CommunityRequest): Promise<ActionResult<CommunityDto>> {
  const result = await asUser((t) => api().communities.create(t, body));
  if (result.ok) changed();
  return result;
}

export async function updateCommunity(
  slug: string,
  body: CommunityRequest,
): Promise<ActionResult<CommunityDto>> {
  if (!SLUG.test(slug)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.update(t, slug, body));
  if (result.ok) changed(slug);
  return result;
}

export async function deleteCommunity(slug: string): Promise<ActionResult> {
  if (!SLUG.test(slug)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.remove(t, slug));
  if (result.ok) changed();
  return result;
}

/** Join a public community, or ask to join a private one. */
export async function joinCommunity(slug: string): Promise<ActionResult<CommunityDto>> {
  if (!SLUG.test(slug)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.join(t, slug));
  if (result.ok) changed(slug);
  return result;
}

/** Leave, or withdraw a request. */
export async function leaveCommunity(slug: string): Promise<ActionResult> {
  if (!SLUG.test(slug)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.leave(t, slug));
  if (result.ok) changed(slug);
  return result;
}

/** Invite someone by their @handle (admins and moderators). */
export async function inviteToCommunity(
  slug: string,
  handle: string,
): Promise<ActionResult<CommunityMemberDto>> {
  const clean = handle.trim().replace(/^@/, "");
  if (!SLUG.test(slug)) return NOT_FOUND;
  if (!/^[A-Za-z0-9_]{1,40}$/.test(clean)) return { ok: false, error: "Enter their @handle." };
  const result = await asUser((t) => api().communities.invite(t, slug, clean));
  if (result.ok) changed(slug);
  return result;
}

export async function decideRequest(slug: string, userId: string, approve: boolean): Promise<ActionResult> {
  if (!SLUG.test(slug) || !ID.test(userId)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.decide(t, slug, userId, approve));
  if (result.ok) changed(slug);
  return result;
}

export async function setMemberRole(
  slug: string,
  userId: string,
  role: CommunityRole,
): Promise<ActionResult> {
  if (!SLUG.test(slug) || !ID.test(userId)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.setRole(t, slug, userId, role));
  if (result.ok) changed(slug);
  return result;
}

export async function removeMember(slug: string, userId: string, ban: boolean): Promise<ActionResult> {
  if (!SLUG.test(slug) || !ID.test(userId)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.removeMember(t, slug, userId, ban));
  if (result.ok) changed(slug);
  return result;
}

export async function unbanMember(slug: string, userId: string): Promise<ActionResult> {
  if (!SLUG.test(slug) || !ID.test(userId)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.unban(t, slug, userId));
  if (result.ok) changed(slug);
  return result;
}

/** Take a post out of a community. */
export async function unsharePost(slug: string, postId: string): Promise<ActionResult> {
  if (!SLUG.test(slug) || !ID.test(postId)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.unshare(t, slug, postId));
  if (result.ok) changed(slug);
  return result;
}

export async function startDiscussion(
  slug: string,
  title: string,
  body: string,
): Promise<ActionResult<CommunityDiscussionDto>> {
  if (!SLUG.test(slug)) return NOT_FOUND;
  const result = await asUser((t) =>
    api().communities.startDiscussion(t, slug, { title, body: body || null }),
  );
  if (result.ok) changed(slug);
  return result;
}

export async function replyToDiscussion(
  slug: string,
  id: string,
  body: string,
): Promise<ActionResult<CommunityReplyDto>> {
  if (!SLUG.test(slug) || !ID.test(id)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.reply(t, slug, id, body));
  if (result.ok) changed(slug);
  return result;
}

export async function removeDiscussion(slug: string, id: string): Promise<ActionResult> {
  if (!SLUG.test(slug) || !ID.test(id)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.removeDiscussion(t, slug, id));
  if (result.ok) changed(slug);
  return result;
}

export async function removeReply(slug: string, id: string, replyId: string): Promise<ActionResult> {
  if (!SLUG.test(slug) || !ID.test(id) || !ID.test(replyId)) return NOT_FOUND;
  const result = await asUser((t) => api().communities.removeReply(t, slug, id, replyId));
  if (result.ok) changed(slug);
  return result;
}

export async function reportCommunity(
  slug: string,
  reason: ReportReason,
  details: string,
): Promise<ActionResult> {
  if (!SLUG.test(slug)) return NOT_FOUND;
  return asUser((t) => api().communities.report(t, slug, reason, details || null));
}

export async function reportDiscussion(
  id: string,
  reason: ReportReason,
  details: string,
): Promise<ActionResult> {
  if (!ID.test(id)) return NOT_FOUND;
  return asUser((t) => api().communities.reportDiscussion(t, id, reason, details || null));
}

export async function reportReply(id: string, reason: ReportReason, details: string): Promise<ActionResult> {
  if (!ID.test(id)) return NOT_FOUND;
  return asUser((t) => api().communities.reportReply(t, id, reason, details || null));
}

/** Your communities to share into, those covering the place first. */
export async function suggestCommunities(q: {
  latitude?: number | null;
  longitude?: number | null;
  postId?: string | null;
}): Promise<ActionResult<CommunitySuggestionDto[]>> {
  return asUser((t) => api().communities.suggestions(t, q));
}

/** Share your post into communities you're a member of. */
export async function shareToCommunities(
  postId: string,
  communityIds: string[],
): Promise<ActionResult<string[]>> {
  if (!ID.test(postId) || communityIds.length === 0) return { ok: true, data: [] };
  return asUser((t) => api().communities.share(t, postId, communityIds));
}

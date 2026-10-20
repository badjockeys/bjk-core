"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { IN_APP_REASONS, isReason } from "@/lib/reasons";
import type { HandleAvailability, ProfileDto, ReportReason, RoadUser } from "@/lib/types";

import { asUser, run } from "./run";

export interface ProfileForm {
  handle: string;
  displayName: string;
  bio: string;
  location: string;
  /** How they use the road (optional, private unless shown). Undefined leaves it as it is. */
  roadUser?: RoadUser | null;
  showRoadUser?: boolean;
}

const ROAD_USERS: readonly RoadUser[] = ["Driver", "Cyclist", "Both"];

async function saveRoadUser(token: string, form: ProfileForm, saved: ProfileDto): Promise<ProfileDto> {
  if (form.roadUser === undefined) {
    return saved;
  }
  const roadUser = form.roadUser && ROAD_USERS.includes(form.roadUser) ? form.roadUser : null;
  if (roadUser === (saved.roadUser ?? null) && !!form.showRoadUser === !!saved.showRoadUser) {
    return saved;
  }
  return api().profiles.setRoadUser(token, roadUser, !!form.showRoadUser);
}

export async function checkHandle(handle: string): Promise<ActionResult<HandleAvailability>> {
  const value = handle.trim().replace(/^@/, "");
  if (!value) {
    return { ok: false, error: "Choose a username." };
  }
  return run(() => api().profiles.handleAvailability(value));
}

export async function createProfile(form: ProfileForm): Promise<ActionResult<ProfileDto>> {
  return asUser(async (t) => {
    const created = await api().profiles.create(t, {
      handle: form.handle.trim().replace(/^@/, ""),
      displayName: form.displayName.trim(),
      bio: form.bio.trim() || null,
      location: form.location.trim() || null,
    });
    return saveRoadUser(t, form, created);
  });
}

/** Save the profile: the username (if it changed) and the rest. */
export async function updateProfile(
  form: ProfileForm,
  currentHandle: string,
): Promise<ActionResult<ProfileDto>> {
  const handle = form.handle.trim().replace(/^@/, "");
  return asUser(async (t) => {
    if (handle && handle.toLowerCase() !== currentHandle.toLowerCase()) {
      await api().profiles.changeHandle(t, handle);
    }
    const updated = await api().profiles.update(t, {
      displayName: form.displayName.trim(),
      bio: form.bio.trim() || null,
      location: form.location.trim() || null,
    });
    return saveRoadUser(t, form, updated);
  });
}

/** Use an uploaded (Ready) photo as the avatar, or remove it with null. */
export async function setAvatar(mediaId: string | null): Promise<ActionResult<ProfileDto>> {
  return asUser((t) => api().profiles.setAvatar(t, mediaId));
}

export async function blockUser(handle: string): Promise<ActionResult> {
  return asUser(async (t) => {
    await api().profiles.block(t, handle);
  });
}

export async function unblockUser(handle: string): Promise<ActionResult> {
  return asUser((t) => api().profiles.unblock(t, handle));
}

export async function reportProfile(
  handle: string,
  reason: ReportReason,
  details: string,
): Promise<ActionResult> {
  if (!isReason(reason, IN_APP_REASONS)) {
    return { ok: false, error: "Choose a reason." };
  }
  return asUser((t) => api().reports.profile(t, handle, reason, details.trim() || null));
}

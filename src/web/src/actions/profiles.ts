"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { IN_APP_REASONS, isReason } from "@/lib/reasons";
import type { HandleAvailability, ProfileDto, ReportReason } from "@/lib/types";

import { asUser, run } from "./run";

export interface ProfileForm {
  handle: string;
  displayName: string;
  bio: string;
  location: string;
}

export async function checkHandle(handle: string): Promise<ActionResult<HandleAvailability>> {
  const value = handle.trim().replace(/^@/, "");
  if (!value) {
    return { ok: false, error: "Choose a username." };
  }
  return run(() => api().profiles.handleAvailability(value));
}

export async function createProfile(form: ProfileForm): Promise<ActionResult<ProfileDto>> {
  return asUser((t) =>
    api().profiles.create(t, {
      handle: form.handle.trim().replace(/^@/, ""),
      displayName: form.displayName.trim(),
      bio: form.bio.trim() || null,
      location: form.location.trim() || null,
    }),
  );
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
    return api().profiles.update(t, {
      displayName: form.displayName.trim(),
      bio: form.bio.trim() || null,
      location: form.location.trim() || null,
    });
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

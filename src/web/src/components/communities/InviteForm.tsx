"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { inviteToCommunity } from "@/actions/communities";

import { toast } from "../toast";

/** Invite someone by their @handle (Manage → Invited). They're notified and accept or decline. */
export function InviteForm({ slug, isPrivate }: { slug: string; isPrivate: boolean }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="community-invite pad"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await inviteToCommunity(slug, handle);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast(
            result.data.status === "Member"
              ? `${result.data.person.displayName} had asked to join, so they're in`
              : `Invitation sent to ${result.data.person.displayName}`,
          );
          setHandle("");
          router.refresh();
        });
      }}
    >
      <label className="label" htmlFor="invite-handle">
        Invite someone
      </label>
      <div className="row" style={{ gap: 8 }}>
        <input
          id="invite-handle"
          className="input"
          placeholder="@handle"
          autoComplete="off"
          maxLength={41}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={pending || !handle.trim()}>
          {pending ? "…" : "Invite"}
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <span className="help">
        They get a notification and join when they accept.
        {isPrivate ? " Private communities are for adults." : ""}
      </span>
    </form>
  );
}

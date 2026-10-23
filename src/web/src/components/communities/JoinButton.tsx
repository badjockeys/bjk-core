"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { joinCommunity, leaveCommunity } from "@/actions/communities";
import { joinLabel } from "@/lib/communities";
import type { CommunityStanding, CommunityVisibility } from "@/lib/types";

import { toast } from "../toast";

/**
 * Join a public community, or ask to join a private one; "Requested" withdraws the request. Members see "Joined"
 * (leaving is in the community's ⋯ menu).
 */
export function JoinButton({
  slug,
  name,
  standing,
  visibility,
  canJoin,
  size = "sm",
}: {
  slug: string;
  name: string;
  standing: CommunityStanding;
  visibility: CommunityVisibility;
  canJoin: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const label = joinLabel(standing, visibility);
  const cls = `btn${size === "sm" ? " btn-sm" : ""}`;

  if (standing === "Member") {
    return <span className={`${cls} community-joined`}>Joined</span>;
  }
  if (standing === "Banned") {
    return null;
  }
  if (standing === "Requested") {
    return (
      <button
        type="button"
        className={cls}
        disabled={pending}
        aria-label={`Requested. Withdraw your request to join ${name}`}
        onClick={() =>
          start(async () => {
            const result = await leaveCommunity(slug);
            if (!result.ok) {
              toast(result.error);
              return;
            }
            toast("Request withdrawn");
            router.refresh();
          })
        }
      >
        Requested
      </button>
    );
  }
  if (!canJoin) {
    return (
      <span className="small muted" title="Private communities are for adults">
        Adults only
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${cls} btn-primary`}
      disabled={pending}
      aria-label={`${label}: ${name}`}
      onClick={() =>
        start(async () => {
          const result = await joinCommunity(slug);
          if (!result.ok) {
            toast(result.error);
            return;
          }
          toast(
            result.data.standing === "Requested"
              ? "Request sent. An admin or moderator will decide."
              : `You've joined ${name}`,
          );
          router.refresh();
        })
      }
    >
      {pending ? "…" : label}
    </button>
  );
}

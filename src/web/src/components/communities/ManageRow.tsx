"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { decideRequest, removeMember, setMemberRole, unbanMember } from "@/actions/communities";
import type { ActionResult } from "@/lib/action-result";
import { roleLabel } from "@/lib/communities";
import type { CommunityMemberDto, CommunityRole } from "@/lib/types";

import { Avatar } from "../Avatar";
import { toast } from "../toast";

/** One person on the Manage page: approve or decline a request, change a member's role, remove, ban or unban. */
export function ManageRow({
  slug,
  person,
  mode,
  isAdmin,
  isMe,
}: {
  slug: string;
  person: CommunityMemberDto;
  mode: "requests" | "members" | "banned";
  isAdmin: boolean;
  isMe: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const who = person.person.displayName;
  const run = (action: () => Promise<ActionResult>, done: string) =>
    start(async () => {
      const result = await action();
      if (!result.ok) {
        toast(result.error);
        return;
      }
      toast(done);
      router.refresh();
    });

  return (
    <li className="community-person">
      <Avatar name={who} url={person.person.avatarUrl} size="sm" />
      <span className="community-person-name">
        <strong>{who}</strong>
        <span className="small muted">
          {person.person.handle ? `@${person.person.handle}` : ""}
          {roleLabel(person.role) ? ` · ${roleLabel(person.role)}` : ""}
        </span>
      </span>
      <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {mode === "requests" ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={pending}
              aria-label={`Approve ${who}`}
              onClick={() => run(() => decideRequest(slug, person.person.id, true), `${who} has joined`)}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              aria-label={`Decline ${who}`}
              onClick={() => run(() => decideRequest(slug, person.person.id, false), "Request declined")}
            >
              Decline
            </button>
          </>
        ) : null}
        {mode === "members" && !isMe ? (
          <>
            {isAdmin ? (
              <select
                className="input"
                style={{ width: "auto", height: 36 }}
                aria-label={`Role for ${who}`}
                value={person.role}
                disabled={pending}
                onChange={(e) =>
                  run(() => setMemberRole(slug, person.person.id, e.target.value as CommunityRole), `${who}'s role changed`)
                }
              >
                <option value="Member">Member</option>
                <option value="Moderator">Moderator</option>
                <option value="Admin">Admin</option>
              </select>
            ) : null}
            {isAdmin || person.role === "Member" ? (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  aria-label={`Remove ${who}`}
                  onClick={() => run(() => removeMember(slug, person.person.id, false), `${who} was removed`)}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={pending}
                  aria-label={`Ban ${who}`}
                  onClick={() => {
                    if (window.confirm(`Ban ${who}? They won't be able to join or ask again.`)) {
                      run(() => removeMember(slug, person.person.id, true), `${who} was banned`);
                    }
                  }}
                >
                  Ban
                </button>
              </>
            ) : null}
          </>
        ) : null}
        {mode === "banned" ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            aria-label={`Unban ${who}`}
            onClick={() => run(() => unbanMember(slug, person.person.id), `${who} can join again`)}
          >
            Unban
          </button>
        ) : null}
      </span>
    </li>
  );
}

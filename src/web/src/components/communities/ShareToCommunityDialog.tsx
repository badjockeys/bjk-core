"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";

import { shareToCommunities, suggestCommunities } from "@/actions/communities";
import { communityInitials } from "@/lib/communities";
import type { CommunitySuggestionDto } from "@/lib/types";

import { Modal } from "../Modal";
import { toast } from "../toast";

/**
 * "Share to a community" on your own post, after it's up: the same choice the composer offers. Your communities are
 * listed with those covering where it happened first and ticked; ones it's already in are shown as shared. Sharing
 * doesn't copy the post: it stays one public post, also listed in each community.
 */
export function ShareToCommunityDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const titleId = useId();
  const [communities, setCommunities] = useState<CommunitySuggestionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    void suggestCommunities({ postId }).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCommunities(result.data);
      setSelected(result.data.filter((c) => c.recommended && !c.alreadyShared).map((c) => c.id));
    });
    return () => {
      live = false;
    };
  }, [postId]);

  const toggle = (id: string, on: boolean) =>
    setSelected((ids) => (on ? Array.from(new Set([...ids, id])) : ids.filter((s) => s !== id)));

  const share = () =>
    startTransition(async () => {
      const result = await shareToCommunities(postId, selected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast(selected.length === 1 ? "Shared to 1 community" : `Shared to ${selected.length} communities`);
      onClose();
    });

  const available = communities?.filter((c) => !c.alreadyShared) ?? [];

  return (
    <Modal open onClose={onClose} title="Share to a community" titleId={titleId}>
      <p className="small muted" style={{ margin: 0 }}>
        Your post stays public. Sharing also lists it in the community, with the same reactions and comments.
      </p>
      {communities === null && !error ? (
        <p className="muted" role="status">
          Loading your communities…
        </p>
      ) : null}
      {communities !== null && communities.length === 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}>You haven&apos;t joined any communities yet.</p>
          <Link href="/communities" className="btn btn-sm">
            Find communities
          </Link>
        </div>
      ) : null}
      {communities !== null && communities.length > 0 ? (
        <fieldset className="field community-share">
          <legend className="sr-only">Your communities</legend>
          {communities.map((c) => (
            <label
              key={c.id}
              className={`community-share-item${c.recommended && !c.alreadyShared ? " community-share-recommended" : ""}`}
            >
              <input
                type="checkbox"
                checked={c.alreadyShared || selected.includes(c.id)}
                disabled={c.alreadyShared || pending}
                onChange={(e) => toggle(c.id, e.target.checked)}
              />
              <span className="community-badge community-badge-sm" aria-hidden="true">
                {communityInitials(c.name)}
              </span>
              <span className="col" style={{ gap: 0 }}>
                <strong className="small">{c.name}</strong>
                <span
                  className={`small${c.recommended && !c.alreadyShared ? " community-share-why" : " muted"}`}
                >
                  {c.alreadyShared
                    ? "Already shared here"
                    : c.recommended
                      ? `Recommended: covers where this happened${c.visibility === "Private" ? " · private" : ""}`
                      : c.placeName
                        ? "Doesn't cover this place"
                        : "Topic"}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {error ? (
        <p className="small" role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className="spread">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        {available.length > 0 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.length === 0 || pending}
            onClick={share}
          >
            {pending ? "Sharing…" : "Share"}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

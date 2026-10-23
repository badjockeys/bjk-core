"use client";

import { useEffect, useState } from "react";

import { suggestCommunities } from "@/actions/communities";
import { communityInitials } from "@/lib/communities";
import type { CommunitySuggestionDto } from "@/lib/types";

/**
 * "Share with your communities" in the composer (owner, 23 Oct 2026): the communities you've joined, those whose area
 * covers where it happened first and ticked, marked recommended. The post stays public either way.
 */
export function CommunityShareField({
  latitude,
  longitude,
  selected,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [suggestions, setSuggestions] = useState<CommunitySuggestionDto[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const result = await suggestCommunities({ latitude, longitude });
      if (!live || !result.ok) return;
      setSuggestions(result.data);
      // Tick the recommended ones the first time they appear.
      const recommended = result.data.filter((s) => s.recommended).map((s) => s.id);
      if (recommended.length > 0) {
        onChange(Array.from(new Set([...selected, ...recommended])));
      }
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // Only when the place changes: ticking and unticking mustn't fetch again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  if (!suggestions || suggestions.length === 0) {
    return null;
  }
  const shown = showAll ? suggestions : suggestions.slice(0, 3);
  const toggle = (id: string, on: boolean) =>
    onChange(on ? Array.from(new Set([...selected, id])) : selected.filter((s) => s !== id));

  return (
    <fieldset className="field community-share">
      <legend className="label">Share with your communities</legend>
      <span className="small muted">Your post stays public. Sharing adds it to the community too.</span>
      {shown.map((s) => (
        <label key={s.id} className={`community-share-item${s.recommended ? " community-share-recommended" : ""}`}>
          <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
          <span className="community-badge community-badge-sm" aria-hidden="true">
            {communityInitials(s.name)}
          </span>
          <span className="col" style={{ gap: 0 }}>
            <strong className="small">{s.name}</strong>
            <span className={`small${s.recommended ? " community-share-why" : " muted"}`}>
              {s.recommended
                ? `Recommended: covers where this happened${s.visibility === "Private" ? " · private" : ""}`
                : s.placeName
                  ? `Doesn't cover this place`
                  : "Topic"}
            </span>
          </span>
        </label>
      ))}
      {suggestions.length > 3 && !showAll ? (
        <button type="button" className="link small" onClick={() => setShowAll(true)}>
          Show all {suggestions.length} of your communities
        </button>
      ) : null}
    </fieldset>
  );
}

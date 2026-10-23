"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { suggestPassengers } from "@/actions/passengers";
import { connectionLabel, tagQuery } from "@/lib/tag-suggestions";
import type { AuthorDto, TagSuggestionDto } from "@/lib/types";

import { Avatar } from "./Avatar";

/**
 * The passenger box: as you type a name or @username, people drop down to pick (owner, 23 Oct 2026, "like Facebook
 * and Instagram"): those you follow each other with first, then your followers, people you follow, then other
 * members. Arrow keys and Enter, or a tap. Enter without a pick looks up the exact @username instead.
 */
export function PassengerPicker({
  taken,
  busy,
  onPick,
  onExact,
  onCancel,
}: {
  /** Already tagged: left out of the list. */
  taken: string[];
  busy: boolean;
  onPick: (person: AuthorDto) => void;
  /** Enter with nothing picked: look up exactly what's typed. */
  onExact: (handle: string) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [found, setFound] = useState<{ query: string; items: TagSuggestionDto[] }>({ query: "", items: [] });
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const query = tagQuery(typed);

  // Ready to type as soon as "Tag a passenger" is pressed.
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await suggestPassengers(query);
      if (!cancelled && result.ok) {
        setFound({ query, items: result.data });
        setActive(0);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Only answers for what's typed now (an older one can arrive late).
  const items = query && found.query === query ? found.items.filter((p) => !taken.includes(p.id)) : [];
  const open = items.length > 0 && !closed;

  function pick(p: TagSuggestionDto) {
    onPick({ id: p.id, handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl });
    setTyped("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) pick(items[active] ?? items[0]!);
      else if (query) onExact(query);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open) setClosed(true);
      else onCancel();
    }
  }

  return (
    <div className="tag-picker">
      <div className="row" style={{ gap: 8 }}>
        <label className="sr-only" htmlFor="passenger-handle">
          Passenger&apos;s name or username
        </label>
        <input
          ref={input}
          id="passenger-handle"
          className="input"
          type="text"
          placeholder="Name or @username"
          autoComplete="off"
          autoCapitalize="none"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="passenger-suggestions"
          aria-expanded={open}
          aria-activedescendant={open ? `passenger-suggestions-${active}` : undefined}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setClosed(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setClosed(true)}
          onFocus={() => setClosed(false)}
        />
        <button type="button" className="btn btn-sm" disabled={busy || !query} onClick={() => onExact(query)}>
          Add
        </button>
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {open ? (
        <ul id="passenger-suggestions" className="tag-suggest tag-people" role="listbox" aria-label="People to tag">
          {items.map((p, i) => {
            const label = connectionLabel(p.connection);
            return (
              <li
                key={p.id}
                id={`passenger-suggestions-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "tag-suggest-on" : undefined}
                // Keep the field focused: picking happens on the press, before the field would lose focus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
                <span className="tag-person">
                  <b>{p.displayName}</b>
                  <span className="small muted">
                    @{p.handle}
                    {label ? ` · ${label}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

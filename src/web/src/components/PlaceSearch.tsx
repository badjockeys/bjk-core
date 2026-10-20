"use client";

import { useEffect, useId, useRef, useState } from "react";

import { searchPlaces } from "@/actions/places";
import type { PlaceDto } from "@/lib/types";

/**
 * A text box that suggests UK places as you type (towns, villages, postcodes, postcode areas). Typing changes the
 * text (`onText`); choosing a suggestion calls `onPick` with its position.
 */
export function PlaceSearch({
  id,
  value,
  onText,
  onPick,
  placeholder,
  invalid = false,
  maxLength = 100,
}: {
  id?: string;
  value: string;
  onText: (text: string) => void;
  onPick: (place: PlaceDto) => void;
  placeholder?: string;
  invalid?: boolean;
  maxLength?: number;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const listId = `${inputId}-places`;
  const [results, setResults] = useState<PlaceDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || value.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchPlaces(value);
      if (cancelled) return;
      if (!found.ok) {
        setError(found.error);
        setResults([]);
        return;
      }
      setError(null);
      setResults(found.data);
      setActive(-1);
      setOpen(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  const pick = (place: PlaceDto) => {
    typed.current = false;
    setOpen(false);
    setResults([]);
    onPick(place);
  };

  return (
    <div className="place-search">
      <input
        id={inputId}
        className={`input${invalid ? " input-error" : ""}`}
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          typed.current = true;
          onText(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(results[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 ? (
        <ul id={listId} role="listbox" className="place-list">
          {results.map((place, i) => (
            <li
              key={`${place.name}-${place.detail}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "place-option place-active" : "place-option"}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(place);
              }}
            >
              <strong>{place.name}</strong>
              {place.detail ? <span className="small muted"> {place.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}

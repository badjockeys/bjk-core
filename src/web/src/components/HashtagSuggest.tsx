"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { suggestHashtags } from "@/actions/hashtags";
import { insertTag, tagAtCaret } from "@/lib/hashtags";
import type { HashtagSuggestionDto } from "@/lib/types";

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Suggests hashtags as # is typed in a post's title or description (UI step 5): the most used tags starting with what's
 * been typed, chosen with the arrow keys and Enter (or Tab), or a tap. Pass the field's ref, spread `fieldProps` on
 * the field, and render `list` just after it.
 */
export function useHashtagSuggest<T extends Field>({
  id,
  value,
  onChange,
  ref,
}: {
  /** The field's id, to name the list. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The field's ref (the field must use it). */
  ref: RefObject<T | null>;
}): {
  fieldProps: {
    onSelect: () => void;
    onKeyDown: (e: KeyboardEvent<T>) => void;
    onBlur: () => void;
    "aria-autocomplete": "list";
    "aria-controls": string;
    "aria-expanded": boolean;
    "aria-activedescendant": string | undefined;
  };
  list: ReactNode;
} {
  const [token, setToken] = useState<{ start: number; caret: number; prefix: string } | null>(null);
  const [found, setFound] = useState<{ prefix: string; items: HashtagSuggestionDto[] }>({
    prefix: "",
    items: [],
  });
  const [active, setActive] = useState(0);
  const listId = `${id}-hashtags`;
  const prefix = token?.prefix ?? "";

  useEffect(() => {
    if (!prefix) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await suggestHashtags(prefix);
      if (!cancelled && result.ok) {
        setFound({ prefix, items: result.data });
        setActive(0);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [prefix]);

  // Only suggestions for what's typed now (an older answer can arrive late).
  const items = token && found.prefix === prefix ? found.items : [];
  const open = items.length > 0;

  function track() {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const at = el.selectionEnd === caret ? tagAtCaret(el.value, caret) : null;
    setToken(at ? { ...at, caret } : null);
  }

  function choose(tag: string) {
    if (!token) return;
    const next = insertTag(value, token.start, token.caret, tag);
    onChange(next.value);
    setToken(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  function onKeyDown(e: KeyboardEvent<T>) {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(items[active]?.tag ?? items[0]!.tag);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setToken(null);
    }
  }

  const list = open ? (
    <ul id={listId} className="tag-suggest" role="listbox" aria-label="Hashtags">
      {items.map((s, i) => (
        <li
          key={s.tag}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={i === active}
          className={i === active ? "tag-suggest-on" : undefined}
          // Keep the field focused: choosing happens on the press, before the field would lose focus.
          onMouseDown={(e) => {
            e.preventDefault();
            choose(s.tag);
          }}
        >
          <b>#{s.tag}</b>
          <span className="small muted">
            {s.uses.toLocaleString("en-GB")} {s.uses === 1 ? "post" : "posts"}
          </span>
        </li>
      ))}
    </ul>
  ) : null;

  return {
    fieldProps: {
      onSelect: track,
      onKeyDown,
      onBlur: () => setToken(null),
      "aria-autocomplete": "list",
      "aria-controls": listId,
      "aria-expanded": open,
      "aria-activedescendant": open ? `${listId}-${active}` : undefined,
    },
    list,
  };
}

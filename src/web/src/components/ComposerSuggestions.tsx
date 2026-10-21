"use client";

import { useEffect, useRef, useState } from "react";

import {
  getDescription,
  requestDescription,
  suggestTypes,
  type DescribeContext,
} from "@/actions/suggestions";
import { categoryLabel } from "@/lib/categories";
import type { IncidentCategory } from "@/lib/types";

import { PlusIcon, SpinnerIcon } from "./icons";

/**
 * "Looks like: Tailgating": types suggested from the photos or video once they're all ready (CLIP on our own
 * servers). Shown as chips the person taps to add; nothing is ticked for them. Suggestions already chosen are hidden.
 * `onShown` reports every type suggested, so the post records them and we can measure how often they're accepted.
 */
export function TypeSuggestionChips({
  mediaIds,
  chosen,
  onAdd,
  onShown,
}: {
  /** The post's media, only once all of them are ready (empty otherwise). */
  mediaIds: string[];
  chosen: IncidentCategory[];
  onAdd: (type: IncidentCategory) => void;
  onShown: (types: IncidentCategory[]) => void;
}) {
  const [suggestions, setSuggestions] = useState<IncidentCategory[]>([]);
  const key = mediaIds.join(",");
  const shown = useRef(onShown);
  shown.current = onShown;

  useEffect(() => {
    if (!key) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    void suggestTypes(key.split(",")).then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      const types = result.data.suggestions.map((s) => s.type);
      setSuggestions(types);
      if (types.length > 0) {
        shown.current(types);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const open = suggestions.filter((type) => !chosen.includes(type));
  if (open.length === 0) {
    return null;
  }
  return (
    <div className="cmp-suggest" role="group" aria-label="Suggested from your photos or video">
      <span className="small muted">Looks like:</span>
      {open.map((type) => (
        <button
          key={type}
          type="button"
          className="cmp-chip cmp-chip-suggest"
          aria-label={`Add ${categoryLabel(type)}`}
          onClick={() => onAdd(type)}
        >
          <PlusIcon size={14} />
          {categoryLabel(type)}
        </button>
      ))}
    </div>
  );
}

/** How long to keep waiting for a draft: the model may be starting up after a quiet spell. */
const WAIT_MS = 3 * 60_000;
const POLL_MS = 2_000;

/**
 * "Suggest a description": a draft title and description from the post's photos or video (blurred) and what's
 * been filled in, by a vision model on our own servers. The draft only fills the boxes the person left empty;
 * otherwise it's offered to use instead. Up to 10 a day.
 */
export function SuggestDescription({
  mediaIds,
  context,
  title,
  description,
  onUse,
}: {
  /** The post's media, only once all of them are ready (empty otherwise). */
  mediaIds: string[];
  context: DescribeContext;
  title: string;
  description: string;
  onUse: (draft: { title: string | null; description: string | null }) => void;
}) {
  const [state, setState] = useState<"idle" | "working" | "offer">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; description: string } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const ready = mediaIds.length > 0;

  const ask = async () => {
    setState("working");
    setMessage(null);
    setDraft(null);
    const started = await requestDescription(mediaIds, context);
    if (!started.ok) {
      setState("idle");
      setMessage(started.error);
      return;
    }
    setRemaining(started.data.remainingToday);
    const deadline = Date.now() + WAIT_MS;
    let current = started.data;
    while (current.status === "Queued" && Date.now() < deadline && alive.current) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const next = await getDescription(current.id);
      if (!next.ok) {
        break;
      }
      current = next.data;
    }
    if (!alive.current) {
      return;
    }
    if (current.status !== "Ready" || !current.title || !current.description) {
      setState("idle");
      setMessage(
        current.message ??
          "We couldn't suggest a description this time. You can try again, or write your own.",
      );
      return;
    }
    const fillTitle = title.trim().length === 0;
    const fillText = description.trim().length === 0;
    if (fillTitle || fillText) {
      onUse({ title: fillTitle ? current.title : null, description: fillText ? current.description : null });
    }
    if (!fillTitle || !fillText) {
      setDraft({ title: current.title, description: current.description });
      setState("offer");
    } else {
      setState("idle");
      setMessage("Added a suggested title and description. Change anything that isn't right.");
    }
  };

  return (
    <div className="cmp-describe">
      <button
        type="button"
        className="btn btn-sm"
        disabled={!ready || state === "working" || remaining === 0}
        onClick={() => void ask()}
        title={ready ? undefined : "Available once your photos or video have finished processing"}
      >
        {state === "working" ? <SpinnerIcon /> : null}
        {state === "working" ? "Writing a suggestion…" : "Suggest a description"}
      </button>
      {remaining !== null ? (
        <span className="small muted">
          {remaining === 0 ? "No more suggestions today" : `${remaining} left today`}
        </span>
      ) : null}
      {message ? (
        <p className="small muted" role="status">
          {message}
        </p>
      ) : null}
      {state === "offer" && draft ? (
        <div className="cmp-draft" role="status">
          <p className="small">
            <strong>{draft.title}</strong>
          </p>
          <p className="small">{draft.description}</p>
          <div className="row">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onUse({ title: draft.title, description: draft.description });
                setState("idle");
                setDraft(null);
              }}
            >
              Use this
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setState("idle");
                setDraft(null);
              }}
            >
              Keep mine
            </button>
          </div>
        </div>
      ) : null}
      <p className="small muted">
        A suggestion only: check it says what happened. It never names anyone or says who&apos;s at fault.
      </p>
    </div>
  );
}

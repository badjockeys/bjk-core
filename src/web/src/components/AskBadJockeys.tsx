"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { askChat, getChatUsage } from "@/actions/chat";
import { allowanceLabel, entryId, historyFor, mapHref, MAX_QUESTION, type ChatEntry } from "@/lib/chat";
import { signInPath } from "@/lib/paths";
import type { ChatUsageDto } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";

import { ChatCard } from "./ChatCard";
import { AskIcon, CloseIcon, MapIcon, SendIcon, SpinnerIcon } from "./icons";

/** Any Ask button opens the one window on the page through this event. */
const OPEN_EVENT = "bjk:ask-open";

/** Where the window keeps this tab's conversation, so it survives moving between pages (never shared or stored). */
const STORAGE_KEY = "bjk-ask";

function openAsk() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** An Ask button: the desktop navigation item, or the floating button on phones. */
export function AskButton({ variant }: { variant: "nav" | "fab" }) {
  if (variant === "fab") {
    return (
      <button type="button" className="ask-fab m-only" onClick={openAsk} aria-haspopup="dialog">
        <AskIcon size={20} />
        <span>Ask</span>
      </button>
    );
  }
  return (
    <button type="button" className="nav-i nav-btn" onClick={openAsk} aria-haspopup="dialog">
      <AskIcon size={26} />
      Ask Bad Jockeys
    </button>
  );
}

interface Saved {
  userId: string | null;
  entries: ChatEntry[];
}

function load(userId: string | null): ChatEntry[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
    // Only this member's conversation, and only finished turns (a question in flight when the page changed is lost).
    return saved && saved.userId === userId && Array.isArray(saved.entries)
      ? saved.entries.filter((e) => e.answer !== null || e.error !== null)
      : [];
  } catch {
    return [];
  }
}

function save(userId: string | null, entries: ChatEntry[]) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userId, entries: entries.slice(-20) } satisfies Saved),
    );
  } catch {
    // Private browsing or storage full: the conversation just won't survive a page change.
  }
}

/**
 * Ask Bad Jockeys, the Premium AI chat: a panel on the right on desktop, a full-height sheet on phones. Premium and
 * Premium + members ask questions about reported bad driving and get a sentence or two, a card drawn from the figures
 * and follow-up suggestions. Free members see the locked preview with example questions about their own area (the API
 * tailors them to the home area). History lives only in this tab.
 */
export function AskBadJockeys({ viewer }: { viewer: Viewer }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<ChatUsageDto | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  // The conversation is read back from this tab the first time the window opens (not while rendering, where the
  // server has no sessionStorage), and saved as it changes after that.
  const restored = useRef(false);
  const [question, setQuestion] = useState("");
  const pending = entries.some((e) => e.answer === null && e.error === null);

  // Open from any Ask button.
  useEffect(() => {
    const show = () => {
      if (!restored.current) {
        restored.current = true;
        setEntries(load(viewer.userId));
      }
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, [viewer.userId]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
      input.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  useEffect(() => {
    if (restored.current) {
      save(viewer.userId, entries);
    }
  }, [entries, viewer.userId]);

  // The allowance and examples each time the window opens (they change with the plan, home area and the day).
  useEffect(() => {
    if (!open) {
      return;
    }
    let current = true;
    void getChatUsage().then((result) => {
      if (!current) {
        return;
      }
      if (result.ok) {
        setUsage(result.data);
        setUsageError(null);
      } else {
        setUsageError(result.error);
      }
    });
    return () => {
      current = false;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      end.current?.scrollIntoView?.({ block: "end" });
    }
  }, [entries, open]);

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || pending) {
        return;
      }
      const id = entryId();
      const history = historyFor(entries);
      setEntries((list) => [...list, { id, question: q, answer: null, token: null, error: null }]);
      setQuestion("");
      const result = await askChat(q, history);
      setEntries((list) =>
        list.map((e) =>
          e.id !== id
            ? e
            : result.ok
              ? { ...e, answer: result.data.answer, token: result.data.turnToken }
              : { ...e, error: result.error },
        ),
      );
      if (result.ok) {
        setUsage(result.data.usage);
      } else if (result.problem === "limit" || result.problem === "paused") {
        // Show the true state (paused, or none left) rather than a stale count.
        void getChatUsage().then((r) => r.ok && setUsage(r.data));
      }
      input.current?.focus();
    },
    [entries, pending],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(question);
    }
  };

  const canAsk = !!usage?.canAsk && !usage.paused && usage.remaining > 0;
  const locked = usage !== null && !usage.canAsk;
  const examples = usage?.exampleQuestions ?? [];
  const last = entries[entries.length - 1];

  return (
    <dialog
      ref={dialog}
      className="chat-panel"
      aria-labelledby="ask-title"
      onClose={() => setOpen(false)}
      onClick={(event) => {
        if (event.target === dialog.current) {
          setOpen(false); // a click on the backdrop
        }
      }}
    >
      <div className="chat-frame">
        <header className="chat-head">
          <AskIcon size={26} />
          <div className="chat-head-text">
            <h2 id="ask-title" className="h2">
              Ask Bad Jockeys
            </h2>
            <span className="small muted" aria-live="polite">
              {usage ? allowanceLabel(usage) : " "}
            </span>
          </div>
          {entries.length > 0 && !pending ? (
            <button type="button" className="btn btn-sm" onClick={() => setEntries([])}>
              New chat
            </button>
          ) : null}
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
            <CloseIcon />
          </button>
        </header>

        <div className="chat-body" aria-live="polite" aria-busy={pending}>
          {entries.length === 0 ? (
            <div className="chat-intro stack">
              <p>
                Ask about bad driving and parking reported on Bad Jockeys: how many, where, when, and whether
                it&apos;s getting worse.
              </p>
              {usageError ? <p className="small chat-error">{usageError}</p> : null}
              {usage === null && !usageError ? (
                <div className="centre" role="status">
                  <SpinnerIcon size={24} />
                  <span className="sr-only">Loading</span>
                </div>
              ) : null}
              {examples.length > 0 ? (
                <div className="chat-examples">
                  <span className="small muted">
                    {locked ? "Premium members can ask things like:" : "Try asking:"}
                  </span>
                  {examples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="chat-chip"
                      disabled={!canAsk || pending}
                      onClick={() => void ask(example)}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              ) : null}
              {locked ? <Locked viewer={viewer} /> : null}
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="chat-turn">
                <p className="chat-q">{entry.question}</p>
                {entry.error ? (
                  <p className="chat-a chat-error">{entry.error}</p>
                ) : entry.answer === null ? (
                  <p className="chat-a chat-thinking" role="status">
                    <SpinnerIcon size={18} /> Working it out…
                  </p>
                ) : (
                  <div className={`chat-a chat-${entry.answer.kind.toLowerCase()}`}>
                    <p>{entry.answer.text}</p>
                    {entry.answer.card ? <ChatCard card={entry.answer.card} /> : null}
                    <MapLink href={mapHref(entry.answer.map)} onOpen={() => setOpen(false)} />
                    {entry === last && entry.answer.suggestions.length > 0 ? (
                      <div className="chat-suggestions">
                        {entry.answer.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="chat-chip"
                            disabled={!canAsk || pending}
                            onClick={() => void ask(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={end} />
        </div>

        <form className="chat-form" onSubmit={submit}>
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="ask-input"
            ref={input}
            rows={1}
            value={question}
            maxLength={MAX_QUESTION}
            placeholder={locked ? "Ask Bad Jockeys is part of Premium" : "Ask about bad driving near you…"}
            disabled={!canAsk}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className="chat-send"
            aria-label="Ask"
            disabled={!canAsk || pending || question.trim().length === 0}
          >
            <SendIcon size={20} />
          </button>
        </form>
        <p className="chat-small small muted">
          Answers come from reports on Bad Jockeys. Figures from fewer than 3 reports are hidden, and it
          can&apos;t look up people or number plates.
          {question.length > MAX_QUESTION - 100 ? ` ${MAX_QUESTION - question.length} characters left.` : ""}
        </p>
      </div>
    </dialog>
  );
}

function MapLink({ href, onOpen }: { href: string | null; onOpen: () => void }) {
  if (!href) {
    return null;
  }
  return (
    <Link href={href} className="chat-map-link" onClick={onOpen}>
      <MapIcon size={18} />
      Open on the map
    </Link>
  );
}

function Locked({ viewer }: { viewer: Viewer }) {
  if (!viewer.signedIn) {
    return (
      <div className="chat-locked">
        <strong>Sign in to ask Bad Jockeys</strong>
        <a className="btn btn-primary btn-sm" href={signInPath("/")}>
          Sign in
        </a>
      </div>
    );
  }
  return (
    <div className="chat-locked">
      <strong>Ask Bad Jockeys is part of Premium</strong>
      <span className="small muted">
        Premium members ask about their own area: the worst roads, the busiest times and whether it&apos;s
        getting better.
      </span>
      <Link className="btn btn-primary btn-sm" href="/premium">
        See Premium
      </Link>
    </div>
  );
}

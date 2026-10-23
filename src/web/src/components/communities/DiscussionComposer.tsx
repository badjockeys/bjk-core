"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startDiscussion } from "@/actions/communities";
import { discussionPath } from "@/lib/communities";

/** "Start a discussion": a title and some text, for members. Opens the new discussion. */
export function DiscussionComposer({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="community-start" onClick={() => setOpen(true)}>
        Start a discussion…
      </button>
    );
  }

  return (
    <form
      className="stack community-start-form"
      aria-label="Start a discussion"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await startDiscussion(slug, title.trim(), body.trim());
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(discussionPath(slug, result.data.id));
        });
      }}
    >
      <label className="field">
        <span className="label">Title</span>
        <input
          className="input"
          value={title}
          maxLength={120}
          required
          placeholder="e.g. Anyone else nearly hit at the Worsley roundabout?"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">
          More detail <span className="muted">(optional)</span>
        </span>
        <textarea
          className="textarea"
          rows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <p className="small muted">No number plates, names or addresses.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !title.trim()}>
          Post discussion
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";

import { setVoteDuration } from "@/actions/engagement";
import type { VoteDuration } from "@/lib/types";
import { VOTE_DURATION_LABEL } from "@/lib/votes";

const OPTIONS: VoteDuration[] = ["Hours48", "Days7", "Never"];

/** When voting on your new posts closes. Posts you've already made keep their closing time. */
export function VoteDurationForm({ initial }: { initial: VoteDuration }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      setError(null);
      setStatus(null);
      const result = await setVoteDuration(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValue(result.data);
      setStatus("Saved.");
    });
  };

  return (
    <form className="pad stack" onSubmit={save}>
      <p className="muted small">
        People can vote on each post: &ldquo;Who&apos;s at fault?&rdquo; for incidents between road users, or
        &ldquo;How bad was it?&rdquo; for everything else. When voting closes, you and everyone following the post
        are told the result. This applies to posts you make from now on.
      </p>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="fieldset-title">Voting on my posts closes</legend>
        {OPTIONS.map((option) => (
          <label key={option} className="row" style={{ gap: 10 }}>
            <input
              type="radio"
              name="voteDuration"
              value={option}
              checked={value === option}
              onChange={() => {
                setStatus(null);
                setValue(option);
              }}
            />
            {VOTE_DURATION_LABEL[option]}
          </label>
        ))}
      </fieldset>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {status ? (
          <span className="help" role="status">
            {status}
          </span>
        ) : null}
      </div>
    </form>
  );
}

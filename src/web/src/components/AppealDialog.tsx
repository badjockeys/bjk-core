"use client";

import { useId, useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import { Modal } from "./Modal";
import { toast } from "./toast";

/** Ask for a moderator's decision to be looked at again. One appeal per post or comment. */
export function AppealButton({
  what,
  submit,
}: {
  what: string;
  submit: (statement: string) => Promise<ActionResult<{ reference: string }>>;
}) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleId = useId();

  if (done) {
    return <p className="small muted">Appeal sent (reference {done}). We&apos;ll email you the outcome.</p>;
  }

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Appeal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Appeal: your ${what}`} titleId={titleId}>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await submit(statement);
              if (result.ok) {
                setDone(result.data.reference);
                setOpen(false);
                toast(`Appeal sent. Reference ${result.data.reference}`);
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <p className="muted">
            A different moderator will look at it again and email you the outcome. You can appeal once.
          </p>
          <label className="field">
            <span className="label">Why should the decision change?</span>
            <textarea
              className="textarea"
              rows={4}
              maxLength={2000}
              required
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
            />
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Sending…" : "Send appeal"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

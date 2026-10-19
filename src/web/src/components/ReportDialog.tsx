"use client";

import { useId, useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { followBlocker } from "@/lib/blockers";
import { IN_APP_REASONS } from "@/lib/reasons";
import type { ReportReason } from "@/lib/types";

import { Modal } from "./Modal";
import { toast } from "./toast";

/** Screen 07: report a post, comment or profile. The person reported isn't told who reported them. */
export function ReportDialog({
  open,
  onClose,
  what,
  submit,
}: {
  open: boolean;
  onClose: () => void;
  /** "post", "comment" or "profile". */
  what: string;
  submit: (reason: ReportReason, details: string) => Promise<ActionResult>;
}) {
  const titleId = useId();
  const [reason, setReason] = useState<ReportReason>("PersonalInformation");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submit(reason, details);
      if (result.ok) {
        onClose();
        setDetails("");
        toast("Thanks. Our moderators will review it.");
      } else if (!followBlocker(result.blocker)) {
        setError(result.error);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Report this ${what}`} titleId={titleId}>
      <form className="stack" onSubmit={onSubmit}>
        <p className="muted">
          Our moderators will review it. The {what === "profile" ? "person" : "poster"} won&apos;t know who
          reported it.
        </p>
        <fieldset className="field">
          <legend className="label">Why are you reporting it?</legend>
          <div className="col">
            {IN_APP_REASONS.map((r) => (
              <label key={r.value} className="radio">
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span className="label">
            Anything else? <span className="muted">(optional)</span>
          </span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Sending…" : "Send report"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

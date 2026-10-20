"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { submitPublicReport } from "@/actions/reports";
import { longDate } from "@/lib/format";
import { PUBLIC_REASONS } from "@/lib/reasons";
import type { ReportReason, ReportReceipt } from "@/lib/types";

import { TickIcon } from "./icons";
import { Turnstile } from "./Turnstile";

/** Screen 23: "Report content / I'm in this clip". Anyone can use it; no account needed. */
export function PublicReportForm({ siteKey, initialTarget }: { siteKey: string; initialTarget: string }) {
  const [target, setTarget] = useState(initialTarget);
  const [reason, setReason] = useState<ReportReason>("InThisClip");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaRound, setCaptchaRound] = useState(0);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [pending, startTransition] = useTransition();

  if (receipt) {
    return (
      <div className="stack" role="status">
        <div className="row">
          <TickIcon />
          <h2 className="h2">Thanks, we&apos;ve got your report</h2>
        </div>
        <p>
          Your reference is <strong>{receipt.reference}</strong>.{" "}
          {receipt.priority === "Urgent"
            ? "We treat this as urgent and will look at it within hours."
            : `We'll look at it by ${longDate(receipt.respondBy)}.`}
        </p>
        <p className="muted">
          {receipt.acknowledgementSent
            ? "We've emailed you a copy, and we'll email you again with what we did."
            : "We'll email you with what we did."}
        </p>
      </div>
    );
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <form
      className="stack"
      style={{ gap: 18 }}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setErrors({});
        setError(null);
        startTransition(async () => {
          const result = await submitPublicReport({
            target,
            reason,
            details,
            name,
            email,
            consent,
            captchaToken,
          });
          // The CAPTCHA token can only be used once: get a fresh one whatever happened.
          setCaptchaToken("");
          setCaptchaRound((n) => n + 1);
          if (result.ok) {
            setReceipt(result.data);
          } else {
            setErrors(result.fieldErrors ?? {});
            setError(result.error);
          }
        });
      }}
    >
      <p className="muted">
        No account needed. Tell us what&apos;s wrong and we&apos;ll look at it. Urgent reports about threats
        or illegal content are reviewed within hours; everything else within 48 hours.
      </p>
      <label className="field">
        <span className="label">Link to the post</span>
        <input
          className={`input${fieldError("target") ? " input-error" : ""}`}
          type="text"
          inputMode="url"
          required
          placeholder="https://badjockeys.com/p/…"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        {fieldError("target") ? <span className="error">{fieldError("target")}</span> : null}
      </label>
      <fieldset className="field">
        <legend className="label">What&apos;s the problem?</legend>
        <div className="col">
          {PUBLIC_REASONS.map((r) => (
            <label key={r.value} className="radio">
              <input
                type="radio"
                name="why"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="label">Tell us more</span>
        <textarea
          className={`textarea${fieldError("details") ? " input-error" : ""}`}
          rows={3}
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        {fieldError("details") ? <span className="error">{fieldError("details")}</span> : null}
      </label>
      <div className="facts">
        <label className="field">
          <span className="label">Your name</span>
          <input
            className={`input${fieldError("reporterName") ? " input-error" : ""}`}
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {fieldError("reporterName") ? <span className="error">{fieldError("reporterName")}</span> : null}
        </label>
        <label className="field">
          <span className="label">Email</span>
          <input
            className={`input${fieldError("reporterEmail") ? " input-error" : ""}`}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldError("reporterEmail") ? <span className="error">{fieldError("reporterEmail")}</span> : null}
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I confirm this report is true to the best of my knowledge. We&apos;ll use your details only to
          handle it (<Link href="/privacy">privacy notice</Link>).
        </span>
      </label>
      {fieldError("consent") ? <span className="error">{fieldError("consent")}</span> : null}
      {siteKey ? (
        <Turnstile siteKey={siteKey} onToken={setCaptchaToken} resetKey={captchaRound} />
      ) : (
        <p className="help">The security check isn&apos;t set up on this server (TURNSTILE_SITE_KEY).</p>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending || !captchaToken}>
        {pending ? "Sending…" : captchaToken ? "Send report" : "Waiting for the security check…"}
      </button>
      <p className="small muted">
        We&apos;ll email you to confirm we&apos;ve received it, and again with what we did. You can also email{" "}
        <a className="link" href="mailto:legal@badjockeys.com">
          legal@badjockeys.com
        </a>
        .
      </p>
    </form>
  );
}

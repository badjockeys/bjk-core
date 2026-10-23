"use client";

import { useState } from "react";

import { plural } from "@/lib/format";
import {
  daysSince,
  DASHCAM_PORTAL_URL,
  guessNation,
  NATIONS,
  REPORT_WITHIN_DAYS,
  type Nation,
} from "@/lib/police";

import { ExternalIcon, ShieldIcon } from "./icons";
import { Modal } from "./Modal";

/**
 * "Report to the police" under your own post (owner feedback, 22 Oct 2026, item 12). The pop-up confirms where it
 * happened, then says where to send the footage: the National Dash Cam Safety Portal in England and Wales, or 101 in
 * Scotland and Northern Ireland. The poster sends their own original file (ours is blurred and silent, and they're
 * the witness); nothing is sent or recorded by Bad Jockeys.
 */
export function PoliceReport({
  postId,
  placeName,
  latitude,
  longitude,
  incidentAt,
}: {
  postId: string;
  placeName: string | null;
  latitude: number;
  longitude: number;
  incidentAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [nation, setNation] = useState<Nation>(() => guessNation(latitude, longitude));
  const titleId = `police-${postId}`;
  const days = daysSince(incidentAt);
  const late = days > REPORT_WITHIN_DAYS;

  return (
    <>
      <button type="button" className="btn btn-sm police-btn" onClick={() => setOpen(true)}>
        <ShieldIcon />
        Report to the police
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report it to the police" titleId={titleId}>
        <fieldset className="stack police-where">
          <legend className="label">Where did it happen?</legend>
          {placeName ? <p className="police-place">{placeName}</p> : null}
          <div className="stack" style={{ gap: 8 }}>
            {NATIONS.map((n) => (
              <label key={n.value} className="check">
                <input
                  type="radio"
                  name={`${titleId}-nation`}
                  value={n.value}
                  checked={nation === n.value}
                  onChange={() => setNation(n.value)}
                />
                <span>{n.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {nation === "england-wales" ? (
          <div className="stack">
            <p>
              Send your footage through the <strong>National Dash Cam Safety Portal</strong>. It&apos;s free,
              and it passes your footage to the police force for where it happened.
            </p>
            <a href={DASHCAM_PORTAL_URL} target="_blank" rel="noreferrer" className="btn btn-primary">
              Open the National Dash Cam Safety Portal
              <ExternalIcon />
            </a>
          </div>
        ) : (
          <div className="stack">
            <p>
              {nation === "scotland" ? "Police Scotland" : "The Police Service of Northern Ireland"}{" "}
              doesn&apos;t take footage through the national portal. <strong>Call 101</strong> and
              they&apos;ll tell you how to send it.
            </p>
            <a href="tel:101" className="btn btn-primary">
              Call 101
            </a>
          </div>
        )}

        <ul className="police-tips small">
          <li>
            <strong>Send your original file</strong>, straight from your dash cam or phone and unedited. The
            copy on Bad Jockeys has faces and number plates blurred and no sound, so the police can&apos;t use
            it.
          </li>
          <li>
            <strong>Send it soon.</strong> Forces usually ask for footage within 7 to 14 days.{" "}
            {days === 0 ? "This happened today." : `This happened ${plural(days, "day")} ago.`}
            {late ? " It may be too late for some offences, but they may still want it." : null}
          </li>
          <li>You&apos;re the witness, so you may be asked for a statement.</li>
          <li>
            If someone is hurt or in danger now, <strong>call 999</strong>.
          </li>
        </ul>
        <p className="small muted">
          Bad Jockeys doesn&apos;t send anything to the police or keep a record of this.
        </p>
      </Modal>
    </>
  );
}

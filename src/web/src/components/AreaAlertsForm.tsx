"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { saveAreaAlerts, setHomeArea } from "@/actions/places";
import type { AreaAlertMode, AreaSettingsDto } from "@/lib/types";

import { PlaceSearch } from "./PlaceSearch";

/** Home area and Premium area alerts: radius, daily summary or instant, email. */
export function AreaAlertsForm({ initial }: { initial: AreaSettingsDto }) {
  const [area, setArea] = useState(initial);
  const [changing, setChanging] = useState(!initial.placeName);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (change: Partial<Pick<AreaSettingsDto, "enabled" | "radiusKm" | "mode" | "email">>) => {
    setStatus(null);
    setArea((current) => ({ ...current, ...change }));
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await saveAreaAlerts({
        enabled: area.enabled,
        radiusKm: area.radiusKm,
        mode: area.mode,
        email: area.email,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setArea(result.data);
      setStatus("Saved.");
    });
  };

  return (
    <section className="pad stack area-alerts" aria-labelledby="area-alerts-title">
      <h2 id="area-alerts-title" className="h2">
        Area alerts
      </h2>
      <p className="muted small">
        Hear about bad driving posted near home. Your home area is private and kept to about 1 km; only its
        name shows on your profile.
      </p>

      <div className="field">
        <span className="label">Home area</span>
        {changing ? (
          <>
            <label className="sr-only" htmlFor="home-area">
              Home area
            </label>
            <PlaceSearch
              id="home-area"
              value={text}
              placeholder="Start typing a town or postcode"
              onText={setText}
              onPick={(place) =>
                startTransition(async () => {
                  const result = await setHomeArea(place);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setArea(result.data);
                  setChanging(false);
                  setText("");
                })
              }
            />
          </>
        ) : (
          <div className="row" style={{ gap: 12 }}>
            <strong>{area.placeName}</strong>
            <button type="button" className="link" onClick={() => setChanging(true)}>
              Change
            </button>
          </div>
        )}
      </div>

      {!area.canUseAlerts ? (
        <p className="notice">
          Area alerts are part of Premium.{" "}
          <Link href="/premium" className="link">
            See Premium
          </Link>
        </p>
      ) : area.placeName ? (
        <form className="stack" onSubmit={save}>
          <label className="check">
            <input
              type="checkbox"
              className="switch"
              checked={area.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            <span>Tell me about new posts near {area.placeName}</span>
          </label>

          <fieldset className="field road-user" disabled={!area.enabled}>
            <legend className="label">Within</legend>
            <div className="row row-wrap" style={{ gap: 8 }}>
              {area.radiuses.map((km) => (
                <label key={km} className={`pill-choice${area.radiusKm === km ? " pill-on" : ""}`}>
                  <input
                    type="radio"
                    name="radius"
                    checked={area.radiusKm === km}
                    onChange={() => update({ radiusKm: km })}
                  />
                  {km} km
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field road-user" disabled={!area.enabled}>
            <legend className="label">How often</legend>
            {(
              [
                ["Digest", "A daily summary at 8am"],
                ["Instant", `As they're posted (up to ${area.instantDailyCap} a day, none 10pm to 7am)`],
              ] as [AreaAlertMode, string][]
            ).map(([mode, label]) => (
              <label key={mode} className="check">
                <input
                  type="radio"
                  name="mode"
                  checked={area.mode === mode}
                  onChange={() => update({ mode })}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <label className="check">
            <input
              type="checkbox"
              checked={area.email}
              disabled={!area.enabled}
              onChange={(e) => update({ email: e.target.checked })}
            />
            <span>Email them to me as well</span>
          </label>

          <div className="row" style={{ gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save area alerts"}
            </button>
            {status ? (
              <span className="help" role="status">
                {status}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="small muted">
        Place search uses postcodes.io. Contains OS data © Crown copyright and database right.
      </p>
    </section>
  );
}

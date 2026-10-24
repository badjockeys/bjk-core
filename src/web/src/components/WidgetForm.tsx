"use client";

import { useEffect, useState, useTransition } from "react";

import { createWidget, previewWidget, updateWidget } from "@/actions/dashboard";
import { categoriesIn, categoryLabel, GROUPS } from "@/lib/categories";
import {
  MAX_WIDGET_TYPES,
  PERIODS,
  RADIUSES,
  shortPeriod,
  WIDGET_KINDS,
  widgetRequest,
} from "@/lib/dashboard";
import type {
  DashboardDto,
  DashboardItemDto,
  DashboardKind,
  DashboardWidgetDataDto,
  IncidentCategory,
} from "@/lib/types";

import { CloseIcon } from "./icons";
import { Modal } from "./Modal";
import { PlaceSearch } from "./PlaceSearch";
import { WidgetFigures } from "./WidgetCard";

/**
 * "Add a widget" (or change one): what it shows, the place (a postcode or town), the radius, the period and any types,
 * with a preview of its figures as they'd be now.
 */
export function WidgetForm({
  item,
  onClose,
  onSaved,
}: {
  item: DashboardItemDto | null;
  onClose: () => void;
  onSaved: (dashboard: DashboardDto) => void;
}) {
  const [kind, setKind] = useState<DashboardKind>(item?.kind ?? "AreaIncidents");
  const [placeName, setPlaceName] = useState(item?.placeName ?? "");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    item?.latitude != null && item.longitude != null ? { lat: item.latitude, lng: item.longitude } : null,
  );
  const [radiusKm, setRadiusKm] = useState(item?.radiusKm ?? 2);
  const [periodDays, setPeriodDays] = useState(item?.periodDays ?? 30);
  const [types, setTypes] = useState<IncidentCategory[]>(item?.types ?? []);
  const [preview, setPreview] = useState<DashboardWidgetDataDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const request = widgetRequest({
    kind,
    placeName,
    latitude: point?.lat ?? null,
    longitude: point?.lng ?? null,
    radiusKm,
    periodDays,
    types,
  });
  const key = request ? JSON.stringify(request) : null;
  const maxTypes = kind === "TypeTrend" ? 1 : MAX_WIDGET_TYPES;

  // The preview follows the settings, a moment after they stop changing.
  useEffect(() => {
    if (!key) return;
    let live = true;
    const timer = setTimeout(() => {
      void previewWidget(JSON.parse(key)).then((result) => {
        if (!live) return;
        if (result.ok) {
          setPreview(result.data);
          setPreviewError(null);
        } else {
          setPreviewError(result.error);
        }
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]);

  const chooseKind = (next: DashboardKind) => {
    setKind(next);
    if (next === "TypeTrend") setTypes((t) => t.slice(0, 1));
  };

  const addType = (type: IncidentCategory) => {
    setTypes((current) =>
      kind === "TypeTrend"
        ? [type]
        : current.includes(type)
          ? current
          : [...current, type].slice(0, MAX_WIDGET_TYPES),
    );
  };

  const save = () =>
    startSaving(async () => {
      if (!request) {
        setError(
          kind === "TypeTrend" && types.length === 0
            ? "Choose the type of bad driving to follow."
            : "Choose a place from the list.",
        );
        return;
      }
      setError(null);
      const result = item?.id ? await updateWidget(item.id, request) : await createWidget(request);
      if (result.ok) onSaved(result.data);
      else setError(result.error);
    });

  return (
    <Modal open onClose={onClose} title={item ? "Change widget" : "Add a widget"} titleId="widget-form-title">
      <fieldset className="field">
        <legend className="label">What to show</legend>
        <div className="row row-wrap" style={{ gap: 8 }}>
          {WIDGET_KINDS.map((k) => (
            <label key={k.kind} className={`pill-choice${kind === k.kind ? " pill-on" : ""}`} title={k.hint}>
              <input
                type="radio"
                name="widget-kind"
                checked={kind === k.kind}
                onChange={() => chooseKind(k.kind)}
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="widget-place">
          Where
        </label>
        <PlaceSearch
          id="widget-place"
          value={placeName}
          placeholder="A postcode or town, e.g. L34 5 or Prescot"
          onText={(text) => {
            setPlaceName(text);
            setPoint(null);
          }}
          onPick={(place) => {
            setPlaceName(place.name);
            setPoint({ lat: place.latitude, lng: place.longitude });
          }}
        />
        <span className="help">
          Pick it from the list. Figures are for the area around it, never a single spot.
        </span>
      </div>

      <fieldset className="field">
        <legend className="label">Within</legend>
        <div className="row row-wrap" style={{ gap: 8 }}>
          {RADIUSES.map((r) => (
            <label key={r} className={`pill-choice${radiusKm === r ? " pill-on" : ""}`}>
              <input
                type="radio"
                name="widget-radius"
                checked={radiusKm === r}
                onChange={() => setRadiusKm(r)}
              />
              {r} km
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="label">Period</legend>
        <div className="row row-wrap" style={{ gap: 8 }}>
          {PERIODS.map((d) => (
            <label key={d} className={`pill-choice${periodDays === d ? " pill-on" : ""}`}>
              <input
                type="radio"
                name="widget-period"
                checked={periodDays === d}
                onChange={() => setPeriodDays(d)}
              />
              {shortPeriod(d)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="widget-type">
          {kind === "TypeTrend" ? "Type of bad driving" : `Types (optional, up to ${MAX_WIDGET_TYPES})`}
        </label>
        {types.length > 0 ? (
          <div className="cmp-chips">
            {types.map((t) => (
              <span key={t} className="cmp-chip cmp-chip-on">
                {categoryLabel(t)}
                <button
                  type="button"
                  className="cmp-chip-x"
                  aria-label={`Remove ${categoryLabel(t)}`}
                  onClick={() => setTypes((current) => current.filter((x) => x !== t))}
                >
                  <CloseIcon size={12} color="#FFFFFF" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {types.length < maxTypes || kind === "TypeTrend" ? (
          <select
            id="widget-type"
            className="input"
            value=""
            onChange={(e) => {
              if (e.target.value) addType(e.target.value as IncidentCategory);
            }}
          >
            <option value="">
              {kind === "TypeTrend" ? "Choose a type" : "All types (add one to narrow it)"}
            </option>
            {GROUPS.map((g) => (
              <optgroup key={g.value} label={g.label}>
                {categoriesIn(g.value).map((c) => (
                  <option key={c.value} value={c.value} disabled={types.includes(c.value)}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : null}
      </div>

      <section className="widget-preview" aria-label="Preview" aria-live="polite">
        <span className="small muted">Preview</span>
        {!request ? (
          <p className="small muted">
            {point === null ? "Choose a place to see the figures." : "Choose the type to see the figures."}
          </p>
        ) : previewError ? (
          <p className="small error">{previewError}</p>
        ) : preview ? (
          <WidgetFigures data={preview} />
        ) : (
          <p className="small muted">Counting…</p>
        )}
      </section>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={save}>
          {saving ? "Saving…" : item ? "Save changes" : "Add widget"}
        </button>
      </div>
    </Modal>
  );
}

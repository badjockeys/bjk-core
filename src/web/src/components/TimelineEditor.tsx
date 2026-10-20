"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { createTimeline, deleteTimeline, reorderTimelines, updateTimeline } from "@/actions/timelines";
import { CATEGORY_CHOICES, categoryLabel } from "@/lib/categories";
import { TIMELINE_RADIUSES, describeTimeline, moveItem, planName } from "@/lib/timelines";
import type { IncidentCategory, PlaceDto, TimelineDto, TimelineRequest, TimelinesDto } from "@/lib/types";

import { PlaceSearch } from "./PlaceSearch";
import { toast } from "./toast";

const EMPTY: TimelineRequest = {
  name: "",
  types: [],
  placeName: null,
  latitude: null,
  longitude: null,
  radiusKm: null,
};

/**
 * Your custom timelines (UI step 6): add one (a name, one or more types of bad driving, and optionally a place and
 * radius), change, delete or reorder them. How many depends on the plan: Free 1, Premium 5, Premium + 10.
 */
export function TimelineEditor({ initial }: { initial: TimelinesDto }) {
  const router = useRouter();
  const [list, setList] = useState(initial.timelines);
  const [editing, setEditing] = useState<string | "new" | null>(
    initial.timelines.length === 0 ? "new" : null,
  );
  const [pending, startTransition] = useTransition();
  const full = list.length >= initial.limit;

  function move(index: number, by: -1 | 1) {
    const next = moveItem(list, index, index + by);
    if (next === list) return;
    setList(next);
    startTransition(async () => {
      const result = await reorderTimelines(next.map((t) => t.id));
      if (!result.ok) {
        setList(list);
        toast(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(t: TimelineDto) {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteTimeline(t.id);
      if (!result.ok) {
        toast(result.error);
        return;
      }
      setList((l) => l.filter((x) => x.id !== t.id));
      toast("Timeline deleted");
      router.refresh();
    });
  }

  return (
    <div className="stack pad" style={{ gap: 16 }}>
      <p className="muted">
        Your own tabs next to For you and Following: posts with the types of bad driving you choose, anywhere
        or near a place. {planName(initial.plan)} includes {initial.limit}{" "}
        {initial.limit === 1 ? "custom timeline" : "custom timelines"}
        {initial.plan === "PremiumPlus" ? (
          "."
        ) : (
          <>
            ; <Link href="/premium">Premium</Link> has more.
          </>
        )}
      </p>

      {list.length > 0 ? (
        <ol className="timeline-list" aria-label="Your timelines">
          {list.map((t, i) =>
            editing === t.id ? (
              <li key={t.id}>
                <TimelineForm
                  initial={{
                    name: t.name,
                    types: t.types,
                    placeName: t.placeName,
                    latitude: t.latitude,
                    longitude: t.longitude,
                    radiusKm: t.radiusKm,
                  }}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSave={async (body) => {
                    const result = await updateTimeline(t.id, body);
                    if (!result.ok) return result.error;
                    setList((l) => l.map((x) => (x.id === t.id ? result.data : x)));
                    setEditing(null);
                    toast("Timeline saved");
                    router.refresh();
                    return null;
                  }}
                />
              </li>
            ) : (
              <li key={t.id} className="timeline-item">
                <span className="col" style={{ gap: 0, minWidth: 0 }}>
                  <Link href={`/t/${t.id}`}>
                    <b>{t.name}</b>
                  </Link>
                  <span className="small muted">{describeTimeline(t)}</span>
                </span>
                <span className="row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Move ${t.name} up`}
                    disabled={pending || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Move ${t.name} down`}
                    disabled={pending || i === list.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditing(t.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={pending}
                    onClick={() => remove(t)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ),
          )}
        </ol>
      ) : null}

      {editing === "new" ? (
        <TimelineForm
          initial={EMPTY}
          submitLabel="Add timeline"
          onCancel={list.length > 0 ? () => setEditing(null) : undefined}
          onSave={async (body) => {
            const result = await createTimeline(body);
            if (!result.ok) return result.error;
            setList((l) => [...l, result.data]);
            setEditing(null);
            toast(`"${result.data.name}" added`);
            router.refresh();
            return null;
          }}
        />
      ) : full ? (
        <p className="notice">
          You have {initial.limit} of {initial.limit}.
          {initial.plan === "PremiumPlus" ? (
            " Delete one to add another."
          ) : (
            <>
              {" "}
              Delete one, or <Link href="/premium">upgrade</Link> for more.
            </>
          )}
        </p>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add a timeline
        </button>
      )}
    </div>
  );
}

function TimelineForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: TimelineRequest;
  submitLabel: string;
  onSave: (body: TimelineRequest) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [body, setBody] = useState(initial);
  const [placeText, setPlaceText] = useState(initial.placeName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const hasPlace = body.latitude != null && body.longitude != null;

  function toggle(type: IncidentCategory, on: boolean) {
    setBody((b) => ({
      ...b,
      types: on ? [...b.types.filter((t) => t !== type), type] : b.types.filter((t) => t !== type),
    }));
  }

  function pick(place: PlaceDto) {
    setPlaceText(place.name);
    setBody((b) => ({
      ...b,
      placeName: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      radiusKm: b.radiusKm ?? 10,
    }));
  }

  return (
    <form
      className="timeline-form stack"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.name.trim()) {
          setError("Give the timeline a name.");
          return;
        }
        if (body.types.length === 0) {
          setError("Choose at least one type of bad driving.");
          return;
        }
        setError(null);
        startSaving(async () => setError(await onSave(body)));
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-name`} className="label">
          Name
        </label>
        <input
          id={`${id}-name`}
          className="input"
          maxLength={30}
          placeholder="e.g. School run"
          value={body.name}
          onChange={(e) => setBody((b) => ({ ...b, name: e.target.value }))}
        />
      </div>
      <fieldset className="field">
        <legend className="label">Types of bad driving</legend>
        <div className="chips" style={{ flexWrap: "wrap", gap: 6 }}>
          {CATEGORY_CHOICES.map((type) => {
            const on = body.types.includes(type);
            return (
              <label key={type} className={`chip pill-choice${on ? " chip-on pill-on" : ""}`}>
                <input type="checkbox" checked={on} onChange={(e) => toggle(type, e.target.checked)} />
                {categoryLabel(type)}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-place`} className="label">
          Where <span className="muted">(optional: anywhere if empty)</span>
        </label>
        <PlaceSearch
          id={`${id}-place`}
          value={placeText}
          placeholder="Town, village or postcode"
          onText={(text) => {
            setPlaceText(text);
            if (!text.trim()) {
              setBody((b) => ({ ...b, placeName: null, latitude: null, longitude: null, radiusKm: null }));
            }
          }}
          onPick={pick}
        />
        {hasPlace ? (
          <label className="row small" style={{ gap: 8 }}>
            Within
            <select
              className="input"
              style={{ width: "auto" }}
              aria-label="Radius"
              value={body.radiusKm ?? 10}
              onChange={(e) => setBody((b) => ({ ...b, radiusKm: Number(e.target.value) }))}
            >
              {TIMELINE_RADIUSES.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
            of {body.placeName}
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

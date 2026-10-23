"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { createCommunity, deleteCommunity, updateCommunity } from "@/actions/communities";
import { COMMUNITY_RADIUSES, communityPath } from "@/lib/communities";
import type { CommunityDto, CommunityRequest, CommunityVisibility, PlaceDto } from "@/lib/types";

import { PlaceSearch } from "../PlaceSearch";
import { toast } from "../toast";

const EMPTY: CommunityRequest = {
  name: "",
  description: "",
  rules: "",
  visibility: "Public",
  placeName: null,
  latitude: null,
  longitude: null,
  radiusKm: null,
};

/**
 * Starting a community, or changing one (admins): name, description, rules, public or private, and optionally an
 * area (a place and a radius) so members posting from there are offered it.
 */
export function CommunityForm({ existing }: { existing?: CommunityDto }) {
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState<CommunityRequest>(
    existing
      ? {
          name: existing.name,
          description: existing.description,
          rules: existing.rules ?? "",
          visibility: existing.visibility,
          placeName: existing.placeName,
          latitude: existing.latitude,
          longitude: existing.longitude,
          radiusKm: existing.radiusKm,
        }
      : EMPTY,
  );
  const [placeText, setPlaceText] = useState(existing?.placeName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const hasPlace = body.latitude !== null && body.longitude !== null;

  const set = <K extends keyof CommunityRequest>(key: K, value: CommunityRequest[K]) =>
    setBody((current) => ({ ...current, [key]: value }));

  const pick = (place: PlaceDto) => {
    setPlaceText(place.name);
    setBody((b) => ({
      ...b,
      placeName: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      radiusKm: b.radiusKm ?? 10,
    }));
  };

  const fieldError = (name: string) => {
    const key = Object.keys(fieldErrors).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? fieldErrors[key]?.[0] : undefined;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    start(async () => {
      const request: CommunityRequest = {
        ...body,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        rules: body.rules?.trim() || null,
      };
      const result = existing
        ? await updateCommunity(existing.slug, request)
        : await createCommunity(request);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast(existing ? "Saved" : "Your community is ready");
      router.push(communityPath(result.data.slug));
      router.refresh();
    });
  };

  const remove = () => {
    if (
      !existing ||
      !window.confirm(`Delete ${existing.name} for everyone? Posts shared into it stay on Bad Jockeys.`)
    ) {
      return;
    }
    start(async () => {
      const result = await deleteCommunity(existing.slug);
      if (!result.ok) {
        toast(result.error);
        return;
      }
      toast("Community deleted");
      router.push("/communities");
    });
  };

  return (
    <form className="stack community-form" onSubmit={submit} noValidate>
      <label className="field">
        <span className="label">Name</span>
        <input
          className={`input${fieldError("name") ? " input-error" : ""}`}
          value={body.name}
          maxLength={60}
          required
          placeholder="e.g. Salford Road Watch"
          onChange={(e) => set("name", e.target.value)}
        />
        {fieldError("name") ? <span className="error">{fieldError("name")}</span> : null}
      </label>
      <label className="field">
        <span className="label">
          Description <span className="muted">(optional)</span>
        </span>
        <textarea
          className="textarea"
          rows={3}
          maxLength={500}
          value={body.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">
          Rules <span className="muted">(optional; Bad Jockeys&apos; guidelines apply anyway)</span>
        </span>
        <textarea
          className="textarea"
          rows={3}
          maxLength={1000}
          value={body.rules ?? ""}
          placeholder={"1. No number plates, names or addresses.\n2. Clips you filmed yourself."}
          onChange={(e) => set("rules", e.target.value)}
        />
      </label>

      <fieldset className="field community-visibility">
        <legend className="label">Who can see inside</legend>
        {(
          [
            ["Public", "Public", "Anyone can see inside and join."],
            [
              "Private",
              "Private",
              "Listed, but people ask to join and only members see inside. Adults only.",
            ],
          ] as [CommunityVisibility, string, string][]
        ).map(([value, label, help]) => (
          <label
            key={value}
            className={`community-choice${body.visibility === value ? " community-choice-on" : ""}`}
          >
            <input
              type="radio"
              name={`${id}-visibility`}
              checked={body.visibility === value}
              onChange={() => set("visibility", value)}
            />
            <span>
              <strong>{label}</strong>
              <br />
              <span className="small muted">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-place`} className="label">
          Area <span className="muted">(optional: leave empty for a topic, like cyclists or learners)</span>
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
              value={body.radiusKm ?? 10}
              onChange={(e) => set("radiusKm", Number(e.target.value))}
            >
              {COMMUNITY_RADIUSES.map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </select>
            of {body.placeName}
          </label>
        ) : null}
        <span className="help">
          Members posting something that happened in the area are offered this community.
        </span>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={pending || !body.name.trim()}>
          {existing ? "Save" : "Create community"}
        </button>
        {existing ? (
          <button type="button" className="btn btn-danger" disabled={pending} onClick={remove}>
            Delete community
          </button>
        ) : null}
      </div>
    </form>
  );
}

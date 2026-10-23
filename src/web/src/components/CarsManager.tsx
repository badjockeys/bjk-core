"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCar, saveCar } from "@/actions/vehicles";
import { COLOUR_SWATCHES } from "@/lib/vehicles";
import type { HouseholdCarDto, VehicleCatalogue, VehicleColour } from "@/lib/types";

import { toast } from "./toast";

/** The most cars a member can keep (the API's HouseholdCar.MaxPerUser). */
export const MAX_CARS = 5;

type Draft = { id: string | null; make: string; model: string; colour: VehicleColour | ""; nickname: string };

const EMPTY: Draft = { id: null, make: "", model: "", colour: "", nickname: "" };

/** List, add, change and delete your household cars. */
export function CarsManager({ cars, catalogue }: { cars: HouseholdCarDto[]; catalogue: VehicleCatalogue }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const models = catalogue.makes.find((m) => m.name === draft?.make)?.models ?? [];
  const placeholder = draft?.make ? `${draft.make} ${draft.model}`.trim() : "e.g. Dave's Golf";

  const save = () => {
    if (!draft) return;
    setError(null);
    start(async () => {
      const result = await saveCar(draft.id, {
        make: draft.make,
        model: draft.model || null,
        colour: draft.colour || null,
        nickname: draft.nickname || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast(draft.id ? "Car saved" : `${result.data.nickname} added`);
      setDraft(null);
      router.refresh();
    });
  };

  return (
    <div className="pad stack">
      <p className="small muted">
        Add the cars in your household, then choose the one you filmed from when you post: the post shows
        &ldquo;Filmed from&rdquo; and the nickname. We never ask for or store a registration.
      </p>
      {cars.length === 0 && !draft ? <p className="muted">No cars yet.</p> : null}
      <ul className="cars" aria-label="Your cars">
        {cars.map((car) => (
          <li key={car.id} className="car">
            <span
              className="car-swatch"
              style={{ background: car.colour ? COLOUR_SWATCHES[car.colour] : "transparent" }}
              aria-hidden="true"
            />
            <span className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
              <strong>{car.nickname}</strong>
              <span className="small muted">
                {[car.colour && car.colour !== "Other" ? car.colour : null, car.make, car.model]
                  .filter(Boolean)
                  .join(" ")}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                setDraft({
                  id: car.id,
                  make: car.make,
                  model: car.model ?? "",
                  colour: car.colour ?? "",
                  nickname: car.nickname,
                })
              }
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-sm"
              aria-label={`Delete ${car.nickname}`}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await deleteCar(car.id);
                  if (!result.ok) {
                    toast(result.error);
                    return;
                  }
                  toast(`${car.nickname} deleted. Posts filmed from it keep its name.`);
                  router.refresh();
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {draft ? (
        <form
          className="card stack"
          aria-label={draft.id ? "Change car" : "Add a car"}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="field">
            <span className="label">Make</span>
            <select
              className="input"
              required
              value={draft.make}
              onChange={(e) => setDraft({ ...draft, make: e.target.value, model: "" })}
            >
              <option value="">Choose…</option>
              {catalogue.makes.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">
              Model <span className="muted">(optional)</span>
            </span>
            <select
              className="input"
              value={draft.model}
              disabled={!draft.make}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            >
              <option value="">Choose…</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">
              Colour <span className="muted">(optional)</span>
            </span>
            <select
              className="input"
              value={draft.colour}
              onChange={(e) => setDraft({ ...draft, colour: e.target.value as VehicleColour | "" })}
            >
              <option value="">Choose…</option>
              {catalogue.colours.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">
              Nickname <span className="muted">(optional)</span>
            </span>
            <input
              className="input"
              maxLength={30}
              placeholder={placeholder}
              value={draft.nickname}
              onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
            />
            <span className="help">Shown on your posts as &ldquo;Filmed from: {draft.nickname || placeholder}&rdquo;.</span>
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={pending || !draft.make}>
              {draft.id ? "Save" : "Add car"}
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : cars.length < MAX_CARS ? (
        <button type="button" className="btn" onClick={() => setDraft(EMPTY)}>
          Add a car
        </button>
      ) : (
        <p className="small muted">You can keep up to {MAX_CARS} cars.</p>
      )}
    </div>
  );
}

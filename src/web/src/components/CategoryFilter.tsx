"use client";

import { useEffect, useRef, useState } from "react";

import { categoriesIn, GROUPS } from "@/lib/categories";
import type { IncidentCategory, IncidentGroup } from "@/lib/types";

/**
 * Pick whole groups of bad driving or single subcategories (the heat map's and timelines' filters). Each group has a
 * tick box for all of it, and a button that shows its subcategories. The value is always the subcategories chosen.
 */
export function CategoryFilter({
  value,
  onChange,
  legend,
}: {
  value: IncidentCategory[];
  onChange: (value: IncidentCategory[]) => void;
  legend: string;
}) {
  // Groups with some (not all) of their subcategories chosen start open, so the choice is visible.
  const [open, setOpen] = useState<IncidentGroup[]>(() =>
    GROUPS.filter((g) => {
      const n = categoriesIn(g.value).filter((t) => value.includes(t.value)).length;
      return n > 0 && n < categoriesIn(g.value).length;
    }).map((g) => g.value),
  );

  const setGroup = (group: IncidentGroup, on: boolean) => {
    const inGroup = categoriesIn(group).map((c) => c.value);
    const rest = value.filter((v) => !inGroup.includes(v));
    onChange(on ? [...rest, ...inGroup] : rest);
  };
  const setOne = (type: IncidentCategory, on: boolean) =>
    onChange(on ? [...value.filter((v) => v !== type), type] : value.filter((v) => v !== type));

  return (
    <fieldset className="cat-filter">
      <legend className="label">{legend}</legend>
      {GROUPS.map((group) => {
        const types = categoriesIn(group.value);
        const chosen = types.filter((t) => value.includes(t.value)).length;
        const isOpen = open.includes(group.value);
        const listId = `cat-filter-${group.value}`;
        return (
          <div key={group.value} className="cat-filter-group">
            <div className="cat-filter-head">
              <GroupBox
                label={group.label}
                state={chosen === 0 ? "none" : chosen === types.length ? "all" : "some"}
                onChange={(on) => setGroup(group.value, on)}
              />
              <button
                type="button"
                className="link-btn small"
                aria-expanded={isOpen}
                aria-controls={listId}
                aria-label={`${isOpen ? "Hide" : "Show"} the kinds of ${group.label.toLowerCase()}`}
                onClick={() =>
                  setOpen((o) => (isOpen ? o.filter((g) => g !== group.value) : [...o, group.value]))
                }
              >
                {chosen === 0 || chosen === types.length ? "" : `${chosen} of ${types.length} · `}
                {isOpen ? "Hide" : "Choose"}
              </button>
            </div>
            {isOpen ? (
              <div id={listId} className="row row-wrap cat-filter-types">
                {types.map((t) => {
                  const on = value.includes(t.value);
                  return (
                    <label key={t.value} className={`pill-choice${on ? " pill-on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => setOne(t.value, e.target.checked)}
                      />
                      {t.label}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

function GroupBox({
  label,
  state,
  onChange,
}: {
  label: string;
  state: "none" | "some" | "all";
  onChange: (on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <label className="cat-filter-all">
      <input
        ref={ref}
        type="checkbox"
        checked={state === "all"}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

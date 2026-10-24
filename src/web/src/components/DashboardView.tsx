"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";

import { deleteWidget, reorderDashboard, setCardHidden } from "@/actions/dashboard";
import type { ActionResult } from "@/lib/action-result";
import { kindLabel, move, widgetTitle, widgetWhere } from "@/lib/dashboard";
import type { DashboardDto, DashboardItemDto } from "@/lib/types";

import { GripIcon, LockIcon, PlusIcon } from "./icons";
import { WidgetCard } from "./WidgetCard";
import { WidgetForm } from "./WidgetForm";

type State = Pick<DashboardDto, "items" | "limit" | "used" | "plan">;

/**
 * The dashboard's cards in the member's order, with edit mode: drag a card (or use its up and down buttons), edit or
 * delete widgets, hide or show the built-in cards, and add widgets up to the plan's limit. `cards` are the built-in
 * cards, already rendered on the server, by key.
 */
export function DashboardView({
  initial,
  cards,
  editable,
}: {
  initial: State;
  cards: Record<string, ReactNode>;
  editable: boolean;
}) {
  const [state, setState] = useState<State>(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ item: DashboardItemDto | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [, startSaving] = useTransition();

  const canAdd = state.limit > 0 && state.used < state.limit;

  const apply = (next: State | { items: DashboardItemDto[] }) => setState((s) => ({ ...s, ...next }));

  const save = (call: () => Promise<ActionResult<DashboardDto>>, undo?: State) =>
    startSaving(async () => {
      setError(null);
      const result = await call();
      if (result.ok) {
        apply(result.data);
      } else {
        if (undo) setState(undo);
        setError(result.error);
      }
    });

  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= state.items.length || from === to) return;
    const before = state;
    const items = move(state.items, from, to);
    apply({ items });
    save(() => reorderDashboard(items.map((i) => i.key)), before);
  };

  const view = (
    <>
      {editable ? (
        <div className="dash-bar">
          <span className="small muted">Your dashboard</span>
          <button type="button" className="link small" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      ) : null}
      {state.limit === 0 ? <WidgetTeaser /> : null}
      {state.items.map((item) =>
        item.builtIn ? (
          item.hidden ? null : (
            <div key={item.key}>{cards[item.key]}</div>
          )
        ) : (
          <WidgetCard key={item.key} item={item} />
        ),
      )}
      {canAdd ? (
        <button type="button" className="btn widget-add" onClick={() => setForm({ item: null })}>
          <PlusIcon size={16} /> Add a widget
        </button>
      ) : null}
    </>
  );

  const edit = (
    <div className="card card-pad dash-edit">
      <div className="spread">
        <h2 className="card-h" style={{ padding: 0 }}>
          Edit your dashboard
        </h2>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(false)}>
          Done
        </button>
      </div>
      <p className="small muted">
        {state.limit > 0
          ? `${state.used} of ${state.limit} widgets. Drag to reorder, or use the arrows.`
          : "Drag to reorder, or use the arrows. Your own widgets come with Premium."}
      </p>
      <ol className="dash-list" aria-label="Your dashboard's cards">
        {state.items.map((item, index) => {
          const name = item.builtIn ? kindLabel(item.kind) : widgetTitle(item);
          return (
            <li
              key={item.key}
              className={`dash-row${dragging === index ? " dash-dragging" : ""}${item.hidden ? " dash-hidden" : ""}`}
              draggable
              onDragStart={(e) => {
                setDragging(index);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) reorder(dragging, index);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
            >
              <span className="dash-grip" aria-hidden="true">
                <GripIcon />
              </span>
              <span className="dash-name">
                <b>{name}</b>
                {item.builtIn ? (
                  item.hidden ? (
                    <span className="small muted">Hidden</span>
                  ) : null
                ) : (
                  <span className="small muted">
                    {item.locked ? "Locked · " : ""}
                    {widgetWhere(item)}
                  </span>
                )}
              </span>
              <span className="dash-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${name} up`}
                  disabled={index === 0}
                  onClick={() => reorder(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${name} down`}
                  disabled={index === state.items.length - 1}
                  onClick={() => reorder(index, index + 1)}
                >
                  ↓
                </button>
                {item.builtIn ? (
                  <button
                    type="button"
                    className="link small"
                    onClick={() => save(() => setCardHidden(item.kind, !item.hidden))}
                  >
                    {item.hidden ? `Show ${name}` : `Hide ${name}`}
                  </button>
                ) : (
                  <>
                    {item.locked ? null : (
                      <button type="button" className="link small" onClick={() => setForm({ item })}>
                        Edit <span className="sr-only">{name}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="link small dash-delete"
                      onClick={() => save(() => deleteWidget(item.id!))}
                    >
                      Delete <span className="sr-only">{name}</span>
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {canAdd ? (
        <button type="button" className="btn widget-add" onClick={() => setForm({ item: null })}>
          <PlusIcon size={16} /> Add a widget
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      {error ? (
        <p className="error small" role="alert">
          {error}
        </p>
      ) : null}
      {editing ? edit : view}
      {form ? (
        <WidgetForm
          item={form.item}
          onClose={() => setForm(null)}
          onSaved={(dashboard) => {
            apply(dashboard);
            setForm(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Free members: what widgets would show, greyed out, with the way to Premium. */
export function WidgetTeaser() {
  return (
    <div className="card card-pad widget-teaser widget-locked">
      <h2 className="card-h row" style={{ gap: 6, padding: 0 }}>
        <LockIcon /> Your own stats
      </h2>
      <p className="small muted">
        Incidents in your postcode, the worst roads and the busiest times near you.
      </p>
      <p className="small widget-sample" aria-hidden="true">
        L34 · within 2 km · 27 incidents
      </p>
      <Link href="/premium" className="btn btn-sm btn-primary">
        See Premium
      </Link>
    </div>
  );
}

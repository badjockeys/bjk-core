"use client";

import { useId, useState, type ReactNode } from "react";

/** "Show all categories": reveals the rest of a list in place. */
export function ShowAll({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div id={id} hidden={!open}>
        {children}
      </div>
      <button
        type="button"
        className="card-more small"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Show fewer categories" : label}
      </button>
    </>
  );
}

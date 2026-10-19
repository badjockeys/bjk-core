"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
}

/**
 * A small pop-up menu behind a button (the ⋯ on posts and profiles). Opens on click, closes on Escape, on a choice
 * or on a click elsewhere, and returns focus to its button.
 */
export function Menu({
  label,
  items,
  children,
  buttonClassName = "icon-btn",
  up = false,
}: {
  label: string;
  items: MenuItem[];
  children: ReactNode;
  buttonClassName?: string;
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    const first = wrapRef.current?.querySelector<HTMLElement>("[role=menuitem]");
    first?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const entries = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]"));
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    entries[(next + entries.length) % entries.length]?.focus();
  };

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {open ? (
        <div id={menuId} role="menu" className={`menu${up ? " menu-up" : ""}`} onKeyDown={onMenuKey}>
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                className={`menu-item${item.danger ? " menu-item-danger" : ""}`}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu-item${item.danger ? " menu-item-danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

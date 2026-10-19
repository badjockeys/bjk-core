"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { CloseIcon } from "./icons";

/**
 * A modal dialog on the native <dialog> element: a bottom sheet on phones, a centred dialog on wider screens.
 * The browser handles focus trapping, Escape and returning focus.
 */
export function Modal({
  open,
  onClose,
  title,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose(); // a click on the backdrop
        }
      }}
    >
      <div className="stack">
        <div className="modal-head">
          <h2 id={titleId} className="h2">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

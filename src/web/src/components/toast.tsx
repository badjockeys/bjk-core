"use client";

import { useEffect, useState } from "react";

import { TickIcon } from "./icons";

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

/** Show a short message at the bottom of the screen ("Link copied", "Posted. Thanks for sharing."). */
export function toast(message: string): void {
  for (const listener of listeners) {
    listener(message);
  }
}

/** Where toasts appear. Rendered once, in the root layout. Screen readers hear them as status messages. */
export function Toaster() {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    let next = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const listener: Listener = (text) => {
      const id = ++next;
      setMessages((current) => [...current.slice(-2), { id, text }]);
      const timer = setTimeout(() => {
        setMessages((current) => current.filter((m) => m.id !== id));
        timers.delete(timer);
      }, 4000);
      timers.add(timer);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className="toast">
          <TickIcon color="#FFFFFF" />
          {m.text}
        </div>
      ))}
    </div>
  );
}

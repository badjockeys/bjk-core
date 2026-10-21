"use client";

import { useEffect, useState, useTransition } from "react";

import { pushSetup, subscribePush, unsubscribePush } from "@/actions/notifications";
import { base64UrlToBytes, pushSupport, subscriptionKeys, type PushSupport } from "@/lib/push";

type State =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: PushSupport | "server" | "blocked" }
  | { kind: "ready"; key: string; on: boolean };

const SERVICE_WORKER = "/sw.js";

/**
 * Push notifications on this device: a switch that asks the browser for permission and subscribes it, or turns it
 * off again. Each device is separate. Nothing is pushed between 22:00 and 07:00.
 */
export function PushToggle() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = pushSupport({
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: "PushManager" in window,
        userAgent: navigator.userAgent,
        standalone:
          window.matchMedia?.("(display-mode: standalone)").matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      });
      if (support !== "supported") {
        if (!cancelled) setState({ kind: "unavailable", reason: support });
        return;
      }
      const setup = await pushSetup();
      if (!setup.ok || !setup.data.available || !setup.data.publicKey) {
        if (!cancelled) setState({ kind: "unavailable", reason: "server" });
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState({ kind: "unavailable", reason: "blocked" });
        return;
      }
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER);
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setState({ kind: "ready", key: setup.data.publicKey, on: existing !== null });
    })().catch(() => {
      if (!cancelled) setState({ kind: "unavailable", reason: "unsupported" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (on: boolean) => {
    if (state.kind !== "ready") {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER);
        if (on) {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setState({ kind: "unavailable", reason: "blocked" });
            return;
          }
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(state.key),
          });
          const keys = subscriptionKeys(subscription.toJSON());
          const result = keys ? await subscribePush(keys) : null;
          if (!result?.ok) {
            await subscription.unsubscribe();
            setError(result?.error ?? "This browser didn't give us what push needs.");
            return;
          }
        } else {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await unsubscribePush(subscription.endpoint);
            await subscription.unsubscribe();
          }
        }
        setState({ ...state, on });
      } catch {
        setError("Push notifications couldn't be changed in this browser.");
      }
    });
  };

  return (
    <section className="pad stack" aria-labelledby="push-title">
      <h2 id="push-title" className="h2">
        Push notifications
      </h2>
      {state.kind === "loading" ? <p className="muted small">Checking this device…</p> : null}
      {state.kind === "unavailable" ? <p className="muted small">{unavailableText(state.reason)}</p> : null}
      {state.kind === "ready" ? (
        <label className="spread">
          <span className="col" style={{ gap: 0 }}>
            <span>On this device</span>
            <span className="small muted">
              Choose which ones below. Nothing is pushed between 10pm and 7am.
            </span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={state.on}
            disabled={pending}
            onChange={(e) => toggle(e.target.checked)}
          />
        </label>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function unavailableText(reason: PushSupport | "server" | "blocked"): string {
  switch (reason) {
    case "install-first":
      return "On iPhone and iPad, add Bad Jockeys to your Home Screen (Share, then Add to Home Screen) and open it from there to turn on push notifications.";
    case "blocked":
      return "Notifications are blocked for this site in your browser's settings. Allow them there to turn push on.";
    case "server":
      return "Push notifications aren't available yet.";
    default:
      return "This browser doesn't support push notifications.";
  }
}

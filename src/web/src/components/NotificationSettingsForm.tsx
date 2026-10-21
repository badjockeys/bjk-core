"use client";

import { useState, useTransition } from "react";

import { saveNotificationSettings } from "@/actions/notifications";
import type { NotificationSettingDto } from "@/lib/types";

/** A row per type with three switches: in the bell, by email, and as a push notification. Saved together. */
export function NotificationSettingsForm({
  settings,
  email,
}: {
  settings: NotificationSettingDto[];
  email: string | null;
}) {
  const [rows, setRows] = useState(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const change = (index: number, key: "inApp" | "email" | "push", value: boolean) => {
    setStatus(null);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      setError(null);
      const result = await saveNotificationSettings(rows);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.data);
      setStatus("Saved.");
    });
  };

  return (
    <form className="pad stack" onSubmit={save}>
      <p className="muted small">
        {email
          ? `Emails go to ${email}, the confirmed address on your sign-in account.`
          : "Confirm your email address on your sign-in account to get emails."}
      </p>
      <table className="settings-table">
        <thead>
          <tr>
            <th scope="col">Tell me when</th>
            <th scope="col">In the app</th>
            <th scope="col">By email</th>
            <th scope="col">Push</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.type}>
              <th scope="row">{row.label}</th>
              <td>
                <input
                  type="checkbox"
                  className="switch"
                  aria-label={`${row.label}: in the app`}
                  checked={row.inApp}
                  onChange={(e) => change(i, "inApp", e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  className="switch"
                  aria-label={`${row.label}: by email`}
                  checked={row.email}
                  onChange={(e) => change(i, "email", e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  className="switch"
                  aria-label={`${row.label}: push`}
                  checked={row.push}
                  onChange={(e) => change(i, "push", e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {status ? (
          <span className="help" role="status">
            {status}
          </span>
        ) : null}
      </div>
    </form>
  );
}

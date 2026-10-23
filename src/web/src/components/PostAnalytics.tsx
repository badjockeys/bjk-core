"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { loadAnalytics } from "@/actions/engagement";
import { intervalLabel, previewPoints, SERIES_COLOURS } from "@/lib/analytics";
import type { AnalyticsPointDto, PostAnalyticsDto } from "@/lib/types";

import { AnalyticsChart } from "./AnalyticsChart";
import { Modal } from "./Modal";

/**
 * "Analytics" under your own post (owner, 22 Oct 2026): views, local views, reactions, comments and shares over
 * time since posting. The button shows for everyone; on Free the graphs are blurred behind an upgrade prompt
 * (the API sends no points, so the blur shows made-up ones).
 */
export function PostAnalytics({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PostAnalyticsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [loading, start] = useTransition();
  const titleId = `analytics-${postId}`;

  const show = () => {
    setOpen(true);
    setError(null);
    start(async () => {
      const result = await loadAnalytics(postId);
      if (result.ok) setData(result.data);
      else setError(result.error);
    });
  };

  const points = data && !data.locked ? data.points : previewPoints();
  const interval = data && !data.locked ? data.interval : "Hour";

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={show}>
        Analytics
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Post analytics" titleId={titleId}>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : !data ? (
          <p className="muted">{loading ? "Loading…" : null}</p>
        ) : (
          <div className="an">
            <p className="small muted">
              {data.locked ? "Since it was posted" : `${intervalLabel(data.interval)} since it was posted`}.
              Only you can see this.
            </p>
            <dl className="reach-grid">
              {(
                [
                  ["Views", data.totals.views],
                  ["Local views", data.totals.localViews],
                  ["Reactions", data.totals.reactions],
                  ["Comments", data.totals.comments],
                  ["Shares", data.totals.shares],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="fact">
                  <dt className="small muted">{label}</dt>
                  <dd>{value.toLocaleString("en-GB")}</dd>
                </div>
              ))}
            </dl>
            <div className={data.locked ? "an-locked" : undefined}>
              <div
                className="an-charts"
                aria-hidden={data.locked || undefined}
                inert={data.locked || undefined}
              >
                {table && !data.locked ? (
                  <AnalyticsTable points={points} interval={interval} />
                ) : (
                  <Charts points={points} interval={interval} />
                )}
              </div>
              {data.locked ? (
                <div className="an-upgrade">
                  <strong>See how your post did over time</strong>
                  <span className="small">
                    Graphs of views, reactions, comments and shares are part of Premium.
                  </span>
                  <Link href="/premium" className="btn btn-primary btn-sm">
                    See Premium
                  </Link>
                </div>
              ) : null}
            </div>
            {!data.locked ? (
              <button type="button" className="link small" onClick={() => setTable((t) => !t)}>
                {table ? "Show as charts" : "Show as a table"}
              </button>
            ) : null}
            <p className="small muted">
              Local views come from people whose home area is within 10 km of where it happened.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

function Charts({
  points,
  interval,
}: {
  points: AnalyticsPointDto[];
  interval: PostAnalyticsDto["interval"];
}) {
  const of = (key: keyof Omit<AnalyticsPointDto, "start">) => points.map((p) => p[key]);
  return (
    <>
      <AnalyticsChart
        title="Views"
        kind="lines"
        interval={interval}
        points={points}
        series={[
          { label: "All views", colour: SERIES_COLOURS.primary, values: of("views") },
          { label: "Local views", colour: SERIES_COLOURS.secondary, values: of("localViews") },
        ]}
      />
      {(["reactions", "comments", "shares"] as const).map((key) => (
        <AnalyticsChart
          key={key}
          title={key[0]!.toUpperCase() + key.slice(1)}
          kind="columns"
          interval={interval}
          points={points}
          series={[{ label: key, colour: SERIES_COLOURS.primary, values: of(key) }]}
        />
      ))}
    </>
  );
}

function AnalyticsTable({
  points,
  interval,
}: {
  points: AnalyticsPointDto[];
  interval: PostAnalyticsDto["interval"];
}) {
  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <caption className="sr-only">Post analytics, {intervalLabel(interval).toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col">{interval === "Hour" ? "Hour" : interval === "Day" ? "Day" : "Week"}</th>
            <th scope="col">Views</th>
            <th scope="col">Local</th>
            <th scope="col">Reactions</th>
            <th scope="col">Comments</th>
            <th scope="col">Shares</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start}>
              <th scope="row">
                {new Date(p.start).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: interval === "Hour" ? "short" : undefined,
                  timeZone: "Europe/London",
                })}
              </th>
              <td>{p.views}</td>
              <td>{p.localViews}</td>
              <td>{p.reactions}</td>
              <td>{p.comments}</td>
              <td>{p.shares}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

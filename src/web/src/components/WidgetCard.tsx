"use client";

import { useEffect, useState } from "react";

import { getWidgetData } from "@/actions/dashboard";
import { categoryLabel } from "@/lib/categories";
import { hourBand, suppressedText, widgetTitle, widgetWhere } from "@/lib/dashboard";
import { plural } from "@/lib/format";
import { changeLabel, sparkline } from "@/lib/trends";
import type { DashboardItemDto, DashboardWidgetDataDto } from "@/lib/types";

const SPARK_W = 260;
const SPARK_H = 44;
const DAYS: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

/** One of the member's widgets in the right panel (or the Dashboard tab): loads its figures, then draws them. */
export function WidgetCard({ item }: { item: DashboardItemDto }) {
  const [data, setData] = useState<DashboardWidgetDataDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item.id || item.locked) return;
    let live = true;
    void getWidgetData(item.id).then((result) => {
      if (!live) return;
      if (result.ok) setData(result.data);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [item.id, item.locked, item.placeName, item.radiusKm, item.periodDays, item.kind, item.types]);

  return (
    <section className="card widget" aria-label={`${widgetTitle(item)}, ${widgetWhere(item)}`}>
      <div className="widget-head">
        <h2 className="card-h">{widgetTitle(item)}</h2>
        <span className="small muted">{widgetWhere(item)}</span>
      </div>
      {item.locked ? (
        <p className="small muted widget-pad">
          Your plan allows fewer widgets than you have. Upgrade, or delete one to see this again.
        </p>
      ) : error ? (
        <p className="small error widget-pad">{error}</p>
      ) : !data ? (
        <p className="small muted widget-pad" aria-busy="true">
          Counting…
        </p>
      ) : (
        <WidgetFigures data={data} />
      )}
    </section>
  );
}

/** The figures for a widget's kind (also the "Add a widget" preview). */
export function WidgetFigures({ data }: { data: DashboardWidgetDataDto }) {
  if (data.suppressed) {
    return <p className="small muted widget-pad">{suppressedText(data.minCount)}</p>;
  }
  const total = data.total ?? 0;

  if (data.kind === "WhenItHappens") {
    const bands = data.timesOfDay;
    const days = data.weekdays;
    const max = Math.max(1, ...bands.map((b) => b.count ?? 0), ...days.map((d) => d.count ?? 0));
    return (
      <div className="widget-pad col" style={{ gap: 10 }}>
        <span className="small muted">
          {plural(total, "incident")}
          {data.busiestHour !== null && data.busiestHour !== undefined
            ? ` · busiest ${hourBand(data.busiestHour, data.busiestHour + 1)}`
            : ""}
        </span>
        <Bars
          label="Time of day"
          rows={bands.map((b) => ({ name: hourBand(b.fromHour, b.toHour), count: b.count ?? null }))}
          max={max}
        />
        <Bars
          label="Day of the week"
          rows={days.map((d) => ({ name: DAYS[d.day] ?? d.day, count: d.count ?? null }))}
          max={max}
        />
        {bands.some((b) => b.count === null) || days.some((d) => d.count === null) ? (
          <span className="small muted">Bars under 3 incidents aren&apos;t shown.</span>
        ) : null}
      </div>
    );
  }

  if (data.kind === "TopRoads") {
    return (
      <div className="widget-pad col" style={{ gap: 6 }}>
        <span className="small muted">{plural(total, "incident")}</span>
        {data.topPlaces.length === 0 ? (
          <span className="small muted">No road has 3 or more incidents yet.</span>
        ) : (
          <ol className="widget-list">
            {data.topPlaces.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <b>{p.count}</b>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  const change = changeLabel(data.changePercent);
  const { line, area } = sparkline(data.counts, SPARK_W, SPARK_H);
  return (
    <div className="widget-pad col" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
        <b className="widget-big">{total.toLocaleString("en-GB")}</b>
        <span className="small muted">
          {total === 1 ? "incident" : "incidents"}
          {change ? (
            <>
              {" · "}
              <span className={`trend-change trend-${change.trend}`}>{change.text}</span>
            </>
          ) : null}
        </span>
      </div>
      {data.counts.length > 1 ? (
        <svg
          className="spark widget-spark"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${plural(total, "incident")} ${data.period === "Day" ? "day by day" : "week by week"}`}
        >
          <path d={area} className="spark-area" />
          <path d={line} className="spark-line" />
        </svg>
      ) : null}
      {data.topCategories.length > 0 ? (
        <ul className="widget-list" aria-label="Top types">
          {data.topCategories.map((c) => (
            <li key={c.category}>
              <span>{categoryLabel(c.category)}</span>
              <b>{c.percent}%</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Bars({
  label,
  rows,
  max,
}: {
  label: string;
  rows: { name: string; count: number | null }[];
  max: number;
}) {
  return (
    <div className="col" style={{ gap: 4 }} role="group" aria-label={label}>
      <span className="small">{label}</span>
      {rows.map((r) => (
        <div key={r.name} className="widget-bar">
          <span className="small muted">{r.name}</span>
          <span className="widget-bar-track" aria-hidden="true">
            <span style={{ width: `${Math.round(((r.count ?? 0) / max) * 100)}%` }} />
          </span>
          <span className="small">{r.count ?? "–"}</span>
        </div>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { loadCategoryTrends } from "@/actions/trends";
import { categoryHref, categoryLabel } from "@/lib/categories";
import { plural } from "@/lib/format";
import {
  TREND_RANGES,
  areaAllowed,
  boxAround,
  changeLabel,
  earliestDay,
  periodLabel,
  rangeAllowed,
  rangeDates,
  shortDate,
  sparkline,
  type TrendRange,
} from "@/lib/trends";
import type { CategoryTrendDto, CategoryTrendsDto, PlaceDto } from "@/lib/types";

import { PlaceSearch } from "./PlaceSearch";
import { ShowAll } from "./ShowAll";

const SPARK_W = 88;
const SPARK_H = 28;

/** The category trends card: range picker, optional area (Premium), and one row per type of bad driving. */
export function CategoryTrends({ initial }: { initial: CategoryTrendsDto }) {
  const [data, setData] = useState(initial);
  const [range, setRange] = useState<TrendRange>("7d");
  const [custom, setCustom] = useState({ from: initial.access.from, to: initial.access.to });
  const [place, setPlace] = useState<PlaceDto | null>(null);
  const [placeText, setPlaceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = useId();

  // The API's "today" (UK), so the picker agrees with the server whatever the browser's clock says.
  const today = initial.access.to;
  const history = data.access.historyDays;
  const canArea = areaAllowed(data.access.plan);
  const thisYear = Number(today.slice(0, 4));

  function load(next: { range: TrendRange; from?: string; to?: string; place?: PlaceDto | null }) {
    const dates =
      next.range === "custom"
        ? { from: next.from ?? custom.from, to: next.to ?? custom.to }
        : rangeDates(next.range, today);
    const area = next.place === undefined ? place : next.place;
    setError(null);
    startTransition(async () => {
      const result = await loadCategoryTrends({
        ...dates,
        bbox: area && canArea ? boxAround(area.latitude, area.longitude) : undefined,
      });
      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  const shown = data.categories.filter((c) => !c.suppressed);
  const hidden = data.categories.length - shown.length;

  return (
    <div className="card trends" aria-busy={pending}>
      <h2 className="card-h">Category trends</h2>

      <div className="trends-controls">
        <div className="chips trends-ranges" role="group" aria-label="Date range">
          {TREND_RANGES.map((r) => {
            const allowed = rangeAllowed(r.value, history);
            return (
              <button
                key={r.value}
                type="button"
                className={`chip trends-chip${range === r.value ? " chip-on" : ""}`}
                aria-pressed={range === r.value}
                disabled={!allowed || pending}
                title={allowed ? undefined : "Premium: look back up to 12 months"}
                onClick={() => {
                  setRange(r.value);
                  if (r.value !== "custom") load({ range: r.value });
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {range === "custom" ? (
          <form
            className="trends-custom"
            onSubmit={(e) => {
              e.preventDefault();
              load({ range: "custom" });
            }}
          >
            <label className="small" htmlFor={`${ids}-from`}>
              From
            </label>
            <input
              id={`${ids}-from`}
              type="date"
              className="input trends-date"
              value={custom.from}
              min={earliestDay(today, history)}
              max={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
            <label className="small" htmlFor={`${ids}-to`}>
              To
            </label>
            <input
              id={`${ids}-to`}
              type="date"
              className="input trends-date"
              value={custom.to}
              min={custom.from}
              max={today}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              Show
            </button>
          </form>
        ) : null}

        {canArea ? (
          <div className="trends-area">
            <label className="small muted" htmlFor={`${ids}-area`}>
              Area
            </label>
            <div className="row" style={{ gap: 6 }}>
              <PlaceSearch
                id={`${ids}-area`}
                value={placeText}
                placeholder="Whole UK"
                onText={setPlaceText}
                onPick={(p) => {
                  setPlace(p);
                  setPlaceText(p.name);
                  load({ range, place: p });
                }}
              />
              {place ? (
                <button
                  type="button"
                  className="link small"
                  onClick={() => {
                    setPlace(null);
                    setPlaceText("");
                    load({ range, place: null });
                  }}
                >
                  Whole UK
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="small muted trends-note">
            Whole UK, last 7 days. <Link href="/premium">Premium</Link> looks back 12 months and narrows it to
            your area.
          </p>
        )}
      </div>

      <p className="small muted trends-dates">
        {shortDate(data.access.from, thisYear)} – {shortDate(data.access.to, thisYear)}
        {place && canArea ? ` · around ${place.name}` : " · whole UK"} · compared with the{" "}
        {data.access.to === data.access.from ? "day" : "same length"} before
      </p>

      {error ? (
        <p className="small trends-error trends-pad" role="alert">
          {error}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="small muted trends-pad">Not enough incidents in this period to show trends.</p>
      ) : (
        <>
          {shown.slice(0, 5).map((c) => (
            <TrendRow key={c.category} trend={c} period={periodLabel(data.period)} />
          ))}
          {shown.length > 5 ? (
            <ShowAll label="Show all categories">
              {shown.slice(5).map((c) => (
                <TrendRow key={c.category} trend={c} period={periodLabel(data.period)} />
              ))}
            </ShowAll>
          ) : null}
        </>
      )}
      {hidden > 0 && shown.length > 0 ? (
        <p className="small muted trends-pad trends-foot">
          {plural(hidden, "other type")} had fewer than 3 incidents, so{" "}
          {hidden === 1 ? "it isn't" : "they aren't"} shown.
        </p>
      ) : null}
    </div>
  );
}

function TrendRow({ trend, period }: { trend: CategoryTrendDto; period: string }) {
  const label = categoryLabel(trend.category);
  const change = changeLabel(trend.changePercent);
  const { line, area } = sparkline(trend.points, SPARK_W, SPARK_H);
  const total = trend.total ?? 0;
  return (
    <Link href={categoryHref(trend.category)} className="trend trend-row">
      <span className="trend-text">
        <b>{label}</b>
        <span className="small muted">
          {plural(total, "incident")}
          {change ? (
            <>
              {" · "}
              <span className={`trend-change trend-${change.trend}`}>{change.text}</span>
            </>
          ) : null}
        </span>
      </span>
      <svg
        className="spark"
        width={SPARK_W}
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        role="img"
        aria-label={`${label}: ${plural(total, "incident")}, counted ${period}`}
      >
        <path d={area} className="spark-area" />
        <path d={line} className="spark-line" />
      </svg>
    </Link>
  );
}

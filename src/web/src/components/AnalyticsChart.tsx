"use client";

import { useId, useState } from "react";

import { compact, niceMax, pointLabel, tickIndexes } from "@/lib/analytics";
import type { AnalyticsInterval, AnalyticsPointDto } from "@/lib/types";

export interface ChartSeries {
  label: string;
  colour: string;
  values: number[];
}

const W = 600;
const H = 170;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

/**
 * One small chart on the analytics panel: columns for a single count, or lines when there are two series (views and
 * local views). Thin marks, a recessive grid, a legend for two series, and a hover tooltip for each point (the table
 * view carries every value too).
 */
export function AnalyticsChart({
  title,
  kind,
  series,
  points,
  interval,
}: {
  title: string;
  kind: "columns" | "lines";
  series: ChartSeries[];
  points: AnalyticsPointDto[];
  interval: AnalyticsInterval;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const count = points.length;
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, count);
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const bar = Math.min(24, Math.max(2, band - 2));
  const grid = [0, top / 2, top];

  return (
    <figure className="an-chart" aria-labelledby={`${id}-title`}>
      <figcaption className="an-chart-head">
        <span id={`${id}-title`} className="an-chart-title">
          {title}
        </span>
        {series.length > 1 ? (
          <span className="an-legend">
            {series.map((s) => (
              <span key={s.label} className="an-key">
                <span className="an-swatch" style={{ background: s.colour }} aria-hidden="true" />
                {s.label}
              </span>
            ))}
          </span>
        ) : null}
      </figcaption>
      <div className="an-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}: ${series.map((s) => `${s.label} ${s.values.reduce((a, b) => a + b, 0)}`).join(", ")} in total`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            const i = Math.floor((px - PAD.left) / band);
            setHover(i >= 0 && i < count ? i : null);
          }}
        >
          {grid.map((g) => (
            <g key={g}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} className="an-grid" />
              <text x={PAD.left - 6} y={y(g) + 4} textAnchor="end" className="an-tick">
                {compact(g)}
              </text>
            </g>
          ))}
          {tickIndexes(count).map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="an-tick">
              {pointLabel(points[i]!.start, interval)}
            </text>
          ))}
          {hover !== null ? (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="an-crosshair" />
          ) : null}
          {kind === "columns"
            ? series[0]!.values.map((v, i) =>
                v > 0 ? (
                  <path key={i} d={column(x(i) - bar / 2, y(v), bar, y(0) - y(v))} fill={series[0]!.colour} />
                ) : null,
              )
            : series.map((s) => (
                <g key={s.label}>
                  <polyline
                    points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                    fill="none"
                    stroke={s.colour}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {hover !== null ? (
                    <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.colour} className="an-dot" />
                  ) : null}
                </g>
              ))}
        </svg>
        {hover !== null ? (
          <div
            className="an-tip"
            role="status"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > count / 2 ? "-100%" : "0"})`,
            }}
          >
            <strong>{pointLabel(points[hover]!.start, interval, true)}</strong>
            {series.map((s) => (
              <span key={s.label} className="an-key">
                <span className="an-swatch" style={{ background: s.colour }} aria-hidden="true" />
                {s.label}: {s.values[hover]!.toLocaleString("en-GB")}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}

/** A column with a 4 px rounded top and a square foot on the baseline. */
function column(left: number, top: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  return `M${left},${top + height}V${top + r}Q${left},${top} ${left + r},${top}H${left + width - r}Q${left + width},${top} ${left + width},${top + r}V${top + height}Z`;
}

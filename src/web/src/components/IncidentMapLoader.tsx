"use client";

import dynamic from "next/dynamic";

import type { MapStart } from "@/lib/chat";

// Leaflet needs the browser, so the map only renders there.
const IncidentMap = dynamic(() => import("./IncidentMap"), {
  ssr: false,
  loading: () => (
    <div className="hm-loading centre" role="status">
      <span className="muted">Loading the map…</span>
    </div>
  ),
});

export function IncidentMapLoader({
  tileUrl,
  attribution,
  start,
}: {
  tileUrl: string;
  attribution: string;
  /** Where to start (from Ask AI's "Open on the map"); the whole UK and every type without it. */
  start?: MapStart;
}) {
  return <IncidentMap tileUrl={tileUrl} attribution={attribution} start={start} />;
}

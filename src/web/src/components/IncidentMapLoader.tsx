"use client";

import dynamic from "next/dynamic";

// Leaflet needs the browser, so the map only renders there.
const IncidentMap = dynamic(() => import("./IncidentMap"), {
  ssr: false,
  loading: () => (
    <div className="hm-loading centre" role="status">
      <span className="muted">Loading the map…</span>
    </div>
  ),
});

export function IncidentMapLoader({ tileUrl, attribution }: { tileUrl: string; attribution: string }) {
  return <IncidentMap tileUrl={tileUrl} attribution={attribution} />;
}

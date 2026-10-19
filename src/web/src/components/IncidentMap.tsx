"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadAreaStats, loadHeatmap } from "@/actions/heatmap";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import {
  changeLabel,
  DAY_CHOICES,
  DEFAULT_FILTERS,
  heatmapQuery,
  hourBand,
  PERIODS,
  periodLabel,
  planLabel,
  shade,
  TIMES_OF_DAY,
  toBbox,
  type MapFilters,
  type Period,
} from "@/lib/heatmap";
import type { AreaStatsDto, HeatmapCell, HeatmapDays, HeatmapDto, IncidentCategory } from "@/lib/types";

const UK_CENTRE: L.LatLngExpression = [54.4, -2.9];

interface View {
  bbox: string;
  zoom: number;
}

interface Area {
  bbox: string;
  stats: AreaStatsDto | null;
  error: string | null;
}

/**
 * Screen 28: the incident map (Leaflet, BSD-2-Clause; OpenStreetMap tiles by default, set by MAP_TILE_URL). Each grid
 * cell the API returns is drawn as a square shaded on the brand's cyan scale by its count; cells with fewer than 3
 * incidents never come back from the API. Tapping a cell shows that area's figures. Filters are Premium: on the Free
 * plan they're shown locked, and the map is the last 7 days across the UK.
 */
export default function IncidentMap({ tileUrl, attribution }: { tileUrl: string; attribution: string }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<{ key: string; map: HeatmapDto | null; error: string | null } | null>(
    null,
  );
  const [area, setArea] = useState<Area | null>(null);

  const query = useMemo(() => (view ? heatmapQuery(view.bbox, view.zoom, filters) : null), [view, filters]);
  const key = query ? JSON.stringify(query) : "";
  const loading = query !== null && data?.key !== key;
  const access = data?.map?.access ?? null;
  const locked = access !== null && !access.filtersAllowed;

  // The map itself, once.
  useEffect(() => {
    if (!element.current) {
      return;
    }
    const instance = L.map(element.current, { center: UK_CENTRE, zoom: 6, minZoom: 5, maxZoom: 16 });
    L.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    const emit = () => {
      const b = instance.getBounds();
      setView({
        bbox: toBbox(b.getWest(), b.getSouth(), b.getEast(), b.getNorth()),
        zoom: instance.getZoom(),
      });
    };
    instance.on("moveend", emit);
    map.current = instance;
    const first = setTimeout(emit, 0);
    return () => {
      clearTimeout(first);
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, [tileUrl, attribution]);

  // The cells for the view and filters.
  useEffect(() => {
    if (!query) {
      return;
    }
    let current = true;
    void loadHeatmap(query).then((result) => {
      if (current) {
        setData({ key, map: result.ok ? result.data : null, error: result.ok ? null : result.error });
      }
    });
    return () => {
      current = false;
    };
  }, [query, key]);

  const selectArea = useCallback(
    (cell: HeatmapCell) => {
      const bbox = toBbox(cell.minLongitude, cell.minLatitude, cell.maxLongitude, cell.maxLatitude);
      setArea({ bbox, stats: null, error: null });
      const q = query ? { ...query, bbox, zoom: undefined } : { bbox };
      void loadAreaStats(q).then((result) =>
        setArea((a) =>
          a?.bbox === bbox
            ? { bbox, stats: result.ok ? result.data : null, error: result.ok ? null : result.error }
            : a,
        ),
      );
    },
    [query],
  );
  const select = useRef(selectArea);
  useEffect(() => {
    select.current = selectArea;
  }, [selectArea]);

  // Draw the cells.
  const shown = data?.map ?? null;
  useEffect(() => {
    const group = layer.current;
    if (!group) {
      return;
    }
    group.clearLayers();
    for (const cell of shown?.cells ?? []) {
      const colour = shade(cell.count, shown!.maxCount, shown!.minCellCount);
      L.rectangle(
        [
          [cell.minLatitude, cell.minLongitude],
          [cell.maxLatitude, cell.maxLongitude],
        ],
        { stroke: true, color: colour, weight: 1, fillColor: colour, fillOpacity: 0.7 },
      )
        .bindTooltip(`${cell.count} incidents`)
        .on("click", () => select.current(cell))
        .addTo(group);
    }
  }, [shown]);

  const set = <K extends keyof MapFilters>(name: K, value: MapFilters[K]) => {
    setFilters((f) => ({ ...f, [name]: value }));
    setArea(null);
  };

  return (
    <div className="hm">
      <header className="hm-head">
        <span className="row" style={{ gap: 10 }}>
          <h1 className="h1" style={{ margin: 0 }}>
            Incident map
          </h1>
          {access ? <span className="plan-badge">{planLabel(access.plan)}</span> : null}
        </span>
        <div className="chips hm-filters" role="group" aria-label="Filters">
          <FilterSelect
            label="Category"
            value={filters.category}
            disabled={locked}
            onChange={(v) => set("category", v as IncidentCategory | "")}
            options={[
              { value: "", label: "All categories" },
              ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
            ]}
          />
          <FilterSelect
            label="Period"
            value={locked ? "7d" : filters.period}
            disabled={locked}
            onChange={(v) => set("period", v as Period)}
            options={PERIODS.filter((p) => p.value !== "5y" || access?.plan === "PremiumPlus")}
          />
          <FilterSelect
            label="Time of day"
            value={filters.hours}
            disabled={locked}
            onChange={(v) => set("hours", v)}
            options={TIMES_OF_DAY}
          />
          <FilterSelect
            label="Days"
            value={filters.days}
            disabled={locked}
            onChange={(v) => set("days", v as HeatmapDays)}
            options={DAY_CHOICES}
          />
          {locked ? <span className="plan-badge">Premium</span> : null}
        </div>
      </header>

      <div className="hm-body">
        <div className="hm-map-wrap">
          <div
            ref={element}
            className="hm-map"
            role="application"
            aria-label="Map of incidents. Darker squares have more incidents; select one for its figures."
          />
          <div className="hm-legend" aria-hidden="true">
            <span className="muted">Fewer</span>
            <span className="hm-scale" />
            <span className="muted">More incidents</span>
          </div>
          {loading ? <span className="hm-status small">Loading…</span> : null}
        </div>

        <div className="hm-panel stack" aria-live="polite">
          {data?.error ? <p className="error">{data.error}</p> : null}
          {locked ? (
            <div className="notice small">
              <span>
                <strong>Free preview:</strong> the last 7 days across the UK. Premium adds 12 months of
                history and the filters.{" "}
                <Link href="/premium" className="link">
                  Get Premium
                </Link>
              </span>
            </div>
          ) : null}
          {area ? (
            <AreaPanel area={area} />
          ) : (
            <p className="muted small">Select a square on the map to see that area.</p>
          )}
          <button type="button" className="btn btn-block" disabled>
            Set an alert for this area (coming soon)
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Built from rounded locations. Areas with fewer than 3 incidents are hidden so no single incident
            can be pinpointed.
          </p>
          {access && access.plan !== "PremiumPlus" ? (
            <div className="notice small">
              Premium + adds 5 years of history, CSV export and monthly area reports.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`chip chip-select${value && value !== "All" ? " chip-on" : ""}`}>
      <span className="sr-only">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AreaPanel({ area }: { area: Area }) {
  if (area.error) {
    return <p className="error">{area.error}</p>;
  }
  const stats = area.stats;
  if (!stats) {
    return <p className="muted small">Loading this area…</p>;
  }
  const period = periodLabel(stats.access);
  if (stats.suppressed) {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread">
          <strong>This area</strong>
          <span className="small muted">{period}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Fewer than 3 incidents here in this period, so the figures are hidden.
        </p>
      </div>
    );
  }
  const yearly = period === "last 12 months";
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="spread">
        <strong>{stats.placeName ?? "This area"}</strong>
        <span className="small muted">{period}</span>
      </div>
      <div className="row hm-figures">
        <span>
          <strong>{stats.total}</strong>
          <span className="small muted">incidents</span>
        </span>
        {stats.changePercent !== null ? (
          <span>
            <strong>{changeLabel(stats.changePercent)}</strong>
            <span className="small muted">{yearly ? "vs previous year" : "vs previous period"}</span>
          </span>
        ) : null}
        {stats.busiestHour !== null ? (
          <span>
            <strong>{hourBand(stats.busiestHour)}</strong>
            <span className="small muted">busiest</span>
          </span>
        ) : null}
      </div>
      {stats.topCategories.length > 0 ? (
        <div className="small">
          {stats.topCategories.map((c) => `${categoryLabel(c.category)} ${c.percent}%`).join(" · ")}
        </div>
      ) : null}
      {stats.topPlaces.length > 0 ? (
        <div className="stack" style={{ gap: 4 }}>
          <strong>Top roads</strong>
          {stats.topPlaces.map((p) => (
            <span key={p.name} className="small">
              {p.name} · {p.count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

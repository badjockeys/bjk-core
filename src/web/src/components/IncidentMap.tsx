"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadAreaStats, loadHeatmap } from "@/actions/heatmap";
import { getVehicleCatalogue } from "@/actions/vehicles";
import { categoryLabel, describeTypes } from "@/lib/categories";
import type { MapStart } from "@/lib/chat";
import {
  changeLabel,
  DAY_CHOICES,
  DEFAULT_FILTERS,
  heatmapQuery,
  hourBand,
  moreFilterCount,
  PERIODS,
  periodLabel,
  planLabel,
  shade,
  TIMES_OF_DAY,
  toBbox,
  type MapFilters,
  type Period,
} from "@/lib/heatmap";
import type { AreaStatsDto, HeatmapCell, HeatmapDays, HeatmapDto, VehicleCatalogue } from "@/lib/types";
import { COLOUR_SWATCHES, vehicleTypeLabel } from "@/lib/vehicles";

import { CategoryFilter } from "./CategoryFilter";

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
 * plan they're shown locked, and the map is the last 7 days across the UK. `start` (Ask AI's "Open on the
 * map") centres it on an area and filters it to up to 3 types.
 */
export default function IncidentMap({
  tileUrl,
  attribution,
  start,
}: {
  tileUrl: string;
  attribution: string;
  start?: MapStart;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [filters, setFilters] = useState<MapFilters>(() =>
    start?.types.length ? { ...DEFAULT_FILTERS, categories: start.types } : DEFAULT_FILTERS,
  );
  // Read once, when the map is made: later changes come from moving the map.
  const startView = useRef(start);
  const [data, setData] = useState<{ key: string; map: HeatmapDto | null; error: string | null } | null>(
    null,
  );
  const [area, setArea] = useState<Area | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

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
    const centre = startView.current?.centre ?? null;
    const instance = L.map(element.current, {
      center: centre ?? UK_CENTRE,
      zoom: centre ? (startView.current?.zoom ?? 11) : 6,
      minZoom: 5,
      maxZoom: 16,
    });
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
          <button
            type="button"
            className={`chip${filters.categories.length > 0 ? " chip-on" : ""}`}
            aria-label="Types of bad driving"
            aria-expanded={moreOpen}
            disabled={locked}
            onClick={() => setMoreOpen((o) => !o)}
          >
            {describeTypes(filters.categories)}
          </button>
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
          <button
            type="button"
            className={`chip${moreFilterCount(filters) > 0 ? " chip-on" : ""}`}
            aria-expanded={moreOpen}
            aria-controls="hm-more"
            disabled={locked}
            onClick={() => setMoreOpen((o) => !o)}
          >
            More filters{moreFilterCount(filters) > 0 ? ` (${moreFilterCount(filters)})` : ""}
          </button>
          {locked ? <span className="plan-badge">Premium</span> : null}
        </div>
      </header>

      {moreOpen && !locked ? (
        <MoreFilters
          filters={filters}
          modelIgnored={Boolean(access?.modelFilterIgnored)}
          onChange={(change) => {
            setFilters((f) => ({ ...f, ...change }));
            setArea(null);
          }}
          onClear={() => {
            setFilters((f) => ({ ...DEFAULT_FILTERS, period: f.period }));
            setArea(null);
          }}
        />
      ) : null}

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
          <Link href="/account/notifications" className="btn btn-block">
            Set up alerts for your area
          </Link>
          <p className="small muted" style={{ margin: 0 }}>
            Built from rounded locations. Areas with fewer than {shown?.minCellCount ?? 3} incidents are
            hidden so no single incident can be pinpointed
            {(shown?.minCellCount ?? 3) > 3 ? " (5 when filtering by vehicle)" : ""}.
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

/** The Premium filters beyond the top row: types, dates, vehicle, light, school run, reported, video. */
function MoreFilters({
  filters,
  modelIgnored,
  onChange,
  onClear,
}: {
  filters: MapFilters;
  modelIgnored: boolean;
  onChange: (change: Partial<MapFilters>) => void;
  onClear: () => void;
}) {
  const [catalogue, setCatalogue] = useState<VehicleCatalogue | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getVehicleCatalogue().then((result) => {
      if (!cancelled && result.ok) setCatalogue(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = <T,>(list: T[], value: T, on: boolean): T[] =>
    on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);
  const models = catalogue?.makes.find((m) => m.name === filters.make)?.models ?? [];

  return (
    <section id="hm-more" className="hm-more" aria-label="More filters">
      <div className="hm-group">
        <CategoryFilter
          legend="Types of bad driving"
          value={filters.categories}
          onChange={(categories) => onChange({ categories })}
        />
      </div>

      <fieldset className="hm-group">
        <legend className="label">Dates (instead of the period)</legend>
        <div className="row row-wrap" style={{ gap: 8 }}>
          <label className="field">
            <span className="small muted">From</span>
            <input
              className="input"
              type="date"
              value={filters.from}
              onChange={(e) => onChange({ from: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="small muted">To</span>
            <input
              className="input"
              type="date"
              value={filters.to}
              onChange={(e) => onChange({ to: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="hm-group">
        <legend className="label">Vehicle</legend>
        {catalogue ? (
          <>
            <div className="row row-wrap" style={{ gap: 6 }}>
              {catalogue.types.map((type) => (
                <label
                  key={type}
                  className={`pill-choice${filters.vehicleTypes.includes(type) ? " pill-on" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={filters.vehicleTypes.includes(type)}
                    onChange={(e) =>
                      onChange({ vehicleTypes: toggle(filters.vehicleTypes, type, e.target.checked) })
                    }
                  />
                  {vehicleTypeLabel(type)}
                </label>
              ))}
            </div>
            <div className="row row-wrap" style={{ gap: 8 }}>
              <label className="field">
                <span className="small muted">Make</span>
                <select
                  className="input"
                  value={filters.make}
                  onChange={(e) => onChange({ make: e.target.value, model: "" })}
                >
                  <option value="">Any make</option>
                  {catalogue.makes.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="small muted">Model</span>
                <select
                  className="input"
                  value={filters.model}
                  disabled={!filters.make}
                  onChange={(e) => onChange({ model: e.target.value })}
                >
                  <option value="">Any model</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filters.model && modelIgnored ? (
              <p className="help">Zoom out to a town or wider to filter by model.</p>
            ) : null}
            <div className="row row-wrap" style={{ gap: 6 }} role="group" aria-label="Colours">
              {catalogue.colours.map((colour) => (
                <label
                  key={colour}
                  className={`pill-choice${filters.colours.includes(colour) ? " pill-on" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={filters.colours.includes(colour)}
                    onChange={(e) => onChange({ colours: toggle(filters.colours, colour, e.target.checked) })}
                  />
                  <span
                    className="swatch"
                    style={{ background: COLOUR_SWATCHES[colour] }}
                    aria-hidden="true"
                  />
                  {colour}
                </label>
              ))}
            </div>
          </>
        ) : (
          <span className="help">Loading…</span>
        )}
      </fieldset>

      <fieldset className="hm-group">
        <legend className="label">Conditions</legend>
        <div className="row row-wrap" style={{ gap: 6 }}>
          {(
            [
              ["", "Day or night"],
              ["Daylight", "Daylight"],
              ["Dark", "After dark"],
            ] as const
          ).map(([value, label]) => (
            <label key={label} className={`pill-choice${filters.light === value ? " pill-on" : ""}`}>
              <input
                type="radio"
                name="light"
                checked={filters.light === value}
                onChange={() => onChange({ light: value })}
              />
              {label}
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.schoolRun}
            onChange={(e) => onChange({ schoolRun: e.target.checked })}
          />
          <span>School run (weekdays 8–9:15am and 2:45–4pm)</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.reported}
            onChange={(e) => onChange({ reported: e.target.checked })}
          />
          <span>Reported to the police</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.videoOnly}
            onChange={(e) => onChange({ videoOnly: e.target.checked })}
          />
          <span>Videos only</span>
        </label>
      </fieldset>

      <button type="button" className="link" onClick={onClear}>
        Clear filters
      </button>
    </section>
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

"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

export interface Pin {
  lat: number;
  lng: number;
}

const UK_CENTRE: Pin = { lat: 54.2, lng: -2.6 };

const PIN_ICON = L.divIcon({
  className: "map-pin",
  html: '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="#111111"/><circle cx="12" cy="10" r="2.6" fill="#FFFFFF"/></svg>',
  iconSize: [34, 34],
  iconAnchor: [17, 33],
});

/**
 * Screen 09's map (Leaflet, BSD-2-Clause; OpenStreetMap tiles by default). Tap or click to drop the pin, or drag it.
 * Keyboard users can pan the map with the arrow keys and drop the pin at its centre with the button below.
 */
export default function MapPicker({
  value,
  onChange,
  tileUrl,
  attribution,
}: {
  value: Pin | null;
  onChange: (pin: Pin) => void;
  tileUrl: string;
  attribution: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const changed = useRef(onChange);
  const initial = useRef(value);

  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!element.current) {
      return;
    }
    const start = initial.current;
    const instance = L.map(element.current, {
      center: start ? [start.lat, start.lng] : [UK_CENTRE.lat, UK_CENTRE.lng],
      zoom: start ? 15 : 5,
      scrollWheelZoom: false,
    });
    L.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) =>
      changed.current({ lat: event.latlng.lat, lng: event.latlng.lng }),
    );
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
  }, [tileUrl, attribution]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !value) {
      return;
    }
    const position: L.LatLngExpression = [value.lat, value.lng];
    if (!marker.current) {
      marker.current = L.marker(position, {
        draggable: true,
        icon: PIN_ICON,
        title: "Incident location",
        keyboard: true,
      })
        .addTo(instance)
        .on("dragend", (event) => {
          const where = (event.target as L.Marker).getLatLng();
          changed.current({ lat: where.lat, lng: where.lng });
        });
    } else {
      marker.current.setLatLng(position);
    }
    instance.setView(position, Math.max(instance.getZoom(), 15));
  }, [value]);

  return (
    <div className="col">
      <div
        ref={element}
        className="map"
        role="application"
        aria-label="Map with a pin you can drag to the exact spot"
      />
      <button
        type="button"
        className="link small"
        style={{ alignSelf: "flex-start" }}
        onClick={() => {
          const centre = map.current?.getCenter();
          if (centre) {
            changed.current({ lat: centre.lat, lng: centre.lng });
          }
        }}
      >
        Put the pin in the middle of the map
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { createRoot, type Root } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Place } from "@/types/place";
import { isMapboxConfigured, MAPBOX_TOKEN } from "@/lib/mapbox/client";
import { PlaceMarker } from "./PlaceMarker";

type TripMapProps = {
  places: Place[];
  selectedId: string | null;
  onSelectPlace: (id: string) => void;
  className?: string;
};

const MAP_STYLE = "mapbox://styles/mapbox/light-v11";

type MarkerEntry = { marker: mapboxgl.Marker; root: Root; el: HTMLDivElement };

export default function TripMap({
  places,
  selectedId,
  onSelectPlace,
  className,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const fittedSignatureRef = useRef<string>("");
  const selectRef = useRef(onSelectPlace);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    selectRef.current = onSelectPlace;
  }, [onSelectPlace]);

  const configured = isMapboxConfigured();

  // Create the map once.
  useEffect(() => {
    if (!configured || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-98.5, 39.8],
      zoom: 3,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setReady(true));
    mapRef.current = map;
    const markers = markersRef.current;

    return () => {
      markers.forEach((entry) => {
        entry.marker.remove();
        // Defer unmount to avoid React "synchronous unmount during render" warning.
        setTimeout(() => entry.root.unmount(), 0);
      });
      markers.clear();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [configured]);

  // Sync markers with the current places / selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const markers = markersRef.current;
    const liveIds = new Set(places.map((p) => p.id));

    // Remove stale markers.
    for (const [id, entry] of markers) {
      if (!liveIds.has(id)) {
        entry.marker.remove();
        setTimeout(() => entry.root.unmount(), 0);
        markers.delete(id);
      }
    }

    // Add / update markers.
    places.forEach((place, index) => {
      let entry = markers.get(place.id);
      if (!entry) {
        const el = document.createElement("div");
        const root = createRoot(el);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([place.longitude, place.latitude])
          .addTo(map);
        entry = { marker, root, el };
        markers.set(place.id, entry);
      } else {
        entry.marker.setLngLat([place.longitude, place.latitude]);
      }

      entry.root.render(
        <PlaceMarker
          index={index}
          label={place.name}
          selected={place.id === selectedId}
          visited={place.visited}
          onClick={() => selectRef.current(place.id)}
        />,
      );
    });

    // Fit bounds only when the set of places changes (not on selection).
    const signature = places
      .map((p) => `${p.id}:${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`)
      .join("|");
    if (signature !== fittedSignatureRef.current && places.length > 0) {
      fittedSignatureRef.current = signature;
      if (places.length === 1) {
        map.easeTo({
          center: [places[0].longitude, places[0].latitude],
          zoom: 13,
          duration: 500,
        });
      } else {
        const bounds = new mapboxgl.LngLatBounds();
        places.forEach((p) => bounds.extend([p.longitude, p.latitude]));
        map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 500 });
      }
    }
  }, [places, selectedId, ready]);

  // Pan to the selected place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId) return;
    const place = places.find((p) => p.id === selectedId);
    if (!place) return;
    map.easeTo({
      center: [place.longitude, place.latitude],
      duration: 450,
      zoom: Math.max(map.getZoom(), 11),
    });
  }, [selectedId, ready, places]);

  if (!configured) {
    return (
      <div
        className={
          "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted px-6 py-10 text-center " +
          (className ?? "")
        }
      >
        <p className="text-[14px] font-semibold">Map needs a Mapbox token</p>
        <p className="max-w-xs text-[12.5px] text-muted-foreground">
          Set <code className="rounded bg-background px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
          in <code className="rounded bg-background px-1 py-0.5">.env.local</code> and restart
          the dev server. See <code className="rounded bg-background px-1 py-0.5">.env.example</code>.
        </p>
      </div>
    );
  }

  return (
    <div className={"relative overflow-hidden rounded-2xl border border-border " + (className ?? "")}>
      <div ref={containerRef} className="size-full" />
      {!ready ? (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
      ) : null}
    </div>
  );
}

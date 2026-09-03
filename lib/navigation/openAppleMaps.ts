type NavigablePlace = {
  name?: string;
  /** Mapbox's canonical name, preferred for the map-search label when present. */
  resolvedName?: string;
  latitude: number;
  longitude: number;
};

/**
 * Build an Apple Maps directions URL for a place. Coordinates are authoritative;
 * the name is passed along only as a label so the destination card reads nicely.
 */
export function appleMapsUrl(place: NavigablePlace): string {
  const daddr = `${place.latitude},${place.longitude}`;
  const params = new URLSearchParams({ daddr });
  const label = place.resolvedName || place.name;
  if (label) params.set("q", label);
  return `https://maps.apple.com/?${params.toString()}`;
}

/** Open Apple Maps for turn-by-turn navigation to `place`. */
export function openAppleMaps(place: NavigablePlace): void {
  if (typeof window === "undefined") return;
  window.open(appleMapsUrl(place), "_blank", "noopener,noreferrer");
}

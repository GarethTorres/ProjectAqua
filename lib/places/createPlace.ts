import type { GeocodeResult, Place } from "@/types/place";
import { uid } from "@/lib/utils";

export type PlaceSource = {
  result: GeocodeResult;
  /** User-facing label (original itinerary text). Falls back to the Mapbox name. */
  displayName?: string;
  day?: number;
  days?: number[];
};

/** Turn a resolved geocoding result (+ parser metadata) into a stored Place. */
export function placeFromGeocode(
  source: PlaceSource | GeocodeResult,
  sortOrder: number,
): Place {
  const src: PlaceSource =
    "result" in source ? source : { result: source as GeocodeResult };
  const { result } = src;
  const name = src.displayName?.trim() || result.name;

  return {
    id: uid(),
    name,
    resolvedName: result.name !== name ? result.name : undefined,
    formattedAddress: result.formattedAddress,
    latitude: result.latitude,
    longitude: result.longitude,
    mapboxPlaceId: result.mapboxPlaceId,
    category: result.category,
    region: result.region,
    countryCode: result.countryCode,
    day: src.day,
    days: src.days && src.days.length > 0 ? src.days : undefined,
    visited: false,
    sortOrder,
  };
}

/** Re-number places 0..n-1 by their current array order. */
export function resequence(places: Place[]): Place[] {
  return places.map((p, i) => ({ ...p, sortOrder: i }));
}

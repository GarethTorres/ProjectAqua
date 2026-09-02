import type { GeocodeResult, Place } from "@/types/place";
import { uid } from "@/lib/utils";

/** Turn a geocoding result into a stored Place. */
export function placeFromGeocode(result: GeocodeResult, sortOrder: number): Place {
  return {
    id: uid(),
    name: result.name,
    formattedAddress: result.formattedAddress,
    latitude: result.latitude,
    longitude: result.longitude,
    mapboxPlaceId: result.mapboxPlaceId,
    category: result.category,
    region: result.region,
    countryCode: result.countryCode,
    visited: false,
    sortOrder,
  };
}

/** Re-number places 0..n-1 by their current array order. */
export function resequence(places: Place[]): Place[] {
  return places.map((p, i) => ({ ...p, sortOrder: i }));
}

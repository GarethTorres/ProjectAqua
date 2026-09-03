import type { GeocodeResult } from "@/types/place";
import { haversineKm } from "./inferTripRegion";
import { destinationKey } from "./parseItinerary";

/**
 * Geocoding-based de-duplication. Real itineraries repeat destinations (an
 * overview list plus a day-by-day plan). We prefer *resolved* signals — Mapbox
 * id, coordinates, canonical name — over aggressive text guessing, so two
 * genuinely different places with similar names are not merged.
 */

export type DedupeItem<T> = {
  value: T;
  result: GeocodeResult | null;
  /** Original itinerary text, for a last-resort text match. */
  text: string;
  /** Day numbers this item carried, merged into the survivor. */
  days?: number[];
};

export type DedupeMerged<T> = DedupeItem<T> & { days?: number[] };

/** ~250 m: two hits this close with the same canonical name are one place. */
const SAME_PLACE_KM = 0.25;

function mergeDays(a?: number[], b?: number[]): number[] | undefined {
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  if (set.size === 0) return undefined;
  return [...set].sort((x, y) => x - y);
}

function isSamePlace(a: DedupeItem<unknown>, b: DedupeItem<unknown>): boolean {
  const ra = a.result;
  const rb = b.result;

  if (ra && rb) {
    if (ra.mapboxPlaceId && rb.mapboxPlaceId) {
      return ra.mapboxPlaceId === rb.mapboxPlaceId;
    }
    const sameName =
      destinationKey(ra.name) === destinationKey(rb.name) &&
      destinationKey(ra.name).length > 0;
    if (sameName && haversineKm(ra, rb) <= SAME_PLACE_KM) return true;
    // Different canonical names but essentially identical coordinates.
    if (haversineKm(ra, rb) <= SAME_PLACE_KM / 5) return true;
    return false;
  }

  // Neither resolved (or one didn't) — fall back to normalized original text.
  const ka = destinationKey(a.text);
  const kb = destinationKey(b.text);
  return ka.length > 0 && ka === kb;
}

/**
 * Collapse duplicates, keeping the first occurrence and merging day numbers
 * into it. Order is otherwise preserved.
 */
export function dedupePlaces<T>(items: DedupeItem<T>[]): DedupeMerged<T>[] {
  const kept: DedupeMerged<T>[] = [];
  for (const item of items) {
    const match = kept.find((k) => isSamePlace(k, item));
    if (match) {
      match.days = mergeDays(match.days, item.days);
      continue;
    }
    kept.push({ ...item });
  }
  return kept;
}

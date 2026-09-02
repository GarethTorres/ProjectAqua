import type { GeocodeResult } from "@/types/place";
import { geocodeCandidates } from "./geocodeCandidates";

export type SearchOptions = {
  limit?: number;
  proximity?: [number, number];
  signal?: AbortSignal;
};

/**
 * Free-text place search returning several candidates. Used on the confirmation
 * screen when the user wants to re-pick a place or add one manually.
 */
export async function searchPlaces(
  query: string,
  options: SearchOptions = {},
): Promise<GeocodeResult[]> {
  return geocodeCandidates(query, {
    limit: options.limit ?? 5,
    proximity: options.proximity,
    signal: options.signal,
  });
}

import type { GeocodeResult } from "@/types/place";
import { mapboxForwardGeocode } from "./client";

export type GeocodeCandidatesOptions = {
  /** Max candidates to return (default 5). */
  limit?: number;
  /** [longitude, latitude] proximity bias. */
  proximity?: [number, number];
  signal?: AbortSignal;
};

/**
 * Forward-geocode a place name and return several ranked candidates (not just
 * the first hit), each carrying enough metadata — name, full address,
 * coordinates, region, country — to compare them in the context-resolution
 * pipeline (`resolvePlaceWithContext`).
 */
export async function geocodeCandidates(
  query: string,
  options: GeocodeCandidatesOptions = {},
): Promise<GeocodeResult[]> {
  return mapboxForwardGeocode(query, {
    limit: options.limit ?? 5,
    proximity: options.proximity,
    signal: options.signal,
  });
}

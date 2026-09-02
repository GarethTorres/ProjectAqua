import type { GeocodeResult } from "@/types/place";

/**
 * Estimate the dominant geographic region of a trip from its resolved places.
 *
 * Everything here is deterministic and side-effect free (no network, no LLM) so
 * it is straightforward to unit test. The center is a component-wise **median**
 * so a single bad geocode (e.g. a New Mexico place that resolved to Mexico)
 * barely moves it.
 */

export type GeoPoint = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation, normalised to be comparable to a std. dev. */
export function madSigma(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  const mad = median(values.map((v) => Math.abs(v - m)));
  return mad / 0.6745;
}

export type TripRegion = {
  /** Robust (median) center of the resolved places. */
  center: GeoPoint;
  /** Typical distance of a place from the center, in km (median). */
  medianRadiusKm: number;
  /** Distances beyond this are treated as suspicious. */
  outlierThresholdKm: number;
  /** Most common country code among resolved places (+ destination hint). */
  dominantCountryCode?: string;
  /** Most common region code (e.g. "US-NM"). */
  dominantRegionCode?: string;
  /** Fraction of resolved places that sit in `dominantCountryCode` (0..1). */
  countryConsensus: number;
  sampleSize: number;
};

/** Absolute floor so a tight single-city cluster never flags a nearby day trip. */
const OUTLIER_FLOOR_KM = 120;

function topKey(counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function bump(counts: Map<string, number>, key: string | undefined, by = 1) {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + by);
}

/**
 * @param results   Places that resolved on the first geocoding pass.
 * @param hint      Optional geocoded trip Destination — counted with extra
 *                  weight for country/region dominance and nudges the center.
 */
export function inferTripRegion(
  results: GeocodeResult[],
  hint?: GeocodeResult | null,
): TripRegion | null {
  if (results.length === 0 && !hint) return null;

  const centerPoints: GeoPoint[] = results.map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
  }));
  if (hint) {
    // Light weight: the destination is a hint, not a place on the itinerary.
    centerPoints.push({ latitude: hint.latitude, longitude: hint.longitude });
  }

  const center: GeoPoint = {
    latitude: median(centerPoints.map((p) => p.latitude)),
    longitude: median(centerPoints.map((p) => p.longitude)),
  };

  const distances = results.map((r) => haversineKm(center, r));
  const medianRadiusKm = distances.length > 0 ? median(distances) : 0;
  const sigma = madSigma(distances);

  // Robust upper fence: bulk radius + spread, with a relative and an absolute
  // floor. Large, genuinely spread-out road trips get a large threshold, so
  // their distant-but-legitimate stops are not flagged.
  const robustFence =
    medianRadiusKm + Math.max(6 * sigma, 0.75 * medianRadiusKm);
  const outlierThresholdKm = Math.max(
    robustFence,
    medianRadiusKm + OUTLIER_FLOOR_KM,
    OUTLIER_FLOOR_KM,
  );

  const countryCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  for (const r of results) {
    bump(countryCounts, r.countryCode);
    bump(regionCounts, r.regionCode);
  }
  bump(countryCounts, hint?.countryCode, 2);
  bump(regionCounts, hint?.regionCode, 2);

  const dominantCountryCode = topKey(countryCounts);
  const dominantRegionCode = topKey(regionCounts);
  const inDominant = dominantCountryCode
    ? results.filter((r) => r.countryCode === dominantCountryCode).length
    : 0;
  const countryConsensus =
    results.length > 0 ? inDominant / results.length : 0;

  return {
    center,
    medianRadiusKm,
    outlierThresholdKm,
    dominantCountryCode,
    dominantRegionCode,
    countryConsensus,
    sampleSize: results.length,
  };
}

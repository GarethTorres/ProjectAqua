import type { GeocodeResult } from "@/types/place";
import { haversineKm, type TripRegion } from "./inferTripRegion";

/**
 * Flag resolved places that sit implausibly far from the rest of the itinerary,
 * or in a different country than the clear majority. Deterministic and pure.
 */

export type OutlierReason = "distance" | "country" | "distance+country";

export type OutlierReport = {
  /** Index into the `results` array passed in. */
  index: number;
  distanceKm: number;
  reason: OutlierReason;
};

/** Below this sample size, "dominant cluster" is not meaningful — flag nothing. */
const MIN_SAMPLE_FOR_DETECTION = 4;
/** A country mismatch alone still needs some real distance behind it. */
const COUNTRY_MISMATCH_MIN_EXTRA_KM = 120;

export function detectOutliers(
  results: GeocodeResult[],
  region: TripRegion,
): OutlierReport[] {
  if (results.length < MIN_SAMPLE_FOR_DETECTION) return [];

  const reports: OutlierReport[] = [];

  results.forEach((result, index) => {
    const distanceKm = haversineKm(region.center, result);
    const far = distanceKm > region.outlierThresholdKm;

    const countryMismatch =
      !!region.dominantCountryCode &&
      !!result.countryCode &&
      result.countryCode !== region.dominantCountryCode &&
      region.countryConsensus >= 0.6 &&
      distanceKm > region.medianRadiusKm + COUNTRY_MISMATCH_MIN_EXTRA_KM;

    if (!far && !countryMismatch) return;

    const reason: OutlierReason =
      far && countryMismatch
        ? "distance+country"
        : far
          ? "distance"
          : "country";

    reports.push({ index, distanceKm, reason });
  });

  return reports;
}

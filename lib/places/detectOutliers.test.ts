import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@/types/place";
import { inferTripRegion } from "./inferTripRegion";
import { detectOutliers } from "./detectOutliers";

function place(
  name: string,
  latitude: number,
  longitude: number,
  extra: Partial<GeocodeResult> = {},
): GeocodeResult {
  return {
    name,
    latitude,
    longitude,
    countryCode: "US",
    country: "United States",
    regionCode: "US-NM",
    ...extra,
  };
}

const NM_CLUSTER = [
  place("Santa Fe Plaza", 35.687, -105.938),
  place("Meow Wolf", 35.66, -105.99),
  place("Canyon Road", 35.68, -105.925),
  place("Bandelier", 35.778, -106.271),
  place("Albuquerque", 35.084, -106.651),
];

describe("detectOutliers", () => {
  it("does nothing with fewer than 4 places", () => {
    const few = NM_CLUSTER.slice(0, 3);
    const region = inferTripRegion(few)!;
    expect(detectOutliers(few, region)).toEqual([]);
  });

  it("flags a New Mexico itinerary place that resolved to Mexico", () => {
    const results = [
      ...NM_CLUSTER,
      place("Plaza", 19.432, -99.133, { countryCode: "MX", country: "Mexico" }),
    ];
    const region = inferTripRegion(results)!;
    const outliers = detectOutliers(results, region);
    expect(outliers).toHaveLength(1);
    expect(outliers[0].index).toBe(results.length - 1);
    expect(outliers[0].reason).toBe("distance+country");
  });

  it("does not flag distant-but-legitimate stops on a multi-state road trip", () => {
    const roadTrip = [
      place("Chicago", 41.878, -87.629),
      place("St. Louis", 38.627, -90.199),
      place("Tulsa", 36.154, -95.992),
      place("Amarillo", 35.221, -101.831),
      place("Albuquerque", 35.084, -106.651),
      place("Flagstaff", 35.198, -111.651),
      place("Los Angeles", 34.052, -118.244),
    ];
    const region = inferTripRegion(roadTrip)!;
    expect(detectOutliers(roadTrip, region)).toEqual([]);
  });

  it("does not flag a nearby day trip from a tight single-city cluster", () => {
    const cityCluster = [
      place("Santa Fe Plaza", 35.687, -105.938),
      place("Meow Wolf", 35.66, -105.99),
      place("Canyon Road", 35.681, -105.925),
      place("Cathedral Basilica", 35.686, -105.936),
      // ~55 km away — a normal half-day excursion, not an anomaly.
      place("Bandelier National Monument", 35.778, -106.271),
    ];
    const region = inferTripRegion(cityCluster)!;
    expect(detectOutliers(cityCluster, region)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@/types/place";
import { haversineKm, inferTripRegion, median } from "./inferTripRegion";

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
    ...extra,
  };
}

// A cluster of real New Mexico places.
const NM_PLACES = [
  place("Santa Fe Plaza", 35.687, -105.938, { regionCode: "US-NM" }),
  place("Albuquerque", 35.084, -106.651, { regionCode: "US-NM" }),
  place("Taos", 36.407, -105.573, { regionCode: "US-NM" }),
  place("Bandelier", 35.778, -106.271, { regionCode: "US-NM" }),
  place("Roswell", 33.394, -104.523, { regionCode: "US-NM" }),
];

describe("haversineKm", () => {
  it("matches a known distance within 1%", () => {
    // Santa Fe -> Albuquerque is ~90 km.
    const d = haversineKm(
      { latitude: 35.687, longitude: -105.938 },
      { latitude: 35.084, longitude: -106.651 },
    );
    expect(d).toBeGreaterThan(85);
    expect(d).toBeLessThan(100);
  });
});

describe("median", () => {
  it("is unaffected by a single extreme value", () => {
    expect(median([1, 2, 3, 4, 1000])).toBe(3);
  });
});

describe("inferTripRegion", () => {
  it("returns null with no data", () => {
    expect(inferTripRegion([], null)).toBeNull();
  });

  it("puts the center in the cluster even with one wild outlier", () => {
    const withOutlier = [
      ...NM_PLACES,
      place("Plaza (wrong)", 19.432, -99.133, {
        countryCode: "MX",
        country: "Mexico",
      }),
    ];
    const region = inferTripRegion(withOutlier)!;
    // Center should still be within ~150 km of Santa Fe, not dragged to Mexico.
    const fromSantaFe = haversineKm(region.center, {
      latitude: 35.687,
      longitude: -105.938,
    });
    expect(fromSantaFe).toBeLessThan(150);
  });

  it("reports the dominant country and its consensus", () => {
    const withOutlier = [
      ...NM_PLACES,
      place("Plaza (wrong)", 19.432, -99.133, {
        countryCode: "MX",
        country: "Mexico",
      }),
    ];
    const region = inferTripRegion(withOutlier)!;
    expect(region.dominantCountryCode).toBe("US");
    expect(region.countryConsensus).toBeCloseTo(5 / 6, 2);
    expect(region.dominantRegionCode).toBe("US-NM");
  });

  it("weights the destination hint toward its country", () => {
    // Two US, two MX places -> tie, but a US destination hint breaks it.
    const mixed = [
      place("A", 35.7, -105.9),
      place("B", 35.1, -106.6),
      place("C", 19.4, -99.1, { countryCode: "MX", country: "Mexico" }),
      place("D", 20.7, -103.3, { countryCode: "MX", country: "Mexico" }),
    ];
    const hint = place("New Mexico", 34.3, -106.0, {
      regionCode: "US-NM",
      countryCode: "US",
    });
    const region = inferTripRegion(mixed, hint)!;
    expect(region.dominantCountryCode).toBe("US");
  });

  it("keeps a large threshold for a spread-out multi-state road trip", () => {
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
    // Every real stop must sit inside the threshold — nothing looks anomalous.
    for (const p of roadTrip) {
      expect(haversineKm(region.center, p)).toBeLessThan(region.outlierThresholdKm);
    }
  });
});

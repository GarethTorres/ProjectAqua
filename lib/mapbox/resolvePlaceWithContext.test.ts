import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocodeResult } from "@/types/place";
import type { TripRegion } from "@/lib/places/inferTripRegion";
import { haversineKm } from "@/lib/places/inferTripRegion";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, mapboxForwardGeocode: vi.fn() };
});

import { mapboxForwardGeocode, type ForwardGeocodeOptions } from "./client";
import {
  buildEffectiveQuery,
  chooseBetterCandidate,
  hasLocationContext,
  nameScore,
  resolveItineraryPlaces,
} from "./resolvePlaceWithContext";

const mockGeocode = vi.mocked(mapboxForwardGeocode);

// --- fixtures ---------------------------------------------------------------

function us(
  name: string,
  latitude: number,
  longitude: number,
  regionCode = "US-NM",
): GeocodeResult {
  return {
    name,
    latitude,
    longitude,
    countryCode: "US",
    country: "United States",
    regionCode,
    region: regionCode,
    formattedAddress: `${name}, USA`,
  };
}

function mx(name: string, latitude: number, longitude: number): GeocodeResult {
  return {
    name,
    latitude,
    longitude,
    countryCode: "MX",
    country: "Mexico",
    regionCode: "MX-CMX",
    region: "Ciudad de México",
    formattedAddress: `${name}, CDMX, México`,
  };
}

beforeEach(() => {
  mockGeocode.mockReset();
});

// --- pure helpers ---------------------------------------------------------------

describe("hasLocationContext", () => {
  it("is false for a bare place name", () => {
    expect(hasLocationContext("Santa Fe Plaza", "New Mexico")).toBe(false);
  });
  it("is true when the line has an explicit qualifier", () => {
    expect(hasLocationContext("Marfa, Texas")).toBe(true);
    expect(hasLocationContext("Moab Utah")).toBe(true);
    expect(hasLocationContext("Some Diner NM")).toBe(true);
    expect(hasLocationContext("Hotel in Canada")).toBe(true);
  });
  it("is true when the destination text is already present", () => {
    expect(hasLocationContext("Santa Fe Plaza", "Santa Fe")).toBe(true);
  });
});

describe("buildEffectiveQuery", () => {
  it("appends the destination when the line lacks context", () => {
    expect(buildEffectiveQuery("Santa Fe Plaza", "New Mexico")).toBe(
      "Santa Fe Plaza, New Mexico",
    );
  });
  it("leaves lines that already carry context alone", () => {
    expect(buildEffectiveQuery("Taos, NM", "New Mexico")).toBe("Taos, NM");
  });
  it("is a no-op without a destination", () => {
    expect(buildEffectiveQuery("Plaza")).toBe("Plaza");
  });
});

describe("nameScore", () => {
  it("scores exact and containment matches high", () => {
    expect(nameScore("Santa Fe Plaza", "Santa Fe Plaza")).toBe(1);
    expect(nameScore("Meow Wolf", "Meow Wolf Santa Fe")).toBeGreaterThan(0.8);
  });
  it("scores unrelated names low", () => {
    expect(nameScore("Plaza", "Grand Canyon")).toBeLessThan(0.3);
  });
});

// --- chooseBetterCandidate ----------------------------------------------------

const MO_REGION: TripRegion = {
  center: { latitude: 37.21, longitude: -93.29 }, // Springfield, MO
  medianRadiusKm: 60,
  outlierThresholdKm: 250,
  dominantCountryCode: "US",
  dominantRegionCode: "US-MO",
  countryConsensus: 1,
  sampleSize: 6,
};

describe("chooseBetterCandidate", () => {
  it("picks the cluster-consistent option among several same-name candidates", () => {
    const original = us("Springfield", 39.78, -89.65, "US-IL"); // Springfield, IL
    const candidates = [
      us("Springfield", 39.78, -89.65, "US-IL"),
      us("Springfield", 37.21, -93.29, "US-MO"),
      us("Springfield", 42.101, -72.59, "US-MA"),
    ];
    const better = chooseBetterCandidate(
      original,
      candidates,
      MO_REGION,
      "Springfield",
    );
    expect(better).not.toBeNull();
    expect(better!.regionCode).toBe("US-MO");
    expect(better!.latitude).toBeCloseTo(37.21, 1);
  });

  it("keeps the original when it is not an outlier", () => {
    const original = us("Springfield", 37.3, -93.4, "US-MO");
    expect(
      chooseBetterCandidate(original, [original], MO_REGION, "Springfield"),
    ).toBeNull();
  });

  it("keeps a truly remote stop whose re-search returns the same place", () => {
    const original = us("Grand Canyon", 36.06, -112.14, "US-AZ");
    // Re-search near the trip center still only knows the real Grand Canyon.
    const better = chooseBetterCandidate(
      original,
      [us("Grand Canyon", 36.06, -112.14, "US-AZ")],
      MO_REGION,
      "Grand Canyon",
    );
    expect(better).toBeNull();
  });

  it("does not swap in a candidate that is only marginally closer", () => {
    const original = us("Somewhere", 41.0, -93.29, "US-IA"); // ~420 km N of center
    const candidate = us("Somewhere", 39.9, -93.29, "US-MO"); // ~300 km, still > 0.6x
    expect(
      chooseBetterCandidate(original, [candidate], MO_REGION, "Somewhere"),
    ).toBeNull();
  });
});

// --- resolveItineraryPlaces (mocked network) --------------------------------

const NM_BBOX = { latMin: 31, latMax: 38, lonMin: -110, lonMax: -102 };
function proximityInNM(opts: ForwardGeocodeOptions): boolean {
  const p = opts.proximity;
  if (!p) return false;
  const [lon, lat] = p;
  return (
    lat >= NM_BBOX.latMin &&
    lat <= NM_BBOX.latMax &&
    lon >= NM_BBOX.lonMin &&
    lon <= NM_BBOX.lonMax
  );
}

const NM_PLAZA_MAYOR = us("Plaza Mayor", 35.69, -105.94);
const MX_PLAZA_MAYOR = mx("Plaza Mayor", 19.36, -99.15);

/**
 * "Plaza Mayor" exists (same name) in both Santa Fe and Mexico City. Mapbox
 * ranks the Mexico City one first unless the search is biased into New Mexico.
 */
function nmItineraryImpl() {
  return async (query: string, opts: ForwardGeocodeOptions = {}) => {
    const q = query.toLowerCase();
    if (q.startsWith("new mexico")) return [us("New Mexico", 34.3, -106.0)];
    if (q.includes("plaza mayor")) {
      return proximityInNM(opts)
        ? [NM_PLAZA_MAYOR, MX_PLAZA_MAYOR]
        : [MX_PLAZA_MAYOR, NM_PLAZA_MAYOR];
    }
    if (q.includes("meow wolf")) {
      return [us("Meow Wolf Santa Fe's House of Eternal Return", 35.654, -105.997)];
    }
    if (q.includes("albuquerque")) return [us("Albuquerque", 35.084, -106.651)];
    if (q.includes("taos")) return [us("Taos", 36.407, -105.573)];
    if (q.includes("bandelier")) {
      return [us("Bandelier National Monument", 35.778, -106.271)];
    }
    if (q.includes("roswell")) return [us("Roswell", 33.394, -104.523)];
    return [];
  };
}

// Ambiguous line first, so the first pass has no cluster to lean on yet.
const NM_QUERIES = [
  "Plaza Mayor",
  "Meow Wolf Santa Fe",
  "Albuquerque",
  "Bandelier National Monument",
  "Roswell",
];

describe("resolveItineraryPlaces — outlier correction", () => {
  it("keeps an ambiguous place in-region when a Destination is given", async () => {
    mockGeocode.mockImplementation(nmItineraryImpl());

    const outcome = await resolveItineraryPlaces(NM_QUERIES, {
      destination: "New Mexico",
    });

    expect(outcome.unresolved).toEqual([]);
    const plaza = outcome.resolved.find((p) => p.query === "Plaza Mayor")!;
    expect(plaza.result!.countryCode).toBe("US");
    expect(plaza.result!.latitude).toBeCloseTo(35.69, 1);
  });

  it("corrects a Mexico mismatch with no destination, using the cluster the rest form", async () => {
    mockGeocode.mockImplementation(nmItineraryImpl());

    const outcome = await resolveItineraryPlaces(NM_QUERIES);

    const plaza = outcome.resolved.find((p) => p.query === "Plaza Mayor")!;
    expect(plaza.autoCorrected).toBe(true);
    expect(plaza.result!.countryCode).toBe("US");
    expect(plaza.result!.latitude).toBeCloseTo(35.69, 1);
    expect(plaza.note).toMatch(/trip area/i);
    expect(outcome.region!.dominantCountryCode).toBe("US");
  });

  it("leaves a legitimate multi-state road trip untouched", async () => {
    const cities: Record<string, GeocodeResult> = {
      chicago: us("Chicago", 41.878, -87.629, "US-IL"),
      "st. louis": us("St. Louis", 38.627, -90.199, "US-MO"),
      tulsa: us("Tulsa", 36.154, -95.992, "US-OK"),
      amarillo: us("Amarillo", 35.221, -101.831, "US-TX"),
      albuquerque: us("Albuquerque", 35.084, -106.651, "US-NM"),
      flagstaff: us("Flagstaff", 35.198, -111.651, "US-AZ"),
      "los angeles": us("Los Angeles", 34.052, -118.244, "US-CA"),
    };
    mockGeocode.mockImplementation(async (query: string) => {
      const hit = cities[query.toLowerCase()];
      return hit ? [hit] : [];
    });

    const queries = Object.keys(cities);
    const outcome = await resolveItineraryPlaces(queries);

    expect(outcome.resolved).toHaveLength(7);
    expect(outcome.resolved.every((p) => p.autoCorrected === false)).toBe(true);
    for (const p of outcome.resolved) {
      expect(p.result).toEqual(cities[p.query.toLowerCase()]);
    }
    // Exactly one lookup per line: no destination probe, no bare-query retry,
    // no outlier re-resolution.
    expect(mockGeocode.mock.calls).toHaveLength(queries.length);
  });

  it("does not overwrite a genuine remote stop that only has one real match", async () => {
    const tight = [
      "Santa Fe Plaza",
      "Meow Wolf",
      "Canyon Road",
      "Cathedral Basilica",
      "Grand Canyon",
    ];
    mockGeocode.mockImplementation(async (query: string) => {
      const q = query.toLowerCase();
      if (q.includes("santa fe plaza")) return [us("Santa Fe Plaza", 35.687, -105.938)];
      if (q.includes("meow wolf")) return [us("Meow Wolf", 35.66, -105.99)];
      if (q.includes("canyon road")) return [us("Canyon Road", 35.681, -105.925)];
      if (q.includes("cathedral basilica")) {
        return [us("Cathedral Basilica", 35.686, -105.936)];
      }
      if (q.includes("grand canyon")) {
        return [us("Grand Canyon", 36.06, -112.14, "US-AZ")];
      }
      return [];
    });

    const outcome = await resolveItineraryPlaces(tight, {
      destination: "Santa Fe, NM",
    });

    const gc = outcome.resolved.find((p) => p.query === "Grand Canyon")!;
    expect(gc.autoCorrected).toBe(false);
    expect(gc.result!.latitude).toBeCloseTo(36.06, 2);
    // Sanity: it really was far enough to be a distance outlier.
    expect(
      haversineKm(outcome.region!.center, gc.result!),
    ).toBeGreaterThan(outcome.region!.outlierThresholdKm);
  });
});

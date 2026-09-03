import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@/types/place";
import { dedupePlaces, type DedupeItem } from "./dedupePlaces";

function res(over: Partial<GeocodeResult> & { name: string }): GeocodeResult {
  return {
    latitude: 35.68,
    longitude: -105.94,
    countryCode: "US",
    country: "United States",
    ...over,
  };
}

function item(
  text: string,
  result: GeocodeResult | null,
  days?: number[],
): DedupeItem<string> {
  return { value: text, result, text, days };
}

describe("dedupePlaces", () => {
  it("merges two hits with the same Mapbox id and unions their days", () => {
    const a = res({ name: "Santa Fe Plaza", mapboxPlaceId: "poi.123" });
    const b = res({ name: "Santa Fe Plaza", mapboxPlaceId: "poi.123" });
    const out = dedupePlaces([
      item("Santa Fe Plaza", a, [1]),
      item("Santa Fe Plaza", b, [2]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].days).toEqual([1, 2]);
  });

  it("merges a smart-quote / straight-quote pair before geocoding", () => {
    const out = dedupePlaces([
      item("Georgia O’Keeffe Museum", null),
      item("Georgia O'Keeffe Museum", null),
    ]);
    expect(out).toHaveLength(1);
  });

  it("merges an alias that resolves to the same coordinates", () => {
    const full = res({
      name: "Kasha-Katuwe Tent Rocks National Monument",
      latitude: 35.6606,
      longitude: -106.4139,
      mapboxPlaceId: "poi.tentrocks",
    });
    const alias = res({
      name: "Kasha-Katuwe Tent Rocks National Monument",
      latitude: 35.6606,
      longitude: -106.4139,
      mapboxPlaceId: "poi.tentrocks",
    });
    const out = dedupePlaces([item("Tent Rocks", alias), item("KKTR NM", full)]);
    expect(out).toHaveLength(1);
  });

  it("does NOT merge two different places with similar names", () => {
    const springfieldIL = res({
      name: "Springfield",
      latitude: 39.78,
      longitude: -89.65,
      mapboxPlaceId: "place.il",
    });
    const springfieldMO = res({
      name: "Springfield",
      latitude: 37.21,
      longitude: -93.29,
      mapboxPlaceId: "place.mo",
    });
    const out = dedupePlaces([
      item("Springfield", springfieldIL),
      item("Springfield", springfieldMO),
    ]);
    expect(out).toHaveLength(2);
  });
});

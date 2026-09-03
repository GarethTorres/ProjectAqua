import type { GeocodeResult } from "@/types/place";

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export function isMapboxConfigured(): boolean {
  return MAPBOX_TOKEN.trim().length > 0;
}

export class MapboxError extends Error {
  code: "no-token" | "request-failed" | "network";
  constructor(code: MapboxError["code"], message: string) {
    super(message);
    this.name = "MapboxError";
    this.code = code;
  }
}

export type ForwardGeocodeOptions = {
  limit?: number;
  /** [longitude, latitude] to bias results toward. */
  proximity?: [number, number];
  signal?: AbortSignal;
};

type SearchContext = {
  region?: { name?: string; region_code?: string; region_code_full?: string };
  country?: { name?: string; country_code?: string };
};

type SearchFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    name_preferred?: string;
    mapbox_id?: string;
    feature_type?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
    context?: SearchContext;
  };
};

function toResult(feature: SearchFeature): GeocodeResult | null {
  const coords = feature.geometry?.coordinates;
  const p = feature.properties ?? {};
  if (!coords || coords.length < 2) return null;
  const [longitude, latitude] = coords;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;

  const ctx = p.context ?? {};
  return {
    name: p.name_preferred || p.name || "Unnamed place",
    formattedAddress: p.full_address || p.place_formatted,
    latitude,
    longitude,
    mapboxPlaceId: p.mapbox_id,
    category: p.poi_category?.[0] || p.feature_type,
    region: ctx.region?.name,
    regionCode: ctx.region?.region_code_full || ctx.region?.region_code,
    country: ctx.country?.name,
    countryCode: ctx.country?.country_code,
  };
}

/**
 * Low-level Mapbox forward search. Uses the **Search Box** `/forward` endpoint
 * rather than the Geocoding API: PinTrip's input is place / POI names ("Meow
 * Wolf Santa Fe", "Bandelier National Monument"), which Search Box resolves far
 * more accurately than address-oriented geocoding. Everything else in
 * `lib/mapbox` builds on this so there is a single place that talks to the
 * network.
 */
export async function mapboxForwardGeocode(
  query: string,
  options: ForwardGeocodeOptions = {},
): Promise<GeocodeResult[]> {
  if (!isMapboxConfigured()) {
    throw new MapboxError(
      "no-token",
      "NEXT_PUBLIC_MAPBOX_TOKEN is not set. Add it to .env.local — see .env.example.",
    );
  }

  const q = query.trim().slice(0, 256);
  if (!q) return [];

  const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward");
  url.searchParams.set("q", q);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set(
    "limit",
    String(Math.min(10, Math.max(1, options.limit ?? 1))),
  );
  if (options.proximity) {
    url.searchParams.set("proximity", options.proximity.join(","));
  }

  // A bulk itinerary import fires many requests in quick succession; Search Box
  // can answer some with 429. Retry rate-limit / transient errors a few times
  // with backoff before giving up on that one line.
  const backoffMs = [400, 900, 1800];
  let response: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(url, { signal: options.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (attempt < backoffMs.length) {
        await sleep(backoffMs[attempt], options.signal);
        continue;
      }
      throw new MapboxError(
        "network",
        "Could not reach Mapbox. Check your connection.",
      );
    }

    if (response.ok) break;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < backoffMs.length) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs[attempt],
        options.signal,
      );
      continue;
    }
    throw new MapboxError(
      "request-failed",
      `Mapbox request failed (${response.status}).`,
    );
  }

  const data = (await response.json()) as { features?: SearchFeature[] };
  return (data.features ?? [])
    .map(toResult)
    .filter((r): r is GeocodeResult => r !== null);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

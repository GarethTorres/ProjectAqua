import type { GeocodeResult } from "@/types/place";
import {
  haversineKm,
  inferTripRegion,
  type TripRegion,
} from "@/lib/places/inferTripRegion";
import { detectOutliers } from "@/lib/places/detectOutliers";
import { MapboxError } from "./client";
import { geocodeCandidates } from "./geocodeCandidates";

/**
 * Context-aware itinerary geocoding.
 *
 * Flow (all deterministic, no LLM):
 *   1. Geocode the trip Destination first and use it as proximity bias.
 *   2. First pass — geocode every place (appending the destination when the
 *      line has no location context of its own).
 *   3. Infer the dominant trip region from what resolved (median center).
 *   4. Detect places that are geographic outliers.
 *   5. Re-resolve only those, biased to the trip center, and swap the result
 *      in **only** when a candidate is clearly more plausible.
 */

export type ResolvedPlace = {
  query: string;
  result: GeocodeResult | null;
  autoCorrected: boolean;
  note?: string;
};

export type ResolveOutcome = {
  places: ResolvedPlace[];
  resolved: ResolvedPlace[];
  unresolved: string[];
  region: TripRegion | null;
};

export type ResolveOptions = {
  destination?: string;
  signal?: AbortSignal;
};

// --- pure helpers (exported for testing) ---------------------------------------

const US_STATES: string[] = [
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming",
];
const US_STATE_ABBR = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy",
]);
const COUNTRY_WORDS = /\b(usa|u\.s\.a\.|united states|mexico|canada|uk|england)\b/;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does the itinerary line already pin down where it is? If so we should NOT
 * blindly append the trip destination to it.
 */
export function hasLocationContext(query: string, destination?: string): boolean {
  const raw = query.trim();
  if (!raw) return false;
  const q = normalizeName(raw);

  // "Something, Somewhere" — an explicit place qualifier.
  if (/,\s*\S/.test(raw)) return true;
  if (COUNTRY_WORDS.test(q)) return true;

  const tokens = q.split(" ");
  const lastTwo = tokens.slice(-2).join(" ");
  const lastOne = tokens[tokens.length - 1] ?? "";
  if (US_STATES.some((s) => q.endsWith(` ${s}`) || q === s)) return true;
  if (US_STATES.includes(lastTwo)) return true;
  if (US_STATE_ABBR.has(lastOne)) return true;

  if (destination) {
    const destTokens = normalizeName(destination)
      .split(" ")
      .filter((t) => t.length > 2);
    if (destTokens.length > 0 && destTokens.every((t) => q.includes(t))) {
      return true;
    }
  }

  return false;
}

/** Build the query we actually send to Mapbox for a first-pass lookup. */
export function buildEffectiveQuery(query: string, destination?: string): string {
  const dest = destination?.trim();
  if (!dest) return query.trim();
  if (hasLocationContext(query, dest)) return query.trim();
  // Very freeform destinations are unreliable to append.
  if (normalizeName(dest).split(" ").length > 6) return query.trim();
  return `${query.trim()}, ${dest}`;
}

/** 0..1 similarity between the original itinerary text and a candidate's name. */
export function nameScore(query: string, candidateName: string): number {
  const a = normalizeName(query.replace(/,.*$/, ""));
  const b = normalizeName(candidateName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;

  const at = new Set(a.split(" "));
  const bt = new Set(b.split(" "));
  let intersection = 0;
  for (const t of at) if (bt.has(t)) intersection += 1;
  return intersection / Math.max(at.size, bt.size);
}

const MIN_NAME_SCORE = 0.6;
/** The replacement must cut the distance-to-center by at least this factor. */
const MAX_DISTANCE_RATIO = 0.6;
/** How many km of proximity distance is worth one point of name-match score. */
const PROXIMITY_KM_PER_POINT = 500;

/**
 * Re-rank a candidate list by how well each name matches the itinerary text,
 * nudged (gently) toward the proximity point. Mapbox often ranks a generically
 * named nearby street above the exact-named POI a few entries down — this pulls
 * the real match back to the top.
 */
export function pickByRelevance(
  query: string,
  candidates: GeocodeResult[],
  proximity?: [number, number],
): GeocodeResult | null {
  if (candidates.length === 0) return null;
  const origin = proximity
    ? { latitude: proximity[1], longitude: proximity[0] }
    : null;

  let best: GeocodeResult | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    let score = nameScore(query, candidate.name) * 2;
    if (origin) {
      score -= haversineKm(origin, candidate) / PROXIMITY_KM_PER_POINT;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Given the original (suspicious) result and fresh candidates searched with the
 * trip center as bias, return a better candidate, or `null` to keep the
 * original. Conservative on purpose: a legitimately remote stop whose re-search
 * returns the same place is never overwritten.
 */
export function chooseBetterCandidate(
  original: GeocodeResult,
  candidates: GeocodeResult[],
  region: TripRegion,
  query: string,
): GeocodeResult | null {
  const originalDistance = haversineKm(region.center, original);
  // Only ever act on something that is actually an outlier.
  if (originalDistance <= region.outlierThresholdKm) return null;

  let best: GeocodeResult | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const ns = nameScore(query, candidate.name);
    if (ns < MIN_NAME_SCORE) continue;

    const distance = haversineKm(region.center, candidate);
    if (distance > region.outlierThresholdKm) continue; // don't swap one outlier for another
    if (
      region.dominantCountryCode &&
      candidate.countryCode &&
      candidate.countryCode !== region.dominantCountryCode
    ) {
      continue; // wrong country
    }

    const regionBonus =
      candidate.regionCode && candidate.regionCode === region.dominantRegionCode
        ? 0.5
        : 0;
    const score =
      ns * 2 -
      distance / (region.medianRadiusKm + 50) +
      regionBonus;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) return null;
  // Must be *clearly* more plausible: materially closer to the cluster.
  if (haversineKm(region.center, best) >= originalDistance * MAX_DISTANCE_RATIO) {
    return null;
  }
  // Same coordinates as the original (unique-name remote stop) — nothing to fix.
  if (haversineKm(best, original) < 1) return null;

  return best;
}

// --- orchestrator ------------------------------------------------------------

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
function isNoToken(err: unknown): boolean {
  return err instanceof MapboxError && err.code === "no-token";
}

async function geocodeOne(
  query: string,
  proximity: [number, number] | undefined,
  signal: AbortSignal | undefined,
): Promise<GeocodeResult | null> {
  const [first] = await geocodeCandidates(query, { limit: 1, proximity, signal });
  return first ?? null;
}

/**
 * First-pass lookup for a single itinerary line: fetch a short candidate list
 * and re-rank it by name relevance. If the appended-destination query yields
 * only weak name matches, retry with the bare line and merge.
 */
async function geocodeBestMatch(
  query: string,
  effectiveQuery: string,
  proximity: [number, number] | undefined,
  signal: AbortSignal | undefined,
): Promise<GeocodeResult | null> {
  const primary = await geocodeCandidates(effectiveQuery, {
    limit: 5,
    proximity,
    signal,
  });
  let pick = pickByRelevance(query, primary, proximity);

  const weak = !pick || nameScore(query, pick.name) < MIN_NAME_SCORE;
  if (weak && effectiveQuery !== query) {
    const bare = await geocodeCandidates(query, { limit: 5, proximity, signal });
    pick = pickByRelevance(query, [...primary, ...bare], proximity) ?? pick;
  }

  return pick ?? primary[0] ?? null;
}

export async function resolveItineraryPlaces(
  queries: string[],
  options: ResolveOptions = {},
): Promise<ResolveOutcome> {
  const { destination, signal } = options;

  // 1. Destination hint.
  let hint: GeocodeResult | null = null;
  let bias: [number, number] | undefined;
  if (destination?.trim()) {
    try {
      hint = await geocodeOne(destination.trim(), undefined, signal);
      if (hint) bias = [hint.longitude, hint.latitude];
    } catch (err) {
      if (isAbort(err) || isNoToken(err)) throw err;
      // A failed destination lookup is non-fatal.
    }
  }

  // 2. First pass.
  type FirstPass = { query: string; result: GeocodeResult | null };
  const first: FirstPass[] = [];
  let progressive = bias;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const effective = buildEffectiveQuery(query, destination);
    try {
      const result = await geocodeBestMatch(
        query,
        effective,
        progressive,
        signal,
      );
      first.push({ query, result });
      if (result && !progressive) {
        progressive = [result.longitude, result.latitude];
      }
    } catch (err) {
      if (isAbort(err) || isNoToken(err)) throw err;
      if (err instanceof MapboxError && i === 0 && !hint) throw err;
      first.push({ query, result: null });
    }
  }

  const resolvedFirst = first.filter(
    (f): f is { query: string; result: GeocodeResult } => f.result !== null,
  );

  // 3. Infer region.
  const region = inferTripRegion(
    resolvedFirst.map((f) => f.result),
    hint,
  );

  // 4 + 5. Outlier detection and correction.
  const outlierIndices = new Set<number>();
  if (region) {
    for (const report of detectOutliers(
      resolvedFirst.map((f) => f.result),
      region,
    )) {
      outlierIndices.add(report.index);
    }
  }

  const places: ResolvedPlace[] = [];
  for (const pass of first) {
    if (!pass.result) {
      places.push({ query: pass.query, result: null, autoCorrected: false });
      continue;
    }

    const resolvedIndex = resolvedFirst.indexOf(
      pass as { query: string; result: GeocodeResult },
    );

    if (region && resolvedIndex >= 0 && outlierIndices.has(resolvedIndex)) {
      try {
        const candidates = await geocodeCandidates(pass.query, {
          limit: 5,
          proximity: [region.center.longitude, region.center.latitude],
          signal,
        });
        const better = chooseBetterCandidate(
          pass.result,
          candidates,
          region,
          pass.query,
        );
        if (better) {
          places.push({
            query: pass.query,
            result: better,
            autoCorrected: true,
            note: "Matched near your trip area",
          });
          continue;
        }
      } catch (err) {
        if (isAbort(err)) throw err;
        // Otherwise keep the original result.
      }
    }

    places.push({
      query: pass.query,
      result: pass.result,
      autoCorrected: false,
    });
  }

  const resolved = places.filter((p) => p.result !== null);
  const unresolved = places
    .filter((p) => p.result === null)
    .map((p) => p.query);

  return { places, resolved, unresolved, region };
}

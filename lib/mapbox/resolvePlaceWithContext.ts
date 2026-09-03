import type { GeocodeResult } from "@/types/place";
import type { GeoContext } from "@/types/itinerary";
import {
  haversineKm,
  inferTripRegion,
  median,
  type GeoPoint,
  type TripRegion,
} from "@/lib/places/inferTripRegion";
import { detectOutliers } from "@/lib/places/detectOutliers";
import { isSelfSufficientPlaceName } from "@/lib/places/classifyLine";
import { dedupePlaces } from "@/lib/places/dedupePlaces";
import {
  US_STATES,
  US_STATE_ABBR,
  COUNTRY_WORD_RE,
} from "@/lib/places/geographyData";
import { MapboxError } from "./client";
import { geocodeCandidates } from "./geocodeCandidates";

/**
 * Context-aware itinerary geocoding (deterministic, no LLM).
 *
 * Per place, the geographic-context priority is:
 *   1. Explicit local section (city) context
 *   2. Explicit trip Destination
 *   3. Nearby already-resolved itinerary places (shared context)
 *   4. Dominant inferred trip region
 *   5. Global Mapbox result
 *
 * Flow: geocode the Destination → first pass with context-qualified queries →
 * infer the dominant region → re-resolve only geographic outliers, replacing a
 * result solely when a candidate is *clearly* more plausible (distance alone is
 * never enough).
 */

/** One itinerary line to resolve, with the context the parser attached. */
export type ResolveInput = {
  originalText: string;
  displayName?: string;
  context?: GeoContext[];
  day?: number;
  days?: number[];
};

export type ResolvedPlace = {
  /** Original itinerary text (kept as `query` for backward compatibility). */
  query: string;
  originalText: string;
  displayName: string;
  context: GeoContext[];
  day?: number;
  days?: number[];
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
 * blindly append the trip destination / context to it.
 */
export function hasLocationContext(query: string, destination?: string): boolean {
  const raw = query.trim();
  if (!raw) return false;
  const q = normalizeName(raw);

  if (/,\s*\S/.test(raw)) return true;
  if (COUNTRY_WORD_RE.test(q)) return true;

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

/**
 * Build a context-qualified query, e.g.
 *   "Cathedral Basilica" + [Santa Fe, New Mexico] + dest "New Mexico"
 *     → "Cathedral Basilica, Santa Fe, New Mexico"
 * Self-standing features ("… National Park") never get a *city* appended.
 * Parts already present in the base text are skipped.
 */
export function buildContextualQuery(
  input: Pick<ResolveInput, "originalText" | "context">,
  destination?: string,
): string {
  const base = input.originalText.trim();
  if (hasLocationContext(base, destination)) return base;

  const selfSufficient = isSelfSufficientPlaceName(base);
  const baseTokens = new Set(normalizeName(base).split(" ").filter(Boolean));
  const contextList = input.context ?? [];

  // Mapbox Search Box degrades sharply with extra trailing words, so append at
  // most ONE geographic qualifier — the nearest city (skipped for self-standing
  // features), else a region, else the trip destination — and space-join it.
  const candidates: string[] = [];
  if (!selfSufficient) {
    const city = contextList.find((c) => c.kind === "city");
    if (city) candidates.push(city.text);
  }
  const region = contextList.find((c) => c.kind === "region");
  if (region) candidates.push(region.text);
  if (destination && normalizeName(destination).split(" ").length <= 6) {
    candidates.push(destination);
  }

  for (const qualifier of candidates) {
    const toks = normalizeName(qualifier).split(" ").filter(Boolean);
    if (toks.length === 0) continue;
    if (toks.every((t) => baseTokens.has(t))) continue; // already covered — try next
    return `${base} ${qualifier}`;
  }
  return base;
}

/** Back-compat shim: the string-only form of `buildContextualQuery`. */
export function buildEffectiveQuery(query: string, destination?: string): string {
  return buildContextualQuery({ originalText: query, context: [] }, destination);
}

/** 0..1 similarity between the original itinerary text and a candidate's name. */
export function nameScore(query: string, candidateName: string): number {
  const a = normalizeName(query.replace(/,.*$/, ""));
  const b = normalizeName(candidateName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;

  // Jaccard overlap of word sets — stricter than intersection/maxSize, so a
  // one-shared-word match like "Mass Ascension" ↔ "Calle Ascensión" scores low.
  const at = new Set(a.split(" "));
  const bt = new Set(b.split(" "));
  let intersection = 0;
  for (const t of at) if (bt.has(t)) intersection += 1;
  const union = at.size + bt.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const MIN_NAME_SCORE = 0.6;
/** A pick this strong makes a second (bare) lookup unnecessary. */
const STRONG_NAME_SCORE = 0.9;
/**
 * Below this, a latin-text query and its best candidate share almost no words —
 * better to report the line as unresolved than to drop a confident wrong pin.
 */
const REJECT_NAME_SCORE = 0.34;
/** The replacement must cut the distance-to-center by at least this factor. */
const MAX_DISTANCE_RATIO = 0.6;
/** Km of anchor distance worth one point of name-match score. */
const ANCHOR_KM_PER_POINT = 400;
const PROXIMITY_KM_PER_POINT = 500;

/**
 * Re-rank a candidate list by name relevance, gently nudged toward `proximity`.
 * (Kept for direct use / tests; the resolver uses `rankCandidates` internally.)
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
    if (origin) score -= haversineKm(origin, candidate) / PROXIMITY_KM_PER_POINT;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Like `pickByRelevance` but anchored on a point and safe for non-latin text. */
function rankCandidates(
  text: string,
  candidates: GeocodeResult[],
  anchor: GeoPoint | null,
): GeocodeResult | null {
  if (candidates.length === 0) return null;
  const informativeName = normalizeName(text.replace(/,.*$/, "")) !== "";

  let best: GeocodeResult | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    let score = 0;
    if (informativeName) score += nameScore(text, candidate.name) * 2;
    if (anchor) score -= haversineKm(anchor, candidate) / ANCHOR_KM_PER_POINT;
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
 * original. Conservative: distance alone never triggers a swap.
 */
export function chooseBetterCandidate(
  original: GeocodeResult,
  candidates: GeocodeResult[],
  region: TripRegion,
  query: string,
): GeocodeResult | null {
  const originalDistance = haversineKm(region.center, original);
  if (originalDistance <= region.outlierThresholdKm) return null;

  let best: GeocodeResult | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const ns = nameScore(query, candidate.name);
    if (ns < MIN_NAME_SCORE) continue;

    const distance = haversineKm(region.center, candidate);
    if (distance > region.outlierThresholdKm) continue;
    if (
      region.dominantCountryCode &&
      candidate.countryCode &&
      candidate.countryCode !== region.dominantCountryCode
    ) {
      continue;
    }

    const regionBonus =
      candidate.regionCode && candidate.regionCode === region.dominantRegionCode
        ? 0.5
        : 0;
    const score = ns * 2 - distance / (region.medianRadiusKm + 50) + regionBonus;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) return null;
  if (haversineKm(region.center, best) >= originalDistance * MAX_DISTANCE_RATIO) {
    return null;
  }
  if (haversineKm(best, original) < 1) return null;
  return best;
}

// --- orchestrator ------------------------------------------------------------

/** Gentle pacing between requests so a bulk import doesn't trip rate limits. */
const REQUEST_SPACING_MS =
  process.env.NODE_ENV === "test" ? 0 : 130;
function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
function isNoToken(err: unknown): boolean {
  return err instanceof MapboxError && err.code === "no-token";
}

function toInput(item: string | ResolveInput): Required<Pick<ResolveInput, "originalText" | "displayName" | "context">> &
  ResolveInput {
  if (typeof item === "string") {
    return { originalText: item, displayName: item, context: [] };
  }
  return {
    ...item,
    displayName: item.displayName ?? item.originalText,
    context: item.context ?? [],
  };
}

function dedupeResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const out: GeocodeResult[] = [];
  for (const r of results) {
    const key = r.mapboxPlaceId ?? `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

type FirstPass = {
  input: ReturnType<typeof toInput>;
  result: GeocodeResult | null;
};

function contextAnchor(
  input: ReturnType<typeof toInput>,
  resolvedSoFar: FirstPass[],
  hint: GeocodeResult | null,
  progressive: GeoPoint | null,
): GeoPoint | null {
  const resolvedNeighbours = resolvedSoFar.filter((r) => r.result);
  const keysOf = (kind?: GeoContext["kind"]) =>
    new Set(
      input.context
        .filter((c) => !kind || c.kind === kind)
        .map((c) => normalizeName(c.text))
        .filter(Boolean),
    );
  const centroidOf = (rows: FirstPass[]): GeoPoint => ({
    latitude: median(rows.map((n) => n.result!.latitude)),
    longitude: median(rows.map((n) => n.result!.longitude)),
  });

  // Prefer neighbours that share the most specific (city) context, then any.
  for (const keys of [keysOf("city"), keysOf()]) {
    if (keys.size === 0) continue;
    const shared = resolvedNeighbours.filter((r) =>
      r.input.context.some((c) => keys.has(normalizeName(c.text))),
    );
    if (shared.length > 0) return centroidOf(shared);
  }

  if (hint) return { latitude: hint.latitude, longitude: hint.longitude };

  const resolved = resolvedSoFar.filter((r) => r.result).map((r) => r.result!);
  if (resolved.length >= 3) {
    const region = inferTripRegion(resolved);
    if (region) return region.center;
  }
  return progressive;
}

async function resolveOne(
  input: ReturnType<typeof toInput>,
  destination: string | undefined,
  anchor: GeoPoint | null,
  signal: AbortSignal | undefined,
): Promise<GeocodeResult | null> {
  const bare = input.originalText.trim();
  const contextual = buildContextualQuery(input, destination);
  const selfSufficient = isSelfSufficientPlaceName(bare);
  const proximity: [number, number] | undefined = anchor
    ? [anchor.longitude, anchor.latitude]
    : undefined;

  const primaryQuery = selfSufficient ? bare : contextual;
  let pool = await geocodeCandidates(primaryQuery, {
    limit: 5,
    proximity,
    signal,
  });
  let pick = rankCandidates(bare, pool, anchor);

  const strong = pick != null && nameScore(bare, pick.name) >= STRONG_NAME_SCORE;
  if (!strong && primaryQuery !== bare) {
    await delay(REQUEST_SPACING_MS);
    const extra = await geocodeCandidates(bare, { limit: 5, proximity, signal });
    pool = dedupeResults([...pool, ...extra]);
    pick = rankCandidates(bare, pool, anchor) ?? pick;
  }

  const chosen = pick ?? pool[0] ?? null;
  if (!chosen) return null;

  // Guard against confident garbage: a latin query whose best match shares no
  // words with it is almost certainly wrong. Report it as unresolved instead.
  const informativeName = normalizeName(bare.replace(/,.*$/, "")) !== "";
  if (
    informativeName &&
    !selfSufficient &&
    nameScore(bare, chosen.name) < REJECT_NAME_SCORE
  ) {
    return null;
  }
  return chosen;
}

export async function resolveItineraryPlaces(
  items: Array<string | ResolveInput>,
  options: ResolveOptions = {},
): Promise<ResolveOutcome> {
  const { destination, signal } = options;
  const inputs = items.map(toInput);

  // 1. Destination hint.
  let hint: GeocodeResult | null = null;
  if (destination?.trim()) {
    try {
      const [first] = await geocodeCandidates(destination.trim(), {
        limit: 1,
        signal,
      });
      hint = first ?? null;
    } catch (err) {
      if (isAbort(err) || isNoToken(err)) throw err;
    }
  }

  // 2. First pass — context-qualified, anchored on the best available signal.
  const first: FirstPass[] = [];
  let progressive: GeoPoint | null = hint
    ? { latitude: hint.latitude, longitude: hint.longitude }
    : null;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (i > 0) await delay(REQUEST_SPACING_MS);
    const anchor = contextAnchor(input, first, hint, progressive);
    try {
      const result = await resolveOne(input, destination, anchor, signal);
      first.push({ input, result });
      if (result && !progressive) {
        progressive = { latitude: result.latitude, longitude: result.longitude };
      }
    } catch (err) {
      if (isAbort(err) || isNoToken(err)) throw err;
      if (err instanceof MapboxError && i === 0 && !hint) throw err;
      first.push({ input, result: null });
    }
  }

  const resolvedResults = first
    .filter((f): f is FirstPass & { result: GeocodeResult } => f.result !== null)
    .map((f) => f.result);

  // 3. Infer region.
  const region = inferTripRegion(resolvedResults, hint);

  // 4 + 5. Outlier detection and (conservative) correction.
  const outlierIdx = new Set<number>();
  if (region) {
    for (const report of detectOutliers(resolvedResults, region)) {
      outlierIdx.add(report.index);
    }
  }

  const places: ResolvedPlace[] = [];
  let resolvedCursor = -1;
  for (const pass of first) {
    const { input } = pass;
    const base: ResolvedPlace = {
      query: input.originalText,
      originalText: input.originalText,
      displayName: input.displayName,
      context: input.context,
      day: input.day,
      days: input.days,
      result: pass.result,
      autoCorrected: false,
    };

    if (!pass.result) {
      places.push(base);
      continue;
    }
    resolvedCursor += 1;

    if (region && outlierIdx.has(resolvedCursor)) {
      try {
        await delay(REQUEST_SPACING_MS);
        const candidates = await geocodeCandidates(input.originalText, {
          limit: 5,
          proximity: [region.center.longitude, region.center.latitude],
          signal,
        });
        const better = chooseBetterCandidate(
          pass.result,
          candidates,
          region,
          input.originalText,
        );
        if (better) {
          places.push({
            ...base,
            result: better,
            autoCorrected: true,
            note: "Matched near your trip area",
          });
          continue;
        }
      } catch (err) {
        if (isAbort(err)) throw err;
      }
    }
    places.push(base);
  }

  // 6. De-duplicate on resolved signals, merging day numbers.
  const deduped = dedupePlaces(
    places.map((p) => ({
      value: p,
      result: p.result,
      text: p.originalText,
      days: p.days,
    })),
  ).map<ResolvedPlace>((m) => ({
    ...m.value,
    days: m.days ?? m.value.days,
    day: (m.days ?? m.value.days)?.[0] ?? m.value.day,
  }));

  const resolved = deduped.filter((p) => p.result !== null);
  const unresolved = deduped
    .filter((p) => p.result === null)
    .map((p) => p.displayName);

  return { places: deduped, resolved, unresolved, region };
}

import { normalizePlaceLine, stripLeadingMarker } from "./normalizePlace";

/**
 * Rule-based place extraction. No LLM in Phase 1 — this is a pragmatic pipeline
 * that turns a messy pasted itinerary into a list of place-name candidates.
 *
 * The public surface is intentionally tiny (`extractPlacesFromText`) so a
 * smarter parser can be swapped in behind the same signature later.
 */

/** Lines that are structural / timing metadata, never a place. */
const METADATA_LINE_PATTERNS: RegExp[] = [
  /^day\s*\d+\b/i,
  /^(morning|afternoon|evening|night|midday|noon)$/i,
  /^(itinerary|schedule|plan|notes?|todo|to-do|packing list)\b/i,
  // Pure clock time, optionally prefixed with a vague qualifier.
  /^(?:around|approx\.?|about|circa|roughly|~)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\.?$/i,
  // Pure duration.
  /^\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\.?$/i,
  // A date-ish header, e.g. "Oct 1", "October 1–7", "10/1".
  /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i,
  /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d/i,
  /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/,
];

/** Lines beginning with travel-logistics words are noise, not destinations. */
const LOGISTICS_PREFIX =
  /^(?:landing|land|takeoff|take off|depart|departure|arrive|arrival|flight|board|boarding|check[\s-]?in|check[\s-]?out|checkout|pick[\s-]?up|drop[\s-]?off|dropoff|rental car|return car|gas stop|fuel stop|rest stop|breakfast|lunch|dinner|brunch|free time|relax)\b/i;

function isMetadataLine(line: string): boolean {
  if (METADATA_LINE_PATTERNS.some((re) => re.test(line))) return true;
  if (LOGISTICS_PREFIX.test(line)) return true;
  return false;
}

function looksLikePlace(candidate: string): boolean {
  if (candidate.length < 2) return false;
  // Needs at least one letter.
  if (!/[a-z]/i.test(candidate)) return false;
  // Reject anything that is still basically a time / duration.
  if (/^\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)$/i.test(candidate)) {
    return false;
  }
  return true;
}

export function extractPlacesFromText(text: string): string[] {
  if (!text) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const withoutMarker = stripLeadingMarker(line);
    if (!withoutMarker) continue;
    if (isMetadataLine(withoutMarker)) continue;

    const candidate = normalizePlaceLine(line);
    if (!candidate || !looksLikePlace(candidate)) continue;
    if (isMetadataLine(candidate)) continue;

    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(candidate);
  }

  return results;
}

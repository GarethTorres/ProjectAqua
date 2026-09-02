/**
 * Line-level normalization for itinerary text. Kept deliberately small and
 * rule-based so a smarter (AI) parser can replace it later without touching the
 * rest of the app. See `extractPlaces.ts` for how these helpers are composed.
 */

/** Leading list markers: "- ", "* ", "• ", "1. ", "1) ", "›", etc. */
const LEADING_MARKER = /^\s*(?:[-*•·‣◦▪>»–—]+|\d{1,2}[.)])\s+/;

/** Prefixes that wrap a real place, e.g. "Stay in Santa Fe" -> "Santa Fe". */
const WRAPPER_PREFIX =
  /^(?:stay(?:ing)?\s+(?:in|at|near)|overnight\s+(?:in|at)|sleep\s+in|lodging\s+in|hotel\s+in|night\s+in|drive\s+to|head\s+to|continue\s+to|walk\s+to|visit|explore|see|go\s+to|stop\s+at|arrive\s+at|check\s+in\s+at)\s+/i;

/** Trailing duration / timing fragments, e.g. "3 hrs", "sunset 1 hr", "~2h". */
const TRAILING_DURATION =
  /[\s—–-]*(?:for\s+)?(?:~|approx\.?\s*|about\s+)?\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b.*$/i;

/** Trailing standalone mood words that often trail a place name. */
const TRAILING_MOOD = /\s+(?:at\s+)?(?:sunrise|sunset|golden hour|lunch|dinner|breakfast|brunch)\s*$/i;

/** Trailing clock time, e.g. "... 3:30 PM", "... at 5pm". */
const TRAILING_CLOCK = /[\s,]+(?:at\s+|around\s+|by\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\.?\s*$/i;

export function stripLeadingMarker(line: string): string {
  return line.replace(LEADING_MARKER, "").trim();
}

export function stripWrapperPrefix(line: string): string {
  return line.replace(WRAPPER_PREFIX, "").trim();
}

export function stripTrailingNoise(line: string): string {
  let out = line;
  let prev: string;
  do {
    prev = out;
    out = out
      .replace(TRAILING_DURATION, "")
      .replace(TRAILING_CLOCK, "")
      .replace(TRAILING_MOOD, "")
      .replace(/[\s,;:–—-]+$/, "")
      .trim();
  } while (out !== prev);
  return out;
}

/**
 * Run every cleanup pass over a single line. Returns the candidate place text,
 * or an empty string when nothing usable is left.
 */
export function normalizePlaceLine(line: string): string {
  const cleaned = stripTrailingNoise(
    stripWrapperPrefix(stripLeadingMarker(line)),
  );
  // Collapse internal whitespace.
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

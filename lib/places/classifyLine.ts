import { normalizePlaceLine, stripLeadingMarker } from "./normalizePlace";
import { isKnownRegion } from "./geographyData";

/**
 * Deterministic single-line classifier for pasted itineraries. No LLM.
 *
 * `heading` is *provisional*: `parseItinerary` decides whether a heading is a
 * real geographic section (a city / region providing context) or actually a
 * standalone place, based on what follows it.
 */

export type LineClassification =
  | { type: "blank" }
  | { type: "day"; day: number }
  | { type: "url" }
  | { type: "metadata" }
  | { type: "note" }
  | { type: "stay"; location: string }
  | { type: "heading"; text: string }
  | { type: "place"; text: string };

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff\uff66-\uff9f]/u;

export function hasCJK(value: string): boolean {
  return CJK_RE.test(value);
}

/** Lowercase, strip diacritics, reduce punctuation to spaces. */
export function normalizeLoose(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DAY_RE = /^day\s*(\d{1,2})\b/i;
const URL_RE = /(https?:\/\/|www\.)\S+/i;

const STAY_RE =
  /^(?:stay|staying|sleep|overnight|lodging|lodge|hotel|room)\s+(?:the\s+night\s+)?(?:in|at|near)\s+(.+)$/i;

/** Structural / timing metadata — never a place. */
const METADATA_LINE_PATTERNS: RegExp[] = [
  /^(morning|afternoon|evening|night|midday|noon|sunrise|sunset|dawn|dusk)$/i,
  /^(itinerary|schedule|plan|notes?|todo|to-do|packing list|overview)\b/i,
  // Pure clock time, optionally with a vague qualifier.
  /^(?:around|approx\.?|about|circa|roughly|~|by|after|before|from)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\.?$/i,
  // Pure duration.
  /^(?:~|approx\.?\s*|about\s+)?\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\.?$/i,
  // Day-of-week / month-day headers.
  /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i,
  /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i,
  // Numeric date or date range: "10/1", "10.3 - 10.4", "10.3-10.4".
  /^\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*(?:[-–—]\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)?$/,
  /^\d{1,2}\s*[-–—]\s*\d{1,2}$/,
];

const LOGISTICS_PREFIX =
  /^(?:landing|land|takeoff|take off|take-off|depart|departure|departing|arrive|arrival|arriving|flight|board|boarding|check[\s-]?in|check[\s-]?out|checkout|pick[\s-]?up|drop[\s-]?off|dropoff|rental car|return car|gas stop|fuel stop|rest stop|breakfast|lunch|dinner|brunch|free time|relax)\b/i;

const TRAVEL_VERBS_RE =
  /\b(take off|takeoff|fly out|fly home|fly back|head home|drive home|drive back|head back|return home|back to)\b/i;

const CLOCK_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

/** Descriptive / instructional prose — keep it out of the pin list. */
const NOTE_KEYWORDS_RE =
  /\b(requires?|reservations?|reserve|check[\s-]?in|please\s+note|^note:|permit|permits|closed|open\s+daily|opening\s+hours|entry\s+fee|admission|tickets?\s+required|allow\s+\d|bring\s+|parking\s+is|shuttle\s+from)\b/i;

const SEQUENCE_RE = /(?:->|→|➔|⇒|»)/;

/** Words that mean the line names a specific place, not a city/region. */
const POI_WORD_RE =
  /\b(museum|gallery|park|parks|monument|tramway|tram|plaza|zocalo|cavern|caverns|trail|trails|loop|center|centre|cathedral|basilica|church|chapel|temple|shrine|mosque|synagogue|tower|bridge|square|garden|gardens|zoo|aquarium|beach|lake|river|mountain|mount|peak|falls|geyser|memorial|fiesta|amphitheater|amphitheatre|theater|theatre|road|street|avenue|boulevard|highway|route|house|inn|spa|hotel|resort|lodge|hostel|motel|castle|palace|fort|fortress|market|marketplace|pier|wharf|harbor|harbour|building|observatory|planetarium|stadium|arena|winery|vineyard|brewery|distillery|ranch|farm|dunes|canyon|gorge|mesa|butte|springs|national|reserve|preserve|sanctuary|refuge|cave|caves|ruins|pueblo|mission|library|cafe|restaurant|bar|club|studio|factory|mill|mine|dam|lighthouse|overlook|viewpoint|visitor)\b/i;

/**
 * A place name that already pins its own location — a National/State Park,
 * Monument, Forest, Memorial, etc. Appending a nearby *city* to these would
 * wrongly drag them (e.g. "Badlands National Park, Denver").
 */
const SELF_SUFFICIENT_RE =
  /\b(?:national|state)\s+(?:park|monument|forest|grassland|memorial|preserve|seashore|lakeshore|recreation\s+area|historic(?:al)?\s+(?:site|park)|wildlife\s+refuge|scenic\s+area|battlefield|parkway)\b/i;

export function isSelfSufficientPlaceName(text: string): boolean {
  return SELF_SUFFICIENT_RE.test(text);
}

function looksLikePlace(text: string): boolean {
  if (text.length < 2) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  if (/^\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)$/i.test(text)) {
    return false;
  }
  return true;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isMetadataText(text: string): boolean {
  if (METADATA_LINE_PATTERNS.some((re) => re.test(text))) return true;
  if (LOGISTICS_PREFIX.test(text)) return true;
  // "NP CARD 6:50 PM Sunset", "Around 5:30PM" — a clock time in a short line.
  if (CLOCK_RE.test(text) && wordCount(text) <= 5) return true;
  // "Back to Abq and take off" — a short travel-logistics sentence.
  if (TRAVEL_VERBS_RE.test(text) && wordCount(text) <= 7) return true;
  // Chinese/Japanese line that carries a number — almost always a time/note.
  if (hasCJK(text) && /\d/.test(text)) return true;
  return false;
}

function isNoteText(text: string): boolean {
  if (SEQUENCE_RE.test(text)) return true;
  // "a + b + c" style descriptive chains.
  if ((text.match(/\s\+\s/g) ?? []).length >= 1 && wordCount(text) >= 4) {
    return true;
  }
  if (NOTE_KEYWORDS_RE.test(text)) return true;
  // A full sentence: ends with a period and is wordy.
  if (/[.!?]$/.test(text) && wordCount(text) >= 7) return true;
  return false;
}

/** Title-case-ish, digit-free, short, POI-word-free — or a known region. */
function isHeadingShape(text: string): boolean {
  const normalized = normalizeLoose(text);
  if (isKnownRegion(normalized)) return true;

  if (/\d/.test(text)) return false;
  if (hasCJK(text)) return false; // non-latin standalone lines are treated as places
  if (POI_WORD_RE.test(text)) return false;

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;

  // Every alphabetic token should start uppercase ("Santa Fe", "New York").
  const alphaTokens = tokens.filter((t) => /[a-z]/i.test(t));
  if (alphaTokens.length === 0) return false;
  return alphaTokens.every((t) => /^[A-Z]/.test(t) || /^[^\p{L}]*[A-Z]/u.test(t));
}

export function classifyLine(rawLine: string): LineClassification {
  const trimmed = rawLine.trim();
  if (!trimmed) return { type: "blank" };

  const dayMatch = trimmed.match(DAY_RE);
  if (dayMatch) return { type: "day", day: Number(dayMatch[1]) };

  if (URL_RE.test(trimmed)) return { type: "url" };

  const withoutMarker = stripLeadingMarker(trimmed);
  if (!withoutMarker) return { type: "blank" };

  const stayMatch = withoutMarker.match(STAY_RE);
  if (stayMatch) {
    const location = normalizePlaceLine(stayMatch[1]) || stayMatch[1].trim();
    return { type: "stay", location };
  }

  if (isMetadataText(withoutMarker)) return { type: "metadata" };
  if (isNoteText(withoutMarker)) return { type: "note" };

  const cleaned = normalizePlaceLine(trimmed);
  if (!cleaned || !looksLikePlace(cleaned)) return { type: "metadata" };
  if (isMetadataText(cleaned)) return { type: "metadata" };

  if (isHeadingShape(cleaned)) return { type: "heading", text: cleaned };
  return { type: "place", text: cleaned };
}

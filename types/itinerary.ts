/**
 * The structured model produced by `parseItinerary`. It intentionally stays
 * small: enough to represent trip structure (days, geographic context) without
 * turning into a full travel-planner schema.
 */

export type GeoContextKind = "region" | "city";

export type GeoContext = {
  /** Heading text exactly as written, e.g. "Santa Fe", "New Mexico". */
  text: string;
  kind: GeoContextKind;
};

export type DestinationCandidate = {
  /** Exactly as the user wrote it — original language and punctuation. */
  originalText: string;
  /** What the UI shows by default (usually identical to originalText). */
  displayName: string;
  /**
   * City / region headings that were in scope for this line, nearest first
   * (city before region). Used to build a context-qualified geocoding query.
   */
  context: GeoContext[];
  /** 1-based day number when the line fell under a "Day N" heading. */
  day?: number;
  /** All day numbers this candidate appeared under (repeat itineraries). */
  days?: number[];
};

export type IgnoredReason =
  | "metadata"
  | "note"
  | "url"
  | "stay"
  | "heading"
  | "duplicate";

export type IgnoredLine = {
  text: string;
  reason: IgnoredReason;
};

export type ParsedItinerary = {
  /** The full pasted text, untouched. */
  originalText: string;
  destinations: DestinationCandidate[];
  /** Distinct city / region headings detected, in first-seen order. */
  contexts: GeoContext[];
  /** Lines deliberately not turned into pins, with why (for a subtle summary). */
  ignored: IgnoredLine[];
};

import { parseItinerary } from "./parseItinerary";

/**
 * Backward-compatible thin wrapper. Phase 1.5 replaced the flat extractor with
 * the structured `parseItinerary`; this keeps the old `string[]` surface for
 * any caller that only wants the list of destination names.
 */
export function extractPlacesFromText(text: string): string[] {
  return parseItinerary(text).destinations.map((d) => d.displayName);
}

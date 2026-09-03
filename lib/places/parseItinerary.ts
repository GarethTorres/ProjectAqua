import type {
  DestinationCandidate,
  GeoContext,
  IgnoredLine,
  ParsedItinerary,
} from "@/types/itinerary";
import {
  classifyLine,
  isSelfSufficientPlaceName,
  normalizeLoose,
  type LineClassification,
} from "./classifyLine";
import { isKnownRegion } from "./geographyData";

/**
 * Turn messy pasted itinerary text into a structured `ParsedItinerary`.
 *
 * Two passes:
 *   1. Classify every line independently (`classifyLine`).
 *   2. Walk the lines carrying day + geographic context. A provisional
 *      `heading` becomes a real geographic section only if a place follows it
 *      before the next heading / day; otherwise it is itself a place.
 *
 * Deterministic, rule-based, no LLM.
 */

/** Punctuation/Unicode-insensitive key for detecting repeated destinations. */
export function destinationKey(text: string): string {
  return normalizeLoose(text.replace(/[’'`]/g, ""));
}

/** Resolve a short token like "Abq" against city contexts already seen. */
export function resolveAbbreviation(
  token: string,
  contexts: GeoContext[],
): string | null {
  const t = normalizeLoose(token);
  if (!t || t.length < 2 || t.length > 5 || t.includes(" ")) return null;
  for (const ctx of contexts) {
    if (ctx.kind !== "city") continue;
    const city = normalizeLoose(ctx.text);
    if (city === t) return ctx.text;
    if (city[0] !== t[0]) continue;
    // Is `t` an in-order subsequence of the city name? ("abq" ⊂ "albuquerque")
    let i = 0;
    for (const ch of city) if (ch === t[i]) i += 1;
    if (i === t.length) return ctx.text;
  }
  return null;
}

function contextKind(text: string): GeoContext["kind"] {
  return isKnownRegion(normalizeLoose(text)) ? "region" : "city";
}

/** Does a real place appear after index `i` before the next heading / day? */
function placeFollows(classes: LineClassification[], i: number): boolean {
  for (let j = i + 1; j < classes.length; j++) {
    const c = classes[j];
    if (c.type === "day" || c.type === "heading") return false;
    if (c.type === "place") return true;
  }
  return false;
}

export function parseItinerary(text: string): ParsedItinerary {
  const rawLines = (text ?? "").split(/\r?\n/);
  const classes = rawLines.map(classifyLine);

  const destinations: DestinationCandidate[] = [];
  const ignored: IgnoredLine[] = [];
  const contexts: GeoContext[] = [];
  const byKey = new Map<string, DestinationCandidate>();

  let currentDay: number | undefined;
  let cityContext: GeoContext | undefined;
  let regionContext: GeoContext | undefined;
  /** What the previous non-blank line resolved to, for section-start detection. */
  let prevKind: "start" | "day" | "context" | "place" | "other" = "start";

  const registerContext = (ctx: GeoContext) => {
    const key = normalizeLoose(ctx.text);
    if (!contexts.some((c) => normalizeLoose(c.text) === key)) contexts.push(ctx);
  };

  const addPlace = (rawText: string, sectionStart = false) => {
    // A self-standing feature ("… National Park") at a section break shouldn't
    // inherit a city heading from an earlier, unrelated block.
    if (sectionStart && isSelfSufficientPlaceName(rawText)) {
      cityContext = undefined;
    }
    const key = destinationKey(rawText);
    const existing = byKey.get(key);
    if (existing) {
      if (currentDay != null) {
        existing.days = Array.from(
          new Set([...(existing.days ?? []), currentDay]),
        ).sort((a, b) => a - b);
        if (existing.day == null || currentDay < existing.day) {
          existing.day = existing.days[0];
        }
      }
      ignored.push({ text: rawText, reason: "duplicate" });
      return;
    }
    const ctx: GeoContext[] = [];
    if (cityContext) ctx.push(cityContext);
    if (regionContext) ctx.push(regionContext);
    const candidate: DestinationCandidate = {
      originalText: rawText,
      displayName: rawText,
      context: ctx,
      day: currentDay,
      days: currentDay != null ? [currentDay] : undefined,
    };
    destinations.push(candidate);
    byKey.set(key, candidate);
  };

  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    const atSectionStart =
      i === 0 ||
      classes[i - 1]?.type === "blank" ||
      prevKind === "day" ||
      prevKind === "context";

    switch (c.type) {
      case "blank":
        break;
      case "day":
        currentDay = c.day;
        // A fresh day that doesn't restate its city has no reliable city
        // context — fall back to region + destination + neighbour proximity.
        cityContext = undefined;
        prevKind = "day";
        break;
      case "url":
        ignored.push({ text: rawLines[i].trim(), reason: "url" });
        prevKind = "other";
        break;
      case "metadata":
        ignored.push({ text: rawLines[i].trim(), reason: "metadata" });
        prevKind = "other";
        break;
      case "note":
        ignored.push({ text: rawLines[i].trim(), reason: "note" });
        prevKind = "other";
        break;
      case "stay": {
        const canonical = resolveAbbreviation(c.location, contexts) ?? c.location;
        registerContext({ text: canonical, kind: contextKind(canonical) });
        ignored.push({ text: rawLines[i].trim(), reason: "stay" });
        prevKind = "other";
        break;
      }
      case "heading": {
        const kind = contextKind(c.text);
        const alreadyAPlace = byKey.has(destinationKey(c.text));
        if (kind === "region") {
          regionContext = { text: c.text, kind: "region" };
          cityContext = undefined;
          registerContext(regionContext);
          ignored.push({ text: c.text, reason: "heading" });
          prevKind = "context";
        } else if (!alreadyAPlace && atSectionStart && placeFollows(classes, i)) {
          cityContext = { text: c.text, kind: "city" };
          registerContext(cityContext);
          ignored.push({ text: c.text, reason: "heading" });
          prevKind = "context";
        } else {
          // A heading-shaped line that isn't acting as a section header — it's
          // really a place (e.g. "PistachioLand", "Mass Ascension").
          addPlace(c.text, atSectionStart);
          prevKind = "place";
        }
        break;
      }
      case "place":
        addPlace(c.text, atSectionStart);
        prevKind = "place";
        break;
    }
  }

  return {
    originalText: text ?? "",
    destinations,
    contexts,
    ignored,
  };
}

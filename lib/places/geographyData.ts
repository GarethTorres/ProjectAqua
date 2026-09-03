/**
 * Small, static geography reference data. Deliberately not exhaustive — it only
 * needs to recognise the common cases where a line is clearly a *region* rather
 * than a city or a POI ("New Mexico", "France", "Japan").
 */

export const US_STATES: readonly string[] = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming",
];

export const US_STATE_ABBR: ReadonlySet<string> = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il",
  "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt",
  "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri",
  "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
]);

/** A short list of country / large-region words — enough to catch headings. */
export const REGION_WORDS: readonly string[] = [
  "united states", "usa", "america", "canada", "mexico", "united kingdom", "uk",
  "england", "scotland", "wales", "ireland", "france", "spain", "portugal",
  "italy", "germany", "switzerland", "austria", "netherlands", "belgium",
  "greece", "turkey", "morocco", "egypt", "japan", "china", "south korea",
  "korea", "thailand", "vietnam", "india", "indonesia", "australia",
  "new zealand", "brazil", "argentina", "chile", "peru", "iceland", "norway",
  "sweden", "finland", "denmark", "poland", "czechia", "czech republic",
  "hungary", "croatia",
];

export const COUNTRY_WORD_RE =
  /\b(usa|u\.s\.a\.|united states|mexico|canada|uk|u\.k\.|england|france|spain|italy|germany|japan|china|australia)\b/i;

/** True when `normalized` (lowercased, punctuation-stripped) names a region. */
export function isKnownRegion(normalized: string): boolean {
  const n = normalized.trim();
  if (!n) return false;
  return US_STATES.includes(n) || REGION_WORDS.includes(n);
}

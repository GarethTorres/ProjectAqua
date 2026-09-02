export type Place = {
  id: string;
  name: string;
  formattedAddress?: string;
  latitude: number;
  longitude: number;
  mapboxPlaceId?: string;
  /** Mapbox feature category / type, when available (e.g. "museum", "park"). */
  category?: string;
  /** Region / state name, when Mapbox provides it (e.g. "New Mexico"). */
  region?: string;
  /** ISO 3166-1 alpha-2 country code, when available (e.g. "US"). */
  countryCode?: string;
  visited: boolean;
  sortOrder: number;
};

/** A raw result coming back from Mapbox geocoding, before it becomes a Place. */
export type GeocodeResult = {
  name: string;
  formattedAddress?: string;
  latitude: number;
  longitude: number;
  mapboxPlaceId?: string;
  category?: string;
  /** Region / state name (e.g. "New Mexico"). */
  region?: string;
  /** Region code, full form when available (e.g. "US-NM"), else short ("NM"). */
  regionCode?: string;
  /** Country name (e.g. "United States"). */
  country?: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "US"). */
  countryCode?: string;
};

/**
 * A place candidate as it moves through the confirmation screen. `query` is the
 * text we extracted from the itinerary; `result` is what Mapbox resolved it to.
 */
export type PlaceDraft = {
  id: string;
  query: string;
  result: GeocodeResult;
  included: boolean;
  /** True when the outlier-correction pass swapped in a different match. */
  autoCorrected?: boolean;
  /** Subtle explanation shown when `autoCorrected` is true. */
  note?: string;
};

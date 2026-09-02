# ProjectAqua

**Plan anywhere. Travel with us.**

You already plan trips in Notes, Google Docs, Notion, or ChatGPT. PinTrip doesn't
ask you to change that. Paste the list you already wrote, and PinTrip turns it
into a map you can actually use while travelling: every place pinned, one tap to
open Apple Maps for navigation, and a lightweight visited check so you can see
what's left.

That's the whole product. No bookings, no reviews, no journaling.

---

## Tech stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS v4**
- **Mapbox** — place resolution via the **Search Box `/forward`** API (POI-aware,
  much better than address geocoding for pasted place names) and interactive map
  rendering (`mapbox-gl`)
- **lucide-react** for the few icons used
- **Vitest** for unit tests (`npm test`)
- Persistence in Phase 1 is **localStorage** behind a repository interface

No backend and no auth in Phase 1.

---

## Installation

```bash
npm install
```

Requires Node 18.18+ (Node 22 recommended).

---

## Environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes (for geocoding + map) | Mapbox public access token |

The app runs without the token — you can browse the UI and see saved trips — but
place detection and the map will show a clear "Mapbox not configured" message
instead of working.

### How to obtain a Mapbox token

1. Create a free account at <https://account.mapbox.com/>.
2. Go to **Access tokens** → <https://account.mapbox.com/access-tokens/>.
3. Copy the **Default public token** (or create a new public token).
4. Paste it as `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local`.
5. Restart the dev server.

The free tier's monthly request allowance is far more than an MVP needs. Because
the token ships to the browser (`NEXT_PUBLIC_` prefix), restrict it by URL in the
Mapbox dashboard before deploying anywhere public.

---

## Run locally

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
npx tsc --noEmit # type-check
npm test         # vitest (place-resolution logic)
```

---

## How data is stored (Phase 1)

Trips live in `localStorage` under the key `pintrip.trips.v1`, as a single JSON
array of `Trip` objects (each with its embedded `Place[]`).

All access goes through a small repository layer:

- `lib/storage/tripRepository.ts` — the `TripRepository` interface the app codes
  against.
- `lib/storage/tripsStore.ts` — the synchronous, reactive localStorage store
  (`subscribe` + `getSnapshot`, consumed by React via `useSyncExternalStore`).
- `lib/storage/localTripRepository.ts` — async `TripRepository` implementation
  wrapping the store.
- `lib/storage/trips.ts` — exports the single active `tripRepository` binding.

Nothing outside `lib/storage` imports a concrete implementation, so Phase 3 can
replace it with a `SupabaseTripRepository` without touching UI or business logic.

Clearing site data / using a private window resets everything; the store is
written defensively so an empty or corrupt value never crashes the app.

---

## Supabase setup (Phase 3 — not yet implemented)

Phase 3 will swap localStorage for Supabase Postgres + Supabase Auth:

1. Create a Supabase project.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to
   `.env.local`.
3. Run the SQL migration (see below) in the Supabase SQL editor.
4. Add `SupabaseTripRepository` and point `lib/storage/trips.ts` at it.

### Database migration instructions

Migrations will live in `supabase/migrations/`. Apply them with the Supabase CLI:

```bash
supabase db push
```

or paste the SQL into the dashboard SQL editor. The schema will define
`profiles`, `trips`, and `places` (UUID keys, FK `places.trip_id → trips.id`,
`trips.user_id → auth.users.id`), with Row Level Security enabled so a user can
only read and write their own trips and the places under them.

---

## Architecture overview

```
app/
  page.tsx                 Home — new trip CTA + saved trips list
  trips/new/page.tsx       Create flow: paste → find → confirm → create
  trips/[tripId]/page.tsx  Trip detail — map + place list + Navigate

components/
  layout/                  AppHeader, PageContainer
  map/TripMap.tsx          mapbox-gl map, dynamically imported (ssr: false)
  map/PlaceMarker.tsx      Single pin, rendered into a Mapbox marker via createRoot
  trips/TripCard.tsx       Home list row
  trips/PlaceCard.tsx      Trip-detail place card + big Navigate button
  trips/PasteItinerary.tsx Step 1 form
  trips/PlaceConfirmation.tsx Step 2 — review / edit / remove / add before create
  ui/                      Small button/card/input/textarea/spinner primitives

lib/
  places/extractPlaces.ts  Rule-based place extraction (no LLM in Phase 1)
  places/normalizePlace.ts  Line-level cleanup helpers
  places/createPlace.ts    GeocodeResult → Place
  places/inferTripRegion.ts  Robust (median) trip center + country/region consensus
  places/detectOutliers.ts   Flag places implausibly far from the cluster
  mapbox/client.ts         Single network entry point (Search Box API) + MapboxError
  mapbox/geocodeCandidates.ts  Multi-candidate forward search (name+addr+region+country)
  mapbox/resolvePlaceWithContext.ts  Context-aware itinerary resolution + outlier fix
  mapbox/searchPlaces.ts   Multi-result search for the confirmation screen
  navigation/openAppleMaps.ts  Build + open a maps.apple.com directions URL
  storage/                 Repository abstraction over localStorage (see above)

types/
  trip.ts, place.ts        Shared models
```

**Design principles**

- Business logic stays in `lib/`, not in components.
- The map is client-only and loaded via `next/dynamic` so `mapbox-gl` never runs
  during SSR.
- The place parser is deliberately swappable — `parseItinerary(text)`-shaped, so
  an AI extractor can replace the rules later without other changes.
- Coordinates are authoritative for navigation; Apple Maps handles routing.

### Geocoding accuracy

Pasted itineraries contain ambiguous names ("Plaza", "Santa Fe") that can resolve
to the wrong country. `resolvePlaceWithContext.ts` corrects this deterministically
(no LLM):

1. **Destination as the strongest hint** — geocoded first and used as proximity
   bias; its text is appended to lines that carry no location context of their
   own (`"Santa Fe Plaza"` → `"Santa Fe Plaza, New Mexico"`, but `"Taos, NM"` is
   left alone).
2. **Candidate re-ranking** — each lookup pulls the top 5 matches and re-orders
   them by name similarity to the pasted text, so an exact-named POI ranked #3
   beats a generically-named nearby street at #1.
3. **Robust region inference** — a component-wise **median** center of everything
   that resolved, so one bad pin barely moves it, plus country/region consensus.
4. **Outlier detection** — a place is suspicious when it is far past a robust
   distance fence (median radius + MAD-scaled spread, with an absolute floor and
   a large allowance for genuinely spread-out road trips) and/or in a different
   country than a clear majority.
5. **Conservative correction** — only suspicious places are re-searched, biased to
   the trip center. A replacement is accepted only if it strongly name-matches,
   sits inside the fence, matches the dominant country, and is materially closer.
   A legitimately remote stop whose re-search returns the same place is never
   overwritten. Corrected places are marked "Matched near your trip area" and the
   user can still Search again / remove / add.

Tested with `npm test` (Vitest): Mexico-mismatch correction with and without a
destination, multi-state road trips left untouched, ambiguous multi-candidate
names, and remote-but-real stops preserved.

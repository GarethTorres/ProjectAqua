"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaceDraft } from "@/types/place";
import type { Trip } from "@/types/trip";
import type { GeoContext } from "@/types/itinerary";
import { parseItinerary } from "@/lib/places/parseItinerary";
import { resolveItineraryPlaces } from "@/lib/mapbox/resolvePlaceWithContext";
import { MapboxError } from "@/lib/mapbox/client";
import { placeFromGeocode, resequence } from "@/lib/places/createPlace";
import { saveTrip } from "@/lib/storage/trips";
import { nowIso, uid } from "@/lib/utils";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  PasteItinerary,
  type ItineraryInput,
} from "@/components/trips/PasteItinerary";
import { PlaceConfirmation } from "@/components/trips/PlaceConfirmation";

type Step = "input" | "confirm";

export default function NewTripPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<{ name: string; destination: string }>({
    name: "",
    destination: "",
  });
  const [drafts, setDrafts] = useState<PlaceDraft[]>([]);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [contexts, setContexts] = useState<GeoContext[]>([]);
  const [proximity, setProximity] = useState<[number, number] | undefined>();

  async function handleFind(input: ItineraryInput) {
    setError(null);
    const parsed = parseItinerary(input.text);

    if (parsed.destinations.length === 0) {
      setError(
        "We couldn't find any places in that text. Try placing one destination per line.",
      );
      return;
    }

    setLoading(true);
    setMeta({ name: input.name, destination: input.destination });
    setContexts(parsed.contexts);

    try {
      const outcome = await resolveItineraryPlaces(parsed.destinations, {
        destination: input.destination || undefined,
      });

      if (outcome.resolved.length === 0) {
        setError(
          "We couldn't match any of those places to the map. Check the spelling or use more specific names.",
        );
        return;
      }

      setProximity(
        outcome.region
          ? [outcome.region.center.longitude, outcome.region.center.latitude]
          : undefined,
      );
      setDrafts(
        outcome.resolved.map((it) => ({
          id: uid(),
          query: it.originalText,
          displayName: it.displayName,
          result: it.result!,
          included: true,
          day: it.day,
          days: it.days,
          autoCorrected: it.autoCorrected,
          note: it.note,
        })),
      );
      setUnresolved(outcome.unresolved);
      setStep("confirm");
    } catch (err) {
      if (err instanceof MapboxError && err.code === "no-token") {
        setError(
          "Mapbox is not configured. Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local (see .env.example) and restart the dev server.",
        );
      } else if (err instanceof MapboxError) {
        setError(`${err.message} Tap Find Places to retry.`);
      } else {
        setError(
          "Something went wrong finding your places. Tap Find Places to retry.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(included: PlaceDraft[]) {
    setCreating(true);
    try {
      const places = resequence(
        included.map((d, i) =>
          placeFromGeocode(
            {
              result: d.result,
              displayName: d.displayName,
              day: d.day,
              days: d.days,
            },
            i,
          ),
        ),
      );
      const now = nowIso();
      const trip: Trip = {
        id: uid(),
        name: meta.name || "Untitled trip",
        destination: meta.destination || undefined,
        places,
        createdAt: now,
        updatedAt: now,
      };
      await saveTrip(trip);
      router.push(`/trips/${trip.id}`);
    } catch {
      setCreating(false);
      setError("Could not save the trip. Please try again.");
    }
  }

  return (
    <>
      <AppHeader
        backHref={step === "confirm" ? undefined : "/"}
        backLabel="Trips"
        action={
          step === "confirm" ? (
            <button
              type="button"
              onClick={() => {
                setStep("input");
                setError(null);
              }}
              className="text-[15px] text-accent"
            >
              Edit list
            </button>
          ) : null
        }
      />
      <PageContainer className="pt-6">
        {step === "input" ? (
          <>
            <div className="mb-6 space-y-1.5">
              <h1 className="text-[24px] font-semibold tracking-tight">New Trip</h1>
              <p className="text-[14px] text-muted-foreground">
                Name it, then paste the plan you already have.
              </p>
            </div>
            <PasteItinerary loading={loading} error={error} onSubmit={handleFind} />
          </>
        ) : (
          <>
            {error ? (
              <p className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
                {error}
              </p>
            ) : null}
            <PlaceConfirmation
              initialDrafts={drafts}
              unresolved={unresolved}
              contexts={contexts}
              proximity={proximity}
              creating={creating}
              onCreate={handleCreate}
            />
          </>
        )}
      </PageContainer>
    </>
  );
}

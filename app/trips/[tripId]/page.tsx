"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Trip } from "@/types/trip";
import { useTrip } from "@/lib/storage/useTrips";
import { updateTrip } from "@/lib/storage/trips";
import { openAppleMaps } from "@/lib/navigation/openAppleMaps";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { PlaceCard } from "@/components/trips/PlaceCard";
import { Button } from "@/components/ui/button";

const TripMap = dynamic(() => import("@/components/map/TripMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[42vh] max-h-[420px] min-h-[280px] w-full animate-pulse rounded-2xl bg-muted" />
  ),
});

export default function TripDetailPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId;
  const { trip, loading, notFound } = useTrip(tripId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const places = useMemo(
    () => (trip ? [...trip.places].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [trip],
  );

  const visitedCount = places.filter((p) => p.visited).length;

  function selectFromMarker(id: string) {
    setSelectedId(id);
    const el = cardRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function toggleVisited(id: string) {
    if (!trip) return;
    const next: Trip = {
      ...trip,
      places: trip.places.map((p) =>
        p.id === id ? { ...p, visited: !p.visited } : p,
      ),
    };
    // Repository write is synchronous under the hood, so the store updates and
    // this view re-renders immediately — no mirrored local state needed.
    void updateTrip(next);
  }

  if (loading) {
    return (
      <>
        <AppHeader backHref="/" backLabel="Trips" />
        <PageContainer className="pt-6">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="mt-4 h-[42vh] max-h-[420px] min-h-[280px] w-full animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      </>
    );
  }

  if (notFound || !trip) {
    return (
      <>
        <AppHeader backHref="/" backLabel="Trips" />
        <PageContainer className="pt-16 text-center">
          <p className="text-[16px] font-semibold">Trip not found</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            It may have been deleted on this device.
          </p>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="secondary">Back to trips</Button>
          </Link>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <AppHeader backHref="/" backLabel="Trips" />
      <PageContainer className="pt-5">
        <div className="space-y-1">
          <h1 className="text-[24px] font-semibold tracking-tight">{trip.name}</h1>
          <p className="text-[13.5px] text-muted-foreground">
            {trip.destination ? `${trip.destination} · ` : ""}
            {places.length} {places.length === 1 ? "place" : "places"}
            {places.length > 0 ? ` · ${visitedCount} visited` : ""}
          </p>
        </div>

        <div className="mt-4">
          <TripMap
            className="h-[42vh] max-h-[420px] min-h-[280px] w-full"
            places={places}
            selectedId={selectedId}
            onSelectPlace={selectFromMarker}
          />
        </div>

        <h2 className="mt-7 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          Places
        </h2>

        {places.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border px-5 py-8 text-center text-[13.5px] text-muted-foreground">
            This trip has no places yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {places.map((place) => (
              <li key={place.id}>
                <PlaceCard
                  ref={(el) => {
                    if (el) cardRefs.current.set(place.id, el);
                    else cardRefs.current.delete(place.id);
                  }}
                  place={place}
                  selected={place.id === selectedId}
                  onSelect={() => setSelectedId(place.id)}
                  onToggleVisited={() => toggleVisited(place.id)}
                  onNavigate={() => openAppleMaps(place)}
                />
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </>
  );
}

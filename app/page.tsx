"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useTrips } from "@/lib/storage/useTrips";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { TripCard } from "@/components/trips/TripCard";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { trips, loading } = useTrips();

  return (
    <>
      <AppHeader />
      <PageContainer className="pt-8">
        <div className="space-y-2">
          <h1 className="text-[30px] font-semibold tracking-tight">PinTrip</h1>
          <p className="text-[15px] text-muted-foreground">
            Plan anywhere. Travel with us.
          </p>
        </div>

        <Link href="/trips/new" className="mt-6 block">
          <Button size="lg" className="w-full">
            <Plus className="size-4" />
            New Trip
          </Button>
        </Link>

        <section className="mt-10">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming Trips
          </h2>

          {loading ? (
            <div className="mt-3 space-y-2.5">
              {[0, 1].map((i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : trips.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-[16px] font-semibold tracking-tight">
                Turn your itinerary into a map.
              </p>
              <p className="mx-auto mt-1 max-w-[16rem] text-[13.5px] text-muted-foreground">
                Paste the list you already wrote. We&apos;ll pin every place.
              </p>
              <Link href="/trips/new" className="mt-4 inline-block">
                <Button>Create your first trip</Button>
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <TripCard trip={trip} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageContainer>
    </>
  );
}

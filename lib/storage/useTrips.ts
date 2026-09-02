"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Trip } from "@/types/trip";
import {
  getServerSnapshot,
  getTripsSnapshot,
  subscribe,
} from "./tripsStore";

const noopSubscribe = () => () => {};

/** True once the client has taken over from the server-rendered markup. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Live list of all saved trips, newest-updated first. */
export function useTrips() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getTripsSnapshot,
    getServerSnapshot,
  );
  const hydrated = useHydrated();

  const trips = useMemo(
    () => [...snapshot].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [snapshot],
  );

  return { trips, loading: !hydrated };
}

/** Live single trip by id. */
export function useTrip(id: string | undefined) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getTripsSnapshot,
    getServerSnapshot,
  );
  const hydrated = useHydrated();

  const trip = useMemo<Trip | null>(
    () => (id ? snapshot.find((t) => t.id === id) ?? null : null),
    [snapshot, id],
  );

  return { trip, loading: !hydrated, notFound: hydrated && trip === null };
}

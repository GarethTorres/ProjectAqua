"use client";

import type { Trip } from "@/types/trip";
import { nowIso } from "@/lib/utils";

/**
 * Synchronous, reactive localStorage store for trips. This is the concrete
 * Phase 1 persistence. It exposes a `useSyncExternalStore`-shaped API
 * (`subscribe` + `getSnapshot`) so React reads it without effects, plus small
 * sync mutators. `localTripRepository` wraps this behind the async
 * `TripRepository` interface that the rest of the app codes against.
 */

const STORAGE_KEY = "pintrip.trips.v1";
const EMPTY: readonly Trip[] = Object.freeze([]);

let cachedRaw: string | null | undefined;
let cachedValue: readonly Trip[] = EMPTY;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Stable snapshot: same reference until the underlying data actually changes. */
export function getTripsSnapshot(): readonly Trip[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) {
    cachedValue = EMPTY;
    return cachedValue;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedValue = Array.isArray(parsed) ? (parsed as Trip[]) : EMPTY;
  } catch {
    cachedValue = EMPTY;
  }
  return cachedValue;
}

export function getServerSnapshot(): readonly Trip[] {
  return EMPTY;
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) callback();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function commit(trips: Trip[]): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    }
  } catch {
    // Quota exceeded or privacy mode — nothing useful to do in an MVP.
  }
  // Invalidate cache so the next snapshot re-reads and yields a fresh reference.
  cachedRaw = undefined;
  listeners.forEach((l) => l());
}

function currentList(): Trip[] {
  return [...getTripsSnapshot()];
}

export function getTripSync(id: string): Trip | null {
  return getTripsSnapshot().find((t) => t.id === id) ?? null;
}

export function upsertTripSync(trip: Trip): Trip {
  const stored: Trip = { ...trip, updatedAt: nowIso() };
  const rest = currentList().filter((t) => t.id !== stored.id);
  commit([stored, ...rest]);
  return stored;
}

export function deleteTripSync(id: string): void {
  commit(currentList().filter((t) => t.id !== id));
}

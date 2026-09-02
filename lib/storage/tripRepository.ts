import type { Trip } from "@/types/trip";

/**
 * The storage contract the app codes against. Phase 1 ships
 * `localTripRepository` (localStorage). Phase 3 swaps in a Supabase-backed
 * implementation without the UI needing to change.
 */
export interface TripRepository {
  getTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
  saveTrip(trip: Trip): Promise<Trip>;
  updateTrip(trip: Trip): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;
}

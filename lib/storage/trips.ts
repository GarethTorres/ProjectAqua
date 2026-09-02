import { localTripRepository } from "./localTripRepository";
import type { TripRepository } from "./tripRepository";

/**
 * The active trip repository. Swap this single binding for a Supabase-backed
 * implementation in Phase 3 — nothing else in the app imports a concrete repo.
 */
export const tripRepository: TripRepository = localTripRepository;

export const getTrips = () => tripRepository.getTrips();
export const getTrip = (id: string) => tripRepository.getTrip(id);
export const saveTrip: TripRepository["saveTrip"] = (trip) =>
  tripRepository.saveTrip(trip);
export const updateTrip: TripRepository["updateTrip"] = (trip) =>
  tripRepository.updateTrip(trip);
export const deleteTrip = (id: string) => tripRepository.deleteTrip(id);

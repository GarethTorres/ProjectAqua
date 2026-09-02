import type { Trip } from "@/types/trip";
import type { TripRepository } from "./tripRepository";
import {
  deleteTripSync,
  getTripSync,
  getTripsSnapshot,
  upsertTripSync,
} from "./tripsStore";

function sortByUpdated(trips: readonly Trip[]): Trip[] {
  return [...trips].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Phase 1 persistence: localStorage, via the synchronous `tripsStore`. */
export const localTripRepository: TripRepository = {
  async getTrips() {
    return sortByUpdated(getTripsSnapshot());
  },
  async getTrip(id) {
    return getTripSync(id);
  },
  async saveTrip(trip) {
    return upsertTripSync(trip);
  },
  async updateTrip(trip) {
    return upsertTripSync(trip);
  },
  async deleteTrip(id) {
    deleteTripSync(id);
  },
};

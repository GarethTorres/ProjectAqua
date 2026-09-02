import type { Place } from "./place";

export type Trip = {
  id: string;
  name: string;
  destination?: string;
  places: Place[];
  createdAt: string;
  updatedAt: string;
};

export type NewTripInput = {
  name: string;
  destination?: string;
  places: Place[];
};

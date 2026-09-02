import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import type { Trip } from "@/types/trip";
import { Card } from "@/components/ui/card";

export function TripCard({ trip }: { trip: Trip }) {
  const count = trip.places.length;
  const visited = trip.places.filter((p) => p.visited).length;

  return (
    <Link href={`/trips/${trip.id}`} className="block">
      <Card className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <MapPin className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold tracking-tight">
            {trip.name}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {trip.destination ? `${trip.destination} · ` : ""}
            {count} {count === 1 ? "place" : "places"}
            {visited > 0 ? ` · ${visited} visited` : ""}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
}

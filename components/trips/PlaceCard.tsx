"use client";

import { forwardRef } from "react";
import { Check, Circle, Navigation } from "lucide-react";
import type { Place } from "@/types/place";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type PlaceCardProps = {
  place: Place;
  selected: boolean;
  onSelect: () => void;
  onToggleVisited: () => void;
  onNavigate: () => void;
};

export const PlaceCard = forwardRef<HTMLDivElement, PlaceCardProps>(
  ({ place, selected, onSelect, onToggleVisited, onNavigate }, ref) => {
    return (
      <Card
        ref={ref}
        onClick={onSelect}
        className={cn(
          "cursor-pointer scroll-mt-20 px-4 py-3.5 transition-shadow",
          selected && "ring-2 ring-accent/60",
        )}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-pressed={place.visited}
            aria-label={place.visited ? "Mark as not visited" : "Mark as visited"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisited();
            }}
            className="mt-0.5 shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            {place.visited ? (
              <span className="flex size-6 items-center justify-center rounded-full bg-success text-white">
                <Check className="size-4" strokeWidth={3} />
              </span>
            ) : (
              <Circle className="size-6" strokeWidth={1.75} />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[16px] font-semibold tracking-tight",
                place.visited && "text-muted-foreground line-through decoration-1",
              )}
            >
              {place.name}
            </p>
            {place.formattedAddress ? (
              <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                {place.formattedAddress}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold text-accent-foreground shadow-sm transition-[filter] hover:brightness-95 active:brightness-90"
        >
          <Navigation className="size-4" />
          Navigate
        </button>
      </Card>
    );
  },
);
PlaceCard.displayName = "PlaceCard";

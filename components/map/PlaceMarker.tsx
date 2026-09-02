"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlaceMarkerProps = {
  index: number;
  label: string;
  selected: boolean;
  visited: boolean;
  onClick: () => void;
};

/**
 * A single map pin. Rendered into a Mapbox marker container by `TripMap`
 * (via react-dom `createRoot`), so it stays a plain presentational component.
 */
export function PlaceMarker({
  index,
  label,
  selected,
  visited,
  onClick,
}: PlaceMarkerProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "group relative flex -translate-y-1/2 cursor-pointer flex-col items-center",
        selected ? "z-30" : "z-10",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full border-2 border-white text-[12px] font-bold shadow-md transition-all",
          selected ? "size-9" : "size-7",
          visited
            ? "bg-success text-white"
            : selected
              ? "bg-accent text-accent-foreground"
              : "bg-foreground text-background",
        )}
      >
        {visited ? (
          <Check className={selected ? "size-4.5" : "size-3.5"} strokeWidth={3} />
        ) : (
          index + 1
        )}
      </span>
      <span
        className={cn(
          "-mt-0.5 size-2 rotate-45 border-r-2 border-b-2 border-white shadow-md",
          visited ? "bg-success" : selected ? "bg-accent" : "bg-foreground",
        )}
      />
    </button>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

const PLACEHOLDER = `Day 1

Sandia Peak Tramway
Santa Fe Plaza
Meow Wolf Santa Fe

Day 2

Bandelier National Monument
Kasha-Katuwe Tent Rocks`;

export type ItineraryInput = {
  name: string;
  destination: string;
  text: string;
};

type PasteItineraryProps = {
  loading?: boolean;
  error?: string | null;
  onSubmit: (input: ItineraryInput) => void;
};

export function PasteItinerary({ loading, error, onSubmit }: PasteItineraryProps) {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [text, setText] = useState("");

  const canSubmit = name.trim().length > 0 && text.trim().length > 0 && !loading;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({ name: name.trim(), destination: destination.trim(), text });
      }}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="trip-name" className="text-[13px] font-medium text-muted-foreground">
            Trip name
          </label>
          <Input
            id="trip-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Mexico Road Trip"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="trip-destination" className="text-[13px] font-medium text-muted-foreground">
            Destination <span className="font-normal">(optional)</span>
          </label>
          <Input
            id="trip-destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Santa Fe, NM"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="trip-itinerary" className="text-[13px] font-medium text-muted-foreground">
          Paste your itinerary
        </label>
        <Textarea
          id="trip-itinerary"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={12}
          className="min-h-56 font-mono text-[13px]"
        />
        <p className="text-[12px] text-muted-foreground">
          Paste from Notes, Google Docs, Notion, ChatGPT — anything. One place per
          line works best.
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
        {loading ? <Spinner /> : null}
        {loading ? "Finding your places…" : "Find Places"}
      </Button>
    </form>
  );
}

"use client";

import { useRef, useState } from "react";
import { Check, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import type { GeocodeResult, PlaceDraft } from "@/types/place";
import type { GeoContext } from "@/types/itinerary";
import { searchPlaces } from "@/lib/mapbox/searchPlaces";
import { cn, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/** Prefer the full street address; fall back to region + country. */
function describeLocation(result: GeocodeResult): string {
  if (result.formattedAddress) return result.formattedAddress;
  return [result.region, result.country].filter(Boolean).join(", ");
}

function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

type PlaceConfirmationProps = {
  initialDrafts: PlaceDraft[];
  unresolved: string[];
  contexts?: GeoContext[];
  proximity?: [number, number];
  creating?: boolean;
  onCreate: (included: PlaceDraft[]) => void;
};

export function PlaceConfirmation({
  initialDrafts,
  unresolved,
  contexts = [],
  proximity,
  creating,
  onCreate,
}: PlaceConfirmationProps) {
  const [drafts, setDrafts] = useState<PlaceDraft[]>(initialDrafts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingOpen, setAddingOpen] = useState(false);

  const includedCount = drafts.filter((d) => d.included).length;

  const patch = (id: string, next: Partial<PlaceDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...next } : d)));

  const remove = (id: string) =>
    setDrafts((prev) => prev.filter((d) => d.id !== id));

  const addResult = (result: GeocodeResult) => {
    setDrafts((prev) => [
      ...prev,
      {
        id: uid(),
        query: result.name,
        displayName: result.name,
        result,
        included: true,
      },
    ]);
    setAddingOpen(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">
          We found {drafts.length} {drafts.length === 1 ? "place" : "places"}
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Check the pins are right. Uncheck or remove anything that looks off.
        </p>
        {contexts.length > 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            <span className="font-medium">{contexts.length}</span>{" "}
            {contexts.length === 1 ? "context" : "contexts"} used —{" "}
            {contexts.map((c) => c.text).join(" · ")}
          </p>
        ) : null}
      </div>

      <ul className="space-y-2.5">
        {drafts.map((draft) => {
          const resolvedName = draft.result.name;
          const showResolved = !sameName(draft.displayName, resolvedName);
          return (
            <li key={draft.id}>
              <Card className="px-3.5 py-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={draft.included}
                    aria-label={draft.included ? "Exclude place" : "Include place"}
                    onClick={() => patch(draft.id, { included: !draft.included })}
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      draft.included
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface",
                    )}
                  >
                    {draft.included ? (
                      <Check className="size-4" strokeWidth={3} />
                    ) : null}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "text-[15px] font-semibold tracking-tight",
                          !draft.included && "text-muted-foreground",
                        )}
                      >
                        {draft.displayName}
                      </p>
                      {draft.day ? (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                          Day {draft.day}
                        </span>
                      ) : null}
                    </div>

                    {showResolved ? (
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        → {resolvedName}
                      </p>
                    ) : null}
                    {describeLocation(draft.result) ? (
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">
                        {describeLocation(draft.result)}
                      </p>
                    ) : null}
                    {draft.autoCorrected ? (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                        <MapPin className="size-3" />
                        {draft.note ?? "Matched near your trip area"}
                      </p>
                    ) : null}

                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingId((cur) =>
                            cur === draft.id ? null : draft.id,
                          )
                        }
                        className="text-[12.5px] font-medium text-accent hover:underline"
                      >
                        {editingId === draft.id ? "Cancel" : "Search again"}
                      </button>
                    </div>

                    {editingId === draft.id ? (
                      <div className="mt-2">
                        <PlaceSearchBox
                          defaultQuery={draft.displayName}
                          proximity={proximity}
                          onPick={(result) => {
                            patch(draft.id, {
                              result,
                              included: true,
                              autoCorrected: false,
                              note: undefined,
                            });
                            setEditingId(null);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    aria-label="Remove place"
                    onClick={() => remove(draft.id)}
                    className="mt-0.5 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {unresolved.length > 0 ? (
        <div className="rounded-2xl bg-muted px-4 py-3 text-[12.5px] text-muted-foreground">
          Couldn&apos;t place: {unresolved.join(", ")}. Add them manually below if
          you need them.
        </div>
      ) : null}

      <div>
        {addingOpen ? (
          <Card className="space-y-2 px-3.5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium">Add a place</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAddingOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <PlaceSearchBox proximity={proximity} onPick={addResult} autoFocus />
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setAddingOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-[13.5px] font-medium text-muted-foreground hover:bg-muted"
          >
            <Plus className="size-4" />
            Add a place manually
          </button>
        )}
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={includedCount === 0 || creating}
        onClick={() => onCreate(drafts.filter((d) => d.included))}
      >
        {creating ? <Spinner /> : null}
        {creating
          ? "Creating trip…"
          : `Create Trip${includedCount ? ` · ${includedCount}` : ""}`}
      </Button>
    </div>
  );
}

function PlaceSearchBox({
  defaultQuery = "",
  proximity,
  onPick,
  autoFocus,
}: {
  defaultQuery?: string;
  proximity?: [number, number];
  onPick: (result: GeocodeResult) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const found = await searchPlaces(q, { proximity, signal: ctrl.signal });
      setResults(found);
      if (found.length === 0) setError("No matches. Try a more specific name.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          placeholder="Search Mapbox…"
          className="h-10"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={run}
          disabled={loading || query.trim().length === 0}
          className="h-10 px-3"
        >
          {loading ? (
            <Spinner className="text-foreground" />
          ) : (
            <Search className="size-4" />
          )}
        </Button>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      {results && results.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {results.map((r, i) => (
            <li key={`${r.mapboxPlaceId ?? r.name}-${i}`}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="block w-full px-3 py-2 text-left hover:bg-muted"
              >
                <p className="text-[13.5px] font-medium">{r.name}</p>
                {r.formattedAddress ? (
                  <p className="text-[12px] text-muted-foreground">
                    {r.formattedAddress}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

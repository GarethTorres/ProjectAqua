import { describe, expect, it } from "vitest";
import { parseItinerary, resolveAbbreviation } from "./parseItinerary";
import { NEW_MEXICO_ITINERARY } from "./fixtures/newMexico";

function names(text: string): string[] {
  return parseItinerary(text).destinations.map((d) => d.displayName);
}

describe("parseItinerary — city / region context", () => {
  it("A. a city heading becomes context, its POIs become destinations", () => {
    const p = parseItinerary("Paris\nLouvre Museum\nEiffel Tower");
    expect(p.destinations.map((d) => d.displayName)).toEqual([
      "Louvre Museum",
      "Eiffel Tower",
    ]);
    expect(p.contexts).toEqual([{ text: "Paris", kind: "city" }]);
    for (const d of p.destinations) {
      expect(d.context).toEqual([{ text: "Paris", kind: "city" }]);
    }
  });

  it("B. multilingual: city context + non-latin POIs, time line ignored", () => {
    const p = parseItinerary("Tokyo\n浅草寺\n東京スカイツリー\n下午 3 点出发");
    expect(p.destinations.map((d) => d.displayName)).toEqual([
      "浅草寺",
      "東京スカイツリー",
    ]);
    expect(p.contexts.map((c) => c.text)).toEqual(["Tokyo"]);
    expect(p.ignored.some((i) => i.text.includes("出发"))).toBe(true);
  });

  it("C. a description line under a place does not become its own pin", () => {
    const p = parseItinerary(
      "Bandelier National Monument\nVisitor Center → Main Loop Trail → Pueblo 遗址 → cliff dwellings",
    );
    expect(p.destinations.map((d) => d.displayName)).toEqual([
      "Bandelier National Monument",
    ]);
    expect(p.ignored.find((i) => i.text.includes("→"))?.reason).toBe("note");
  });

  it("D. a destination repeated under a later Day is not duplicated", () => {
    const p = parseItinerary(
      "Santa Fe Plaza\n\nDay 2\nSanta Fe Plaza",
    );
    expect(p.destinations).toHaveLength(1);
    expect(p.destinations[0].days).toEqual([2]);
  });

  it("distinguishes region headings from city headings", () => {
    const p = parseItinerary("New Mexico\nSanta Fe\nSanta Fe Plaza");
    expect(p.contexts).toEqual([
      { text: "New Mexico", kind: "region" },
      { text: "Santa Fe", kind: "city" },
    ]);
    expect(p.destinations[0].context.map((c) => c.kind)).toEqual([
      "city",
      "region",
    ]);
  });

  it("a heading-shaped line with nothing under it stays a place", () => {
    expect(names("PistachioLand\n15 hr drive\nDay 1")).toEqual(["PistachioLand"]);
  });

  it("does not attach a distant city to a self-standing National Park", () => {
    const p = parseItinerary(
      "Denver\nSkyline Park\n\nBadlands National Park",
    );
    const badlands = p.destinations.find((d) =>
      d.displayName.startsWith("Badlands"),
    )!;
    expect(badlands.context.some((c) => c.text === "Denver")).toBe(false);
  });

  it("preserves Day numbers on destinations", () => {
    const p = parseItinerary("Day 1\nAlcatraz\n\nDay 2\nMuir Woods");
    expect(p.destinations.map((d) => [d.displayName, d.day])).toEqual([
      ["Alcatraz", 1],
      ["Muir Woods", 2],
    ]);
  });
});

describe("resolveAbbreviation", () => {
  const contexts = [
    { text: "Albuquerque", kind: "city" as const },
    { text: "Santa Fe", kind: "city" as const },
  ];
  it("maps a known abbreviation to an established city", () => {
    expect(resolveAbbreviation("Abq", contexts)).toBe("Albuquerque");
    expect(resolveAbbreviation("ABQ", contexts)).toBe("Albuquerque");
  });
  it("does not guess when there is no established context", () => {
    expect(resolveAbbreviation("Abq", [])).toBeNull();
    expect(resolveAbbreviation("Xyz", contexts)).toBeNull();
  });
});

describe("parseItinerary — New Mexico regression fixture", () => {
  const parsed = parseItinerary(NEW_MEXICO_ITINERARY);
  const displayNames = parsed.destinations.map((d) => d.displayName);
  const contextTexts = parsed.contexts.map((c) => c.text);

  it("keeps real navigable destinations", () => {
    for (const expected of [
      "Albuquerque International Balloon Fiesta",
      "Sandia Peak Tramway",
      "Anderson Abruzzo Albuquerque International Balloon Museum",
      "Old Town Albuquerque",
      "Santa Fe Plaza",
      "Inn and Spa at Loretto",
      "Meow Wolf Santa Fe's House of Eternal Return",
      "Cathedral Basilica",
      "Canyon Road",
      "Georgia O'Keeffe Museum",
      "Bandelier National Monument",
      "Kasha-Katuwe Tent Rocks National Monument",
      "PistachioLand",
      "White Sands National Park",
      "Carlsbad Caverns National Park",
      "Bat Flight Amphitheater",
    ]) {
      expect(displayNames, expected).toContain(expected);
    }
  });

  it("treats cities / regions as context, never as pins", () => {
    expect(contextTexts).toEqual(
      expect.arrayContaining([
        "New Mexico",
        "Albuquerque",
        "Santa Fe",
        "Alamogordo",
        "Carlsbad",
      ]),
    );
    for (const ctx of ["New Mexico", "Albuquerque", "Santa Fe", "Carlsbad"]) {
      expect(displayNames).not.toContain(ctx);
    }
  });

  it("ignores dates, times, durations, notes, stays and headings", () => {
    const ignoredText = parsed.ignored.map((i) => i.text);
    for (const noise of [
      "NP CARD 6:50 PM Sunset",
      "10.3 - 10.4",
      "15 hr drive",
      "Around 5:30PM",
      "Departure 4PM",
      "Stay in Santa Fe",
      "Tent Rocks currently requires reservations and check-in at Cochiti Visitor Center.",
    ]) {
      expect(ignoredText, noise).toContain(noise);
    }
    expect(displayNames).not.toContain("Stay in Santa Fe");
  });

  it("de-duplicates the overview vs day-by-day repeats", () => {
    const counts = new Map<string, number>();
    for (const n of displayNames) counts.set(n, (counts.get(n) ?? 0) + 1);
    for (const [name, count] of counts) {
      expect(count, `${name} appears once`).toBe(1);
    }
  });

  it("carries Day numbers through to destinations", () => {
    const plaza = parsed.destinations.find(
      (d) => d.displayName === "Santa Fe Plaza",
    )!;
    expect(plaza.days).toContain(2);
    const tramway = parsed.destinations.find(
      (d) => d.displayName === "Sandia Peak Tramway",
    )!;
    expect(tramway.days).toContain(1);
  });

  it("qualifies Santa Fe attractions with Santa Fe + New Mexico context", () => {
    const cathedral = parsed.destinations.find(
      (d) => d.displayName === "Cathedral Basilica",
    )!;
    expect(cathedral.context.map((c) => c.text)).toEqual([
      "Santa Fe",
      "New Mexico",
    ]);
  });
});

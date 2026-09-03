import { describe, expect, it } from "vitest";
import {
  classifyLine,
  hasCJK,
  isSelfSufficientPlaceName,
} from "./classifyLine";

describe("classifyLine", () => {
  it("recognises day headings", () => {
    expect(classifyLine("Day 3")).toEqual({ type: "day", day: 3 });
    expect(classifyLine("day 12 - travel")).toEqual({ type: "day", day: 12 });
  });

  it("drops times, durations, dates and logistics", () => {
    for (const line of [
      "NP CARD 6:50 PM Sunset",
      "10.3 - 10.4",
      "After 4PM",
      "Around 5:30PM",
      "15 hr drive",
      "Landing 3:30",
      "Departure 4PM",
      "3 hrs",
      "Back to Abq and take off",
    ]) {
      expect(classifyLine(line).type, line).toBe("metadata");
    }
  });

  it("drops URLs", () => {
    expect(classifyLine("see https://nps.gov/band").type).toBe("url");
    expect(classifyLine("www.meowwolf.com").type).toBe("url");
  });

  it("treats descriptive / instructional lines as notes", () => {
    expect(
      classifyLine("Visitor Center → Main Loop Trail → Pueblo 遗址 → cliff dwellings")
        .type,
    ).toBe("note");
    expect(classifyLine("slot canyon + tent rocks 地貌 + 登高看全景").type).toBe(
      "note",
    );
    expect(
      classifyLine(
        "Tent Rocks currently requires reservations and check-in at Cochiti Visitor Center.",
      ).type,
    ).toBe("note");
  });

  it("captures 'Stay in …' as context, not a pin", () => {
    expect(classifyLine("Stay in Santa Fe")).toEqual({
      type: "stay",
      location: "Santa Fe",
    });
    expect(classifyLine("Stay in Abq")).toEqual({ type: "stay", location: "Abq" });
  });

  it("marks short Title-Case lines as provisional headings", () => {
    expect(classifyLine("Santa Fe")).toEqual({ type: "heading", text: "Santa Fe" });
    expect(classifyLine("New Mexico")).toEqual({
      type: "heading",
      text: "New Mexico",
    });
    expect(classifyLine("Tokyo")).toEqual({ type: "heading", text: "Tokyo" });
  });

  it("keeps POI phrases as places even when short", () => {
    for (const line of [
      "Santa Fe Plaza",
      "Cathedral Basilica",
      "Canyon Road",
      "Carlsbad Caverns National Park",
      "Meow Wolf Santa Fe's House of Eternal Return",
      "Louvre Museum",
    ]) {
      expect(classifyLine(line).type, line).toBe("place");
    }
  });

  it("strips trailing durations from place lines", () => {
    expect(classifyLine("Bandelier National Monument 3.5hr")).toEqual({
      type: "place",
      text: "Bandelier National Monument",
    });
    expect(classifyLine("Sandia Peak Tramway sunset 1hr")).toEqual({
      type: "place",
      text: "Sandia Peak Tramway",
    });
  });

  it("treats non-latin place lines as places", () => {
    expect(classifyLine("浅草寺")).toEqual({ type: "place", text: "浅草寺" });
    expect(classifyLine("東京スカイツリー").type).toBe("place");
  });

  it("drops mixed-language lines that carry a number/time", () => {
    expect(classifyLine("下午 3 点出发").type).toBe("metadata");
  });
});

describe("hasCJK / isSelfSufficientPlaceName", () => {
  it("detects CJK", () => {
    expect(hasCJK("卢浮宫")).toBe(true);
    expect(hasCJK("Louvre")).toBe(false);
  });
  it("detects self-standing named features", () => {
    expect(isSelfSufficientPlaceName("Badlands National Park")).toBe(true);
    expect(isSelfSufficientPlaceName("Mount Rushmore National Memorial")).toBe(true);
    expect(isSelfSufficientPlaceName("Cathedral Basilica")).toBe(false);
  });
});

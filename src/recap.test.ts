import { describe, expect, it } from "vitest";
import type { FeatureLogEntry } from "./feature-log.js";
import { buildRecap, formatRecap, parseRecapState, serializeRecapState } from "./recap.js";

const shippedEntry: FeatureLogEntry = {
  date: "2026-08-02",
  title: "Shipped thing",
  ice: { impact: 6, confidence: 7, ease: 8, composite: 7 },
  status: "shipped",
  commitSha: "abc1234",
};

const oldShippedEntry: FeatureLogEntry = {
  date: "2026-07-01",
  title: "Old shipped thing",
  ice: { impact: 5, confidence: 5, ease: 5, composite: 5 },
  status: "shipped",
  commitSha: "def5678",
};

const abandonedEntry: FeatureLogEntry = {
  date: "2026-08-02",
  title: "Abandoned thing",
  ice: { impact: 3, confidence: 4, ease: 2, composite: 3 },
  status: "abandoned",
  reason: "too risky",
};

const revertedEntry: FeatureLogEntry = {
  date: "2026-08-02",
  title: "Reverted thing",
  ice: { impact: 4, confidence: 4, ease: 4, composite: 4 },
  status: "reverted",
  reason: "failed verification",
  commitSha: "ffff000",
};

describe("buildRecap", () => {
  it("includes only entries on/after sinceDate", () => {
    const recap = buildRecap([oldShippedEntry, shippedEntry], "2026-08-01");
    expect(recap.shipped).toEqual([shippedEntry]);
    expect(recap.sinceLabel).toBe("since 2026-08-01");
  });

  it("includes everything when sinceDate is null", () => {
    const recap = buildRecap([oldShippedEntry, shippedEntry], null);
    expect(recap.shipped).toHaveLength(2);
    expect(recap.sinceLabel).toBe("all time");
  });

  it("splits abandoned and reverted entries into abandonedOrReverted", () => {
    const recap = buildRecap([abandonedEntry, revertedEntry], null);
    expect(recap.abandonedOrReverted).toEqual([abandonedEntry, revertedEntry]);
    expect(recap.shipped).toEqual([]);
  });
});

describe("formatRecap", () => {
  it("reports nothing-to-report when the window is empty", () => {
    const text = formatRecap(buildRecap([], "2026-08-01"));
    expect(text).toContain("Nothing to report");
  });

  it("summarizes counts and lists shipped/abandoned/reverted entries", () => {
    const text = formatRecap(buildRecap([shippedEntry, abandonedEntry, revertedEntry], null));
    expect(text).toContain("1 shipped, 1 abandoned, 1 reverted.");
    expect(text).toContain("Shipped thing");
    expect(text).toContain("Abandoned thing — too risky");
    expect(text).toContain("Reverted thing — failed verification");
  });
});

describe("recap state", () => {
  it("round-trips through serialize/parse", () => {
    const state = { lastRecapAt: "2026-08-01" };
    expect(parseRecapState(serializeRecapState(state))).toEqual(state);
  });

  it("returns null for content missing lastRecapAt", () => {
    expect(parseRecapState("{}")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseRecapState("not json")).toBeNull();
  });
});

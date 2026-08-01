import { describe, expect, it } from "vitest";
import { parseRunSummary, serializeRunSummary, type RunSummary } from "./run-summary.js";

const SAMPLE: RunSummary = {
  completedAt: "2026-08-01T20:00:00.000Z",
  shipped: ["Feature A", "Feature B"],
  abandoned: ["Feature C"],
  notAttempted: ["Feature D", "Feature E"],
  stopReason: "explicit-stop",
};

describe("serializeRunSummary / parseRunSummary", () => {
  it("round-trips a full summary", () => {
    expect(parseRunSummary(serializeRunSummary(SAMPLE))).toEqual(SAMPLE);
  });

  it("round-trips a summary with stopReason null (queue completed normally)", () => {
    const completed: RunSummary = { ...SAMPLE, stopReason: null };
    expect(parseRunSummary(serializeRunSummary(completed))).toEqual(completed);
  });

  it("round-trips empty arrays", () => {
    const empty: RunSummary = {
      completedAt: "2026-08-01T20:00:00.000Z",
      shipped: [],
      abandoned: [],
      notAttempted: [],
      stopReason: null,
    };
    expect(parseRunSummary(serializeRunSummary(empty))).toEqual(empty);
  });

  it("returns null for invalid JSON", () => {
    expect(parseRunSummary("not json {{{")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    expect(parseRunSummary(JSON.stringify({ shipped: [], abandoned: [] }))).toBeNull();
  });

  it("returns null for an invalid stopReason value", () => {
    expect(
      parseRunSummary(
        JSON.stringify({ ...SAMPLE, stopReason: "something-else" }),
      ),
    ).toBeNull();
  });

  it("returns null when an array field contains a non-string", () => {
    expect(
      parseRunSummary(JSON.stringify({ ...SAMPLE, shipped: ["ok", 5] })),
    ).toBeNull();
  });
});

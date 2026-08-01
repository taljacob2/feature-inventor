import { describe, expect, it } from "vitest";
import { computeAutonomyScore } from "./autonomy.js";
import type { FeatureLogEntry } from "./feature-log.js";

function entry(overrides: Partial<FeatureLogEntry> = {}): FeatureLogEntry {
  return {
    date: "2026-08-01",
    title: "Some feature",
    ice: { impact: 5, confidence: 5, ease: 5, composite: 5 },
    status: "shipped",
    ...overrides,
  };
}

describe("computeAutonomyScore", () => {
  it("scores 0 with no reasons when there's no selfAssessment or filesChanged", () => {
    expect(computeAutonomyScore(entry())).toEqual({ score: 0, reasons: [] });
  });

  it("adds 3 for a non-empty knowledgeGaps note", () => {
    const result = computeAutonomyScore(
      entry({
        selfAssessment: {
          creativity: "routine",
          difficulty: "easy",
          confident: true,
          wantedHumanGuidance: false,
          knowledgeGaps: "wasn't sure how X worked",
          modelFit: "right-sized",
        },
      }),
    );
    expect(result.score).toBe(3);
    expect(result.reasons).toContain("had to infer or guess at something missing from the repo/docs");
  });

  it("ignores a blank knowledgeGaps string", () => {
    const result = computeAutonomyScore(
      entry({
        selfAssessment: {
          creativity: "routine",
          difficulty: "easy",
          confident: true,
          wantedHumanGuidance: false,
          knowledgeGaps: "   ",
          modelFit: "right-sized",
        },
      }),
    );
    expect(result.score).toBe(0);
  });

  it("accumulates points across difficulty, confidence, and human-guidance signals", () => {
    const result = computeAutonomyScore(
      entry({
        selfAssessment: {
          creativity: "novel",
          difficulty: "hard",
          confident: false,
          wantedHumanGuidance: true,
          modelFit: "underpowered",
        },
      }),
    );
    // 2 (hard) + 2 (not confident) + 1 (wanted guidance) = 5
    expect(result.score).toBe(5);
    expect(result.reasons).toHaveLength(3);
  });

  it("adds up to 2 points for files touched, capped, at 1 point per 5 files", () => {
    expect(computeAutonomyScore(entry({ filesChanged: 3 })).score).toBe(0);
    expect(computeAutonomyScore(entry({ filesChanged: 5 })).score).toBe(1);
    expect(computeAutonomyScore(entry({ filesChanged: 20 })).score).toBe(2); // capped
  });

  it("caps the total score at 10", () => {
    const result = computeAutonomyScore(
      entry({
        filesChanged: 50,
        selfAssessment: {
          creativity: "novel",
          difficulty: "hard",
          confident: false,
          wantedHumanGuidance: true,
          knowledgeGaps: "a lot, honestly",
          modelFit: "underpowered",
        },
      }),
    );
    expect(result.score).toBe(10);
  });
});

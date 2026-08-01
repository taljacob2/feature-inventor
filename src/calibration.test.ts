import { describe, expect, it } from "vitest";
import { computeCalibrationStats } from "./calibration.js";
import type { FeatureLogEntry } from "./feature-log.js";

function entry(overrides: Partial<FeatureLogEntry> & Pick<FeatureLogEntry, "status">): FeatureLogEntry {
  return {
    date: "2026-08-01",
    title: "Some feature",
    ice: { impact: 5, confidence: 5, ease: 5, composite: 5 },
    ...overrides,
  };
}

describe("computeCalibrationStats", () => {
  it("returns all-null/zero stats for an empty history", () => {
    const stats = computeCalibrationStats([]);
    expect(stats.totalEntries).toBe(0);
    expect(stats.outcomeCounts).toEqual({ shipped: 0, abandoned: 0, reverted: 0 });
    expect(stats.averageIceConfidence).toEqual({ shipped: null, abandoned: null, reverted: null });
    expect(stats.hallucinationRate).toBeNull();
  });

  it("counts outcomes and averages ICE confidence per outcome", () => {
    const stats = computeCalibrationStats([
      entry({ status: "shipped", ice: { impact: 5, confidence: 8, ease: 5, composite: 6 } }),
      entry({ status: "shipped", ice: { impact: 5, confidence: 6, ease: 5, composite: 5.3 } }),
      entry({ status: "abandoned", ice: { impact: 5, confidence: 3, ease: 5, composite: 4.3 } }),
      entry({ status: "reverted", ice: { impact: 5, confidence: 9, ease: 5, composite: 6.3 } }),
    ]);

    expect(stats.totalEntries).toBe(4);
    expect(stats.outcomeCounts).toEqual({ shipped: 2, abandoned: 1, reverted: 1 });
    expect(stats.averageIceConfidence.shipped).toBe(7); // (8 + 6) / 2
    expect(stats.averageIceConfidence.abandoned).toBe(3);
    expect(stats.averageIceConfidence.reverted).toBe(9);
  });

  it("computes a hallucination rate from confident-but-reverted vs confident-and-shipped", () => {
    const confident = { creativity: "routine", difficulty: "easy", confident: true, wantedHumanGuidance: false, modelFit: "right-sized" } as const;
    const stats = computeCalibrationStats([
      entry({ status: "shipped", selfAssessment: confident }),
      entry({ status: "shipped", selfAssessment: confident }),
      entry({ status: "reverted", selfAssessment: confident }),
    ]);

    // 1 confident-but-reverted out of (1 reverted + 2 shipped) confident claims = 1/3
    expect(stats.confidentButRevertedCount).toBe(1);
    expect(stats.confidentAndShippedCount).toBe(2);
    expect(stats.hallucinationRate).toBeCloseTo(1 / 3);
  });

  it("ignores entries without a confident selfAssessment when computing the hallucination rate", () => {
    const stats = computeCalibrationStats([
      entry({ status: "shipped" }), // no selfAssessment at all
      entry({
        status: "reverted",
        selfAssessment: {
          creativity: "routine",
          difficulty: "hard",
          confident: false, // explicitly not confident — shouldn't count as a hallucination
          wantedHumanGuidance: true,
          modelFit: "underpowered",
        },
      }),
    ]);

    expect(stats.hallucinationRate).toBeNull();
    expect(stats.confidentButRevertedCount).toBe(0);
    expect(stats.confidentAndShippedCount).toBe(0);
  });
});

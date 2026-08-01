// Compares what the loop predicted (ICE Confidence, and — once logged —
// the implementer's own selfAssessment.confident) against what actually
// happened (shipped-and-verified / abandoned / reverted), across the full
// feature-log.jsonl history. See ROADMAP.md's "Calibration log" Next item
// and RESEARCH.md §4 on why self-reported confidence needs checking
// against reality rather than being trusted directly.

import type { FeatureAttemptStatus, FeatureLogEntry } from "./feature-log.js";

export interface CalibrationStats {
  totalEntries: number;
  outcomeCounts: Record<FeatureAttemptStatus, number>;
  /** Average pre-attempt ICE Confidence per outcome; null when there are no entries for that outcome. */
  averageIceConfidence: Record<FeatureAttemptStatus, number | null>;
  /**
   * Of features whose implementer self-reported `confident: true`, the
   * fraction that were later reverted anyway — a claim that didn't hold up
   * under independent verification. Null until there's at least one
   * self-assessed shipped or reverted entry to compute a rate from.
   */
  hallucinationRate: number | null;
  confidentButRevertedCount: number;
  confidentAndShippedCount: number;
}

const EMPTY_OUTCOME_COUNTS = (): Record<FeatureAttemptStatus, number> => ({
  shipped: 0,
  abandoned: 0,
  reverted: 0,
});

/** Computes calibration stats from the full parsed feature-log history. */
export function computeCalibrationStats(entries: FeatureLogEntry[]): CalibrationStats {
  const outcomeCounts = EMPTY_OUTCOME_COUNTS();
  const confidenceSums = EMPTY_OUTCOME_COUNTS();
  const confidenceCounts = EMPTY_OUTCOME_COUNTS();
  let confidentButReverted = 0;
  let confidentAndShipped = 0;

  for (const entry of entries) {
    outcomeCounts[entry.status]++;
    confidenceSums[entry.status] += entry.ice.confidence;
    confidenceCounts[entry.status]++;

    if (entry.selfAssessment?.confident === true) {
      if (entry.status === "reverted") confidentButReverted++;
      if (entry.status === "shipped") confidentAndShipped++;
    }
  }

  const average = (status: FeatureAttemptStatus): number | null =>
    confidenceCounts[status] === 0 ? null : confidenceSums[status] / confidenceCounts[status];

  const hallucinationDenominator = confidentButReverted + confidentAndShipped;

  return {
    totalEntries: entries.length,
    outcomeCounts,
    averageIceConfidence: {
      shipped: average("shipped"),
      abandoned: average("abandoned"),
      reverted: average("reverted"),
    },
    hallucinationRate: hallucinationDenominator === 0 ? null : confidentButReverted / hallucinationDenominator,
    confidentButRevertedCount: confidentButReverted,
    confidentAndShippedCount: confidentAndShipped,
  };
}

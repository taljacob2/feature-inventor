// A deterministic, formula-based per-feature "harness vs. dark factory"
// autonomy score — NOT a trained model. ROADMAP.md's "harness vs. dark
// factory" Later item explicitly defers training a real predictive model
// until enough feature-log.jsonl history has accumulated; this scaffolds
// the signal collection (selfAssessment.knowledgeGaps, filesChanged) and a
// simple deterministic scoring formula over those signals now, so there's
// something real to compare a future trained model against once there's
// enough data. The score is computed from a FeatureLogEntry rather than
// stored in one, so improving the formula later re-scores old entries
// instead of leaving them stuck with a stale number.

import type { FeatureLogEntry } from "./feature-log.js";

export interface AutonomyScore {
  /** 0-10: higher means the attempt leaned more on inference/assumption the agent couldn't verify. */
  score: number;
  /** Human-readable reasons the score is what it is, in the order they were applied. */
  reasons: string[];
}

const FILES_CHANGED_PER_POINT = 5;
const MAX_FILES_CHANGED_CONTRIBUTION = 2;
const MAX_SCORE = 10;

/** Computes an autonomy score from one feature-log entry's recorded signals. */
export function computeAutonomyScore(entry: FeatureLogEntry): AutonomyScore {
  const reasons: string[] = [];
  let score = 0;

  const selfAssessment = entry.selfAssessment;
  if (selfAssessment) {
    if (selfAssessment.knowledgeGaps && selfAssessment.knowledgeGaps.trim() !== "") {
      score += 3;
      reasons.push("had to infer or guess at something missing from the repo/docs");
    }
    if (selfAssessment.difficulty === "hard") {
      score += 2;
      reasons.push("self-reported difficulty: hard");
    }
    if (!selfAssessment.confident) {
      score += 2;
      reasons.push("implementer was not confident in the result");
    }
    if (selfAssessment.wantedHumanGuidance) {
      score += 1;
      reasons.push("implementer would have wanted human guidance");
    }
  }

  if (typeof entry.filesChanged === "number" && entry.filesChanged > 0) {
    const filesContribution = Math.min(
      Math.floor(entry.filesChanged / FILES_CHANGED_PER_POINT),
      MAX_FILES_CHANGED_CONTRIBUTION,
    );
    if (filesContribution > 0) {
      score += filesContribution;
      reasons.push(`touched ${entry.filesChanged} files`);
    }
  }

  return { score: Math.min(score, MAX_SCORE), reasons };
}

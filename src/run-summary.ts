// A small, gitignored, single-record file (like stop-flag.ts/recap.ts's
// state files) answering "after a run ends, where did it leave off, and did
// anything already researched/ranked survive into ROADMAP.md" — see
// ROADMAP.md's "Explicit 'where did we stop' / resume-point summary" item.
// Always reflects only the most recent run, not a history (feature-log.jsonl
// is the append-only history; this is just "what happened last time").

export const RUN_SUMMARY_FILENAME = ".feature-inventor-last-run.json";

export type StopReason = "max-features-reached" | "explicit-stop" | null;

export interface RunSummary {
  /** ISO 8601 UTC timestamp for when Finalize completed. */
  completedAt: string;
  shipped: string[];
  abandoned: string[];
  /**
   * Titles of already-researched-and-ICE-scored candidates that were never
   * attempted this run — reassures a human reading `status` that this work
   * wasn't silently dropped, since it should also appear in ROADMAP.md's
   * Now/Next sections after Finalize's rewrite.
   */
  notAttempted: string[];
  /** null means the run worked through its whole queue rather than stopping short. */
  stopReason: StopReason;
}

export function serializeRunSummary(summary: RunSummary): string {
  return JSON.stringify(summary, null, 2);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function parseRunSummary(content: string): RunSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  if (typeof candidate.completedAt !== "string") return null;
  if (!isStringArray(candidate.shipped)) return null;
  if (!isStringArray(candidate.abandoned)) return null;
  if (!isStringArray(candidate.notAttempted)) return null;
  if (
    candidate.stopReason !== null &&
    candidate.stopReason !== "max-features-reached" &&
    candidate.stopReason !== "explicit-stop"
  ) {
    return null;
  }

  return {
    completedAt: candidate.completedAt,
    shipped: candidate.shipped,
    abandoned: candidate.abandoned,
    notAttempted: candidate.notAttempted,
    stopReason: candidate.stopReason,
  };
}

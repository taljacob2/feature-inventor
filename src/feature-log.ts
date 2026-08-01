// Structured, cross-run history of every feature attempt the nightly loop
// makes: one JSON object per line (JSON Lines), append-only. This is the
// durable record that survives after a single run's in-memory
// shipped/abandoned arrays (see workflows/nightly.js) are discarded — the
// Finalize/re-evaluation step and the future Calibration log roadmap item
// both need real history across many nights, not just last night's
// snapshot. See ROADMAP.md "Next" and RESEARCH.md §4.

export interface FeatureLogIceScore {
  impact: number;
  confidence: number;
  ease: number;
  composite: number;
}

export type FeatureAttemptStatus = "shipped" | "abandoned" | "reverted";

export type Creativity = "routine" | "creative" | "novel";
export type DifficultyTier = "easy" | "medium" | "hard";
export type ModelFit = "overkill" | "right-sized" | "underpowered";

/**
 * The implementing agent's own retrospective read on a feature it just
 * attempted — raw data for the Calibration log and harness-vs-dark-factory
 * ROADMAP.md items. Optional because it's only collected going forward (see
 * `RESEARCH.md` §4 on why self-reported confidence needs prompting that
 * resists drifting upward without cause).
 */
export interface FeatureSelfAssessment {
  /** Reused an existing pattern, combined existing ideas creatively, or genuinely novel. */
  creativity: Creativity;
  /** Independent of the pre-scored ICE Ease value — how hard this actually was. */
  difficulty: DifficultyTier;
  /** Actually confident this does what it claims, vs. hoping the tests happened to pass. */
  confident: boolean;
  /** Would have wanted a human to weigh in, even if it proceeded alone. */
  wantedHumanGuidance: boolean;
  /** What had to be guessed/inferred because it was missing from the repo/docs. */
  knowledgeGaps?: string;
  /** Whether a cheaper model likely would have sufficed, this one was about right, or a more capable one was genuinely needed. */
  modelFit: ModelFit;
}

export interface FeatureLogEntry {
  /** YYYY-MM-DD, the date the attempt was made. */
  date: string;
  title: string;
  ice: FeatureLogIceScore;
  status: FeatureAttemptStatus;
  /** Required when status is "abandoned" or "reverted". */
  reason?: string;
  /** Present when status is "shipped" or "reverted" (the shipped-then-reverted commit). */
  commitSha?: string;
  /** Notes from independent verification, even when it passed. */
  verificationConcerns?: string;
  /** Absent for attempts where the implementing agent never returned a result at all. */
  selfAssessment?: FeatureSelfAssessment;
  /**
   * File count from independent verification's `git show --stat` (not the
   * implementer's own report, which could be inaccurate) — a raw, factual
   * signal for the harness-vs-dark-factory autonomy score, see
   * `src/autonomy.ts`. Absent when there's no shipped/reverted commit to
   * measure (e.g. a pre-commit abandon).
   */
  filesChanged?: number;
}

/**
 * Serializes one entry to a single JSON Lines record (no trailing newline).
 */
export function serializeFeatureLogEntry(entry: FeatureLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Appends entries to existing JSON Lines file content, returning the new
 * full content. Pure function — callers are responsible for actually
 * reading/writing the file on disk.
 */
export function appendFeatureLogEntries(
  existingContent: string,
  entries: FeatureLogEntry[],
): string {
  if (entries.length === 0) return existingContent;

  const newLines = entries.map(serializeFeatureLogEntry).join("\n");

  if (existingContent.length === 0) return newLines + "\n";

  const separator = existingContent.endsWith("\n") ? "" : "\n";
  return existingContent + separator + newLines + "\n";
}

/**
 * Parses JSON Lines feature-log content into entries, in file order
 * (oldest first). Blank lines and lines that fail to parse as a valid
 * entry are skipped rather than throwing, so a stray corrupt line can't
 * take down tooling (e.g. `feature-inventor status`) reading the rest of
 * the history.
 */
export function parseFeatureLogEntries(content: string): FeatureLogEntry[] {
  const entries: FeatureLogEntry[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (isFeatureLogEntry(parsed)) entries.push(parsed);
  }

  return entries;
}

function isFeatureLogEntry(value: unknown): value is FeatureLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.date !== "string") return false;
  if (typeof candidate.title !== "string") return false;
  if (candidate.status !== "shipped" && candidate.status !== "abandoned" && candidate.status !== "reverted") {
    return false;
  }

  const ice = candidate.ice as Record<string, unknown> | undefined;
  if (
    typeof ice !== "object" ||
    ice === null ||
    typeof ice.impact !== "number" ||
    typeof ice.confidence !== "number" ||
    typeof ice.ease !== "number" ||
    typeof ice.composite !== "number"
  ) {
    return false;
  }

  if (candidate.selfAssessment !== undefined && !isFeatureSelfAssessment(candidate.selfAssessment)) {
    return false;
  }

  if (candidate.filesChanged !== undefined && typeof candidate.filesChanged !== "number") {
    return false;
  }

  return true;
}

const CREATIVITY_VALUES: Creativity[] = ["routine", "creative", "novel"];
const DIFFICULTY_VALUES: DifficultyTier[] = ["easy", "medium", "hard"];
const MODEL_FIT_VALUES: ModelFit[] = ["overkill", "right-sized", "underpowered"];

function isFeatureSelfAssessment(value: unknown): value is FeatureSelfAssessment {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    CREATIVITY_VALUES.includes(candidate.creativity as Creativity) &&
    DIFFICULTY_VALUES.includes(candidate.difficulty as DifficultyTier) &&
    typeof candidate.confident === "boolean" &&
    typeof candidate.wantedHumanGuidance === "boolean" &&
    (candidate.knowledgeGaps === undefined || typeof candidate.knowledgeGaps === "string") &&
    MODEL_FIT_VALUES.includes(candidate.modelFit as ModelFit)
  );
}

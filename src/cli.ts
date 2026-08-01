#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseBacklogCounts,
  parseChangelogEntries,
  parseNextSection,
  parseNowSection,
  type BacklogCounts,
} from "./roadmap.js";
import { parseFeatureLogEntries, type FeatureLogEntry } from "./feature-log.js";
import { computeCalibrationStats, type CalibrationStats } from "./calibration.js";
import { computeAutonomyScore } from "./autonomy.js";
import { RUN_SUMMARY_FILENAME, parseRunSummary, type RunSummary } from "./run-summary.js";
import { STOP_FLAG_FILENAME, parseStopFlag, serializeStopFlag } from "./stop-flag.js";
import {
  RECAP_STATE_FILENAME,
  buildRecap,
  formatRecap,
  parseRecapState,
  serializeRecapState,
} from "./recap.js";

function readRequiredFile(repoRoot: string, filename: string): string {
  try {
    return readFileSync(join(repoRoot, filename), "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not read ${filename} (${reason})`);
    process.exit(1);
  }
}

/**
 * feature-log.jsonl is optional: it doesn't exist until the nightly loop has
 * completed at least one Implement phase, so its absence is not an error
 * the way a missing ROADMAP.md/CHANGELOG.md is.
 */
function readOptionalFile(repoRoot: string, filename: string): string | null {
  try {
    return readFileSync(join(repoRoot, filename), "utf8");
  } catch {
    return null;
  }
}

/** How many Next-section titles to preview when the Now section is empty. */
const NEXT_PREVIEW_LIMIT = 3;

export interface StatusData {
  nowItems: string[];
  /**
   * Top titles from ROADMAP.md's Next section, populated only when nowItems
   * is empty — a preview so a check-in right after clearing the backlog
   * still shows something concrete instead of an uninformative placeholder.
   */
  nextPreview: string[];
  backlogCounts: BacklogCounts;
  recentShipped: string[];
  recentAttempts: FeatureLogEntry[];
  /** Computed from the full feature-log.jsonl history, not just recentAttempts. */
  calibration: CalibrationStats;
  /** ISO 8601 timestamp if a `feature-inventor stop` request is pending, else null. */
  stopRequestedAt: string | null;
  /** Where the most recent run left off, or null if no run has completed yet. */
  lastRun: RunSummary | null;
}

/**
 * Reads ROADMAP.md, CHANGELOG.md, and (optionally) feature-log.jsonl from
 * repoRoot and returns the same parsed data `printStatus` renders as text —
 * the single source of truth for both the human-readable and `--json`
 * output modes, so they can never drift apart.
 */
export function getStatusData(repoRoot: string): StatusData {
  const roadmap = readRequiredFile(repoRoot, "ROADMAP.md");
  const changelog = readRequiredFile(repoRoot, "CHANGELOG.md");

  const nowItems = parseNowSection(roadmap);
  const nextPreview = nowItems.length === 0 ? parseNextSection(roadmap).slice(0, NEXT_PREVIEW_LIMIT) : [];
  const backlogCounts = parseBacklogCounts(roadmap);
  const recentShipped = parseChangelogEntries(changelog, 5);

  const featureLogContent = readOptionalFile(repoRoot, "feature-log.jsonl");
  const allAttempts = featureLogContent ? parseFeatureLogEntries(featureLogContent) : [];
  const recentAttempts = allAttempts.slice(-5).reverse();
  const calibration = computeCalibrationStats(allAttempts);

  const stopFlagContent = readOptionalFile(repoRoot, STOP_FLAG_FILENAME);
  let stopRequestedAt: string | null = null;
  if (stopFlagContent !== null) {
    const parsed = parseStopFlag(stopFlagContent);
    stopRequestedAt = parsed ? parsed.requestedAt : "(unknown time)";
  }

  const runSummaryContent = readOptionalFile(repoRoot, RUN_SUMMARY_FILENAME);
  const lastRun = runSummaryContent ? parseRunSummary(runSummaryContent) : null;

  return {
    nowItems,
    nextPreview,
    backlogCounts,
    recentShipped,
    recentAttempts,
    calibration,
    stopRequestedAt,
    lastRun,
  };
}

export function printStatus(repoRoot: string, options: { json?: boolean } = {}): void {
  const data = getStatusData(repoRoot);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { nowItems, nextPreview, backlogCounts, recentShipped, recentAttempts, calibration, stopRequestedAt, lastRun } =
    data;

  console.log("Feature Inventor — status\n");

  if (stopRequestedAt) {
    console.log(
      `Stop requested at ${stopRequestedAt} — the nightly loop will wrap up its current feature ` +
        "and stop before starting another. Run `feature-inventor stop --cancel` to undo.\n",
    );
  }

  if (lastRun) {
    const stopNote =
      lastRun.stopReason === null
        ? "it worked through its whole queue"
        : lastRun.stopReason === "explicit-stop"
          ? "a stop was requested"
          : "it hit this run's feature cap";
    console.log(
      `Last run finished ${lastRun.completedAt} — ${stopNote}, nothing was left mid-feature. ` +
        `${lastRun.shipped.length} shipped, ${lastRun.abandoned.length} abandoned, ` +
        `${lastRun.notAttempted.length} not attempted.`,
    );
    if (lastRun.notAttempted.length > 0) {
      console.log(
        `Not attempted (already researched and ICE-scored, carried into ROADMAP.md): ${lastRun.notAttempted.join(", ")}`,
      );
    }
    console.log("");
  }

  console.log(`Up next (${nowItems.length}):`);
  if (nowItems.length === 0) {
    if (nextPreview.length > 0) {
      console.log("  (none — ROADMAP.md's Now section is empty; previewing top of Next)");
      for (const item of nextPreview) console.log(`  - ${item}`);
    } else {
      console.log("  (none — ROADMAP.md's Now section is empty)");
    }
  } else {
    for (const item of nowItems) console.log(`  - ${item}`);
  }

  console.log(
    `\nBacklog: ${backlogCounts.next} in Next, ${backlogCounts.later} in Later, ${backlogCounts.horizon} in Horizon.`,
  );

  console.log("\nRecently shipped:");
  if (recentShipped.length === 0) {
    console.log("  (nothing yet — no nightly run has completed)");
  } else {
    for (const entry of recentShipped) console.log(`  - ${entry}`);
  }

  console.log("\nRecent feature attempts:");
  if (recentAttempts.length === 0) {
    console.log("  (none recorded yet — see feature-log.jsonl once the loop has run)");
  } else {
    for (const entry of recentAttempts) {
      const suffix = entry.commitSha ? ` (${entry.commitSha})` : "";
      const autonomy = entry.selfAssessment || entry.filesChanged !== undefined ? computeAutonomyScore(entry) : null;
      const autonomySuffix = autonomy ? ` [autonomy ${autonomy.score}/10]` : "";
      console.log(`  - [${entry.status}] ${entry.title} — ICE ${entry.ice.composite.toFixed(1)}${suffix}${autonomySuffix}`);
    }
  }

  console.log("\nCalibration:");
  if (calibration.totalEntries === 0) {
    console.log("  (nothing logged yet — see feature-log.jsonl once the loop has run)");
  } else {
    const fmt = (n: number | null) => (n === null ? "n/a" : n.toFixed(1));
    console.log(
      `  Shipped ${calibration.outcomeCounts.shipped} (avg predicted confidence ${fmt(calibration.averageIceConfidence.shipped)}), ` +
        `abandoned ${calibration.outcomeCounts.abandoned} (${fmt(calibration.averageIceConfidence.abandoned)}), ` +
        `reverted ${calibration.outcomeCounts.reverted} (${fmt(calibration.averageIceConfidence.reverted)}).`,
    );
    if (calibration.hallucinationRate === null) {
      console.log("  Hallucination rate: n/a (no self-assessed \"confident\" shipped/reverted features yet)");
    } else {
      console.log(
        `  Hallucination rate: ${(calibration.hallucinationRate * 100).toFixed(0)}% ` +
          `(${calibration.confidentButRevertedCount} of ${calibration.confidentButRevertedCount + calibration.confidentAndShippedCount} ` +
          `self-reported-confident features were later reverted).`,
      );
    }
  }
}

/**
 * Requests or cancels a graceful stop of the nightly loop. A request is a
 * gitignored local flag file (see src/stop-flag.ts); `workflows/nightly.js`
 * checks for it between features (not mid-feature) so anything already in
 * progress still finishes, gets verified, and is logged normally before the
 * run wraps up early instead of picking up another candidate.
 */
export function runStop(repoRoot: string, options: { cancel?: boolean } = {}): void {
  const flagPath = join(repoRoot, STOP_FLAG_FILENAME);

  if (options.cancel) {
    if (existsSync(flagPath)) {
      unlinkSync(flagPath);
      console.log("Stop request cancelled — the nightly loop will run normally.");
    } else {
      console.log("No stop request was pending.");
    }
    return;
  }

  if (existsSync(flagPath)) {
    const existing = parseStopFlag(readFileSync(flagPath, "utf8"));
    console.log(`Stop already requested at ${existing?.requestedAt ?? "(unknown time)"} — still pending.`);
    return;
  }

  const requestedAt = new Date().toISOString();
  writeFileSync(flagPath, serializeStopFlag({ requestedAt }), "utf8");
  console.log(
    "Stop requested. The nightly loop will finish whatever feature it's currently on, skip " +
      "starting a new one, and still update the roadmap/changelog before exiting. Run " +
      "`feature-inventor stop --cancel` to undo this before it takes effect.",
  );
}

/**
 * Prints a "while you were sleeping" summary of feature-log.jsonl activity
 * since the last recap (or `--since`/`--all`), then records today as the
 * new watermark unless `--peek` was passed.
 */
export function runRecap(
  repoRoot: string,
  options: { since?: string; all?: boolean; peek?: boolean } = {},
): void {
  const featureLogContent = readOptionalFile(repoRoot, "feature-log.jsonl");
  const entries = featureLogContent ? parseFeatureLogEntries(featureLogContent) : [];

  let sinceDate: string | null;
  if (options.all) {
    sinceDate = null;
  } else if (options.since) {
    sinceDate = options.since;
  } else {
    const stateContent = readOptionalFile(repoRoot, RECAP_STATE_FILENAME);
    const state = stateContent ? parseRecapState(stateContent) : null;
    sinceDate = state ? state.lastRecapAt : null;
  }

  console.log(formatRecap(buildRecap(entries, sinceDate)));

  if (!options.peek) {
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(repoRoot, RECAP_STATE_FILENAME), serializeRecapState({ lastRecapAt: today }), "utf8");
  }
}

const USAGE = "Usage: feature-inventor [status [--json] | recap [--since DATE|--all] [--peek] | stop [--cancel] | --help | --version]";

/**
 * Prints usage/description and exits 0. Shared by the `--help`/`-h` flags
 * (feature-inventor treats those as top-level commands, not options of
 * `status`) so `feature-inventor --help` behaves the way users expect from
 * virtually every other CLI instead of falling through to "Unknown command".
 */
export function printHelp(): void {
  console.log("feature-inventor — a self-hosted, self-growing nightly feature-building loop.\n");
  console.log(USAGE);
}

/**
 * Prints the version from package.json and exits 0. repoRoot defaults to the
 * package root (one directory up from this compiled file in dist/) so it
 * works regardless of the caller's current working directory.
 */
export function printVersion(packageRoot: string = join(dirname(fileURLToPath(import.meta.url)), "..")): void {
  const raw = readRequiredFile(packageRoot, "package.json");
  const parsed = JSON.parse(raw) as { version?: string };
  console.log(parsed.version ?? "unknown");
}

function main(): void {
  const [, , command, ...rest] = process.argv;

  switch (command ?? "status") {
    case "status":
      printStatus(process.cwd(), { json: rest.includes("--json") });
      break;
    case "recap": {
      const sinceIndex = rest.indexOf("--since");
      const since = sinceIndex !== -1 ? rest[sinceIndex + 1] : undefined;
      runRecap(process.cwd(), { since, all: rest.includes("--all"), peek: rest.includes("--peek") });
      break;
    }
    case "stop":
      runStop(process.cwd(), { cancel: rest.includes("--cancel") });
      break;
    case "--help":
    case "-h":
      printHelp();
      break;
    case "--version":
    case "-v":
      printVersion();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(USAGE);
      process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

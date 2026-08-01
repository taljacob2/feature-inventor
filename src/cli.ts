#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChangelogEntries, parseNowSection } from "./roadmap.js";
import { parseFeatureLogEntries, type FeatureLogEntry } from "./feature-log.js";
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

export interface StatusData {
  nowItems: string[];
  recentShipped: string[];
  recentAttempts: FeatureLogEntry[];
  /** ISO 8601 timestamp if a `feature-inventor stop` request is pending, else null. */
  stopRequestedAt: string | null;
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
  const recentShipped = parseChangelogEntries(changelog, 5);

  const featureLogContent = readOptionalFile(repoRoot, "feature-log.jsonl");
  const recentAttempts = featureLogContent
    ? parseFeatureLogEntries(featureLogContent).slice(-5).reverse()
    : [];

  const stopFlagContent = readOptionalFile(repoRoot, STOP_FLAG_FILENAME);
  let stopRequestedAt: string | null = null;
  if (stopFlagContent !== null) {
    const parsed = parseStopFlag(stopFlagContent);
    stopRequestedAt = parsed ? parsed.requestedAt : "(unknown time)";
  }

  return { nowItems, recentShipped, recentAttempts, stopRequestedAt };
}

export function printStatus(repoRoot: string, options: { json?: boolean } = {}): void {
  const data = getStatusData(repoRoot);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { nowItems, recentShipped, recentAttempts, stopRequestedAt } = data;

  console.log("Feature Inventor — status\n");

  if (stopRequestedAt) {
    console.log(
      `Stop requested at ${stopRequestedAt} — the nightly loop will wrap up its current feature ` +
        "and stop before starting another. Run `feature-inventor stop --cancel` to undo.\n",
    );
  }

  console.log(`Up next (${nowItems.length}):`);
  if (nowItems.length === 0) {
    console.log("  (none — ROADMAP.md's Now section is empty)");
  } else {
    for (const item of nowItems) console.log(`  - ${item}`);
  }

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
      console.log(`  - [${entry.status}] ${entry.title} — ICE ${entry.ice.composite.toFixed(1)}${suffix}`);
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
    default:
      console.error(`Unknown command: ${command}`);
      console.error(
        "Usage: feature-inventor [status [--json] | recap [--since DATE|--all] [--peek] | stop [--cancel]]",
      );
      process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

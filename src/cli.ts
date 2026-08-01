#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChangelogEntries, parseNowSection } from "./roadmap.js";
import { parseFeatureLogEntries, type FeatureLogEntry } from "./feature-log.js";

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

  return { nowItems, recentShipped, recentAttempts };
}

export function printStatus(repoRoot: string, options: { json?: boolean } = {}): void {
  const data = getStatusData(repoRoot);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { nowItems, recentShipped, recentAttempts } = data;

  console.log("Feature Inventor — status\n");

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

function main(): void {
  const [, , command, ...rest] = process.argv;

  switch (command ?? "status") {
    case "status":
      printStatus(process.cwd(), { json: rest.includes("--json") });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Usage: feature-inventor [status] [--json]");
      process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

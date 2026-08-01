#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChangelogEntries, parseNowSection } from "./roadmap.js";

function readRequiredFile(repoRoot: string, filename: string): string {
  try {
    return readFileSync(join(repoRoot, filename), "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not read ${filename} (${reason})`);
    process.exit(1);
  }
}

export function printStatus(repoRoot: string): void {
  const roadmap = readRequiredFile(repoRoot, "ROADMAP.md");
  const changelog = readRequiredFile(repoRoot, "CHANGELOG.md");

  const nowItems = parseNowSection(roadmap);
  const recentShipped = parseChangelogEntries(changelog, 5);

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
}

function main(): void {
  const [, , command] = process.argv;

  switch (command ?? "status") {
    case "status":
      printStatus(process.cwd());
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Usage: feature-inventor [status]");
      process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

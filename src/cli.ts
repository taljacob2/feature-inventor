#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChangelogEntries, parseNowSection } from "./roadmap.js";

function printStatus(repoRoot: string): void {
  const roadmap = readFileSync(join(repoRoot, "ROADMAP.md"), "utf8");
  const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");

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

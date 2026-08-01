// "While you were sleeping" summary: what the nightly loop shipped,
// abandoned, or reverted since the last time a human looked. Reads the same
// feature-log.jsonl history `feature-inventor status` draws its "Recent
// feature attempts" section from (see src/feature-log.ts), but scoped to a
// date window and framed as a recap rather than a fixed-length tail.

import type { FeatureLogEntry } from "./feature-log.js";

export const RECAP_STATE_FILENAME = ".feature-inventor-recap-state.json";

export interface RecapState {
  /** YYYY-MM-DD — the date of the last recap a human actually viewed. */
  lastRecapAt: string;
}

export function serializeRecapState(state: RecapState): string {
  return JSON.stringify(state, null, 2) + "\n";
}

export function parseRecapState(raw: string): RecapState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as Record<string, unknown>).lastRecapAt === "string"
  ) {
    return parsed as RecapState;
  }
  return null;
}

export interface RecapData {
  sinceLabel: string;
  shipped: FeatureLogEntry[];
  abandonedOrReverted: FeatureLogEntry[];
}

/**
 * Splits feature-log entries into a recap window. `sinceDate` is an
 * inclusive YYYY-MM-DD lower bound on `entry.date`; `null` means "everything
 * ever recorded" (e.g. a first-ever recap, with no prior state to compare
 * against).
 */
export function buildRecap(entries: FeatureLogEntry[], sinceDate: string | null): RecapData {
  const relevant = sinceDate === null ? entries : entries.filter((entry) => entry.date >= sinceDate);

  return {
    sinceLabel: sinceDate === null ? "all time" : `since ${sinceDate}`,
    shipped: relevant.filter((entry) => entry.status === "shipped"),
    abandonedOrReverted: relevant.filter((entry) => entry.status !== "shipped"),
  };
}

export function formatRecap(data: RecapData): string {
  const lines: string[] = [];
  lines.push(`While you were sleeping (${data.sinceLabel}):`);

  const total = data.shipped.length + data.abandonedOrReverted.length;
  if (total === 0) {
    lines.push("");
    lines.push("Nothing to report - no feature attempts recorded in this window.");
    return lines.join("\n");
  }

  const reverted = data.abandonedOrReverted.filter((entry) => entry.status === "reverted").length;
  const abandoned = data.abandonedOrReverted.length - reverted;
  lines.push("");
  lines.push(`${data.shipped.length} shipped, ${abandoned} abandoned, ${reverted} reverted.`);

  if (data.shipped.length > 0) {
    lines.push("");
    lines.push("Shipped:");
    for (const entry of data.shipped) {
      const suffix = entry.commitSha ? ` (${entry.commitSha})` : "";
      lines.push(`  - ${entry.title} — ICE ${entry.ice.composite.toFixed(1)}${suffix}`);
    }
  }

  if (data.abandonedOrReverted.length > 0) {
    lines.push("");
    lines.push("Abandoned / reverted:");
    for (const entry of data.abandonedOrReverted) {
      const reasonSuffix = entry.reason ? ` — ${entry.reason}` : "";
      lines.push(`  - [${entry.status}] ${entry.title}${reasonSuffix}`);
    }
  }

  return lines.join("\n");
}

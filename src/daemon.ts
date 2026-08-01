// Pure logic for `feature-inventor daemon` — a long-running process that
// itself decides when a nightly run is due and spawns a headless Claude Code
// invocation to run it, instead of relying on the OS's own scheduler or
// Claude Code's session-scoped (7-day, non-durable) CronCreate. See
// CONTRIBUTING.md's "Running the daemon" section for the actual spawn/poll
// logic (child_process usage, which isn't unit-testable here) and for why
// `.feature-inventor-last-run.json`'s completedAt — not the spawned
// process's own exit, or claude agents' JSON output — is the authoritative
// signal that a cycle actually finished.

/** Parses a duration like "30m", "12h", or "1d" into milliseconds. */
export function parseIntervalToMs(spec: string): number {
  const match = spec.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/i);
  if (!match) {
    throw new Error(`Invalid interval "${spec}" — expected a number followed by s/m/h/d, e.g. "12h" or "1d".`);
  }
  const value = parseFloat(match[1]);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * unitMs[match[2].toLowerCase()];
}

/**
 * Whether a new run is due given the last completed run's timestamp (or
 * null if none has ever completed) and the configured interval. A malformed
 * timestamp is treated as due rather than getting the daemon permanently
 * stuck waiting on an interval it can never satisfy.
 */
export function isRunDue(nowMs: number, lastCompletedAtIso: string | null, intervalMs: number): boolean {
  if (lastCompletedAtIso === null) return true;
  const lastMs = Date.parse(lastCompletedAtIso);
  if (Number.isNaN(lastMs)) return true;
  return nowMs - lastMs >= intervalMs;
}

export type DaemonCycleOutcome = "completed" | "timed-out" | "spawn-error";

export interface DaemonLogEntry {
  startedAt: string; // ISO 8601
  finishedAt: string | null; // ISO 8601; null only if serialized before a cycle concluded
  outcome: DaemonCycleOutcome;
  detail?: string;
}

export const DAEMON_LOG_FILENAME = ".feature-inventor-daemon.log.jsonl";

export function serializeDaemonLogEntry(entry: DaemonLogEntry): string {
  return JSON.stringify(entry);
}

export function appendDaemonLogEntries(existingContent: string, entries: DaemonLogEntry[]): string {
  if (entries.length === 0) return existingContent;
  const newLines = entries.map(serializeDaemonLogEntry).join("\n");
  if (existingContent.length === 0) return newLines + "\n";
  const separator = existingContent.endsWith("\n") ? "" : "\n";
  return existingContent + separator + newLines + "\n";
}

export function parseDaemonLogEntries(content: string): DaemonLogEntry[] {
  const entries: DaemonLogEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isDaemonLogEntry(parsed)) entries.push(parsed);
  }
  return entries;
}

function isDaemonLogEntry(value: unknown): value is DaemonLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.startedAt !== "string") return false;
  if (candidate.finishedAt !== null && typeof candidate.finishedAt !== "string") return false;
  if (
    candidate.outcome !== "completed" &&
    candidate.outcome !== "timed-out" &&
    candidate.outcome !== "spawn-error"
  ) {
    return false;
  }
  if (candidate.detail !== undefined && typeof candidate.detail !== "string") return false;
  return true;
}

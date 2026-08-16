import { describe, expect, it } from "vitest";
import {
  appendDaemonLogEntries,
  extractSessionId,
  filterStaleNightlySessions,
  isRunDue,
  parseDaemonLogEntries,
  parseIntervalToMs,
  serializeDaemonLogEntry,
  summarizeDaemonHealth,
  type ClaudeAgentSummary,
  type DaemonLogEntry,
} from "./daemon.js";

const REPO_ROOT = "I:/Tal/Code/other/feature-inventor";

describe("filterStaleNightlySessions", () => {
  it("includes a blocked background session against this repo whose name mentions nightly", () => {
    const sessions: ClaudeAgentSummary[] = [
      {
        id: "abc12345",
        cwd: REPO_ROOT,
        kind: "background",
        name: "Run the feature-inventor nightly workflow: ...",
        status: "waiting",
        state: "blocked",
      },
    ];
    expect(filterStaleNightlySessions(sessions, REPO_ROOT)).toEqual(sessions);
  });

  it("excludes an actively busy/working session even if it matches name and cwd", () => {
    const sessions: ClaudeAgentSummary[] = [
      {
        id: "abc12345",
        cwd: REPO_ROOT,
        kind: "background",
        name: "invoke nightly.js workflow",
        status: "busy",
        state: "working",
      },
    ];
    expect(filterStaleNightlySessions(sessions, REPO_ROOT)).toEqual([]);
  });

  it("excludes an interactive session even if cwd and name would otherwise match", () => {
    const sessions: ClaudeAgentSummary[] = [
      { id: "abc12345", cwd: REPO_ROOT, kind: "interactive", name: "nightly workflow chat" },
    ];
    expect(filterStaleNightlySessions(sessions, REPO_ROOT)).toEqual([]);
  });

  it("excludes a background session against this repo whose name doesn't mention nightly (unrelated work)", () => {
    const sessions: ClaudeAgentSummary[] = [
      {
        id: "9b108494",
        cwd: REPO_ROOT,
        kind: "background",
        name: "Plan AI feature inventor system",
        status: "waiting",
        state: "blocked",
      },
    ];
    expect(filterStaleNightlySessions(sessions, REPO_ROOT)).toEqual([]);
  });

  it("excludes a matching session against a different repo", () => {
    const sessions: ClaudeAgentSummary[] = [
      {
        id: "abc12345",
        cwd: "I:/Tal/Code/other/working-hours-counter",
        kind: "background",
        name: "run nightly workflow",
        status: "idle",
        state: "blocked",
      },
    ];
    expect(filterStaleNightlySessions(sessions, REPO_ROOT)).toEqual([]);
  });

  it("normalizes drive-letter case and slash direction when comparing cwd", () => {
    const sessions: ClaudeAgentSummary[] = [
      {
        id: "abc12345",
        cwd: "i:\\Tal\\Code\\other\\feature-inventor",
        kind: "background",
        name: "run nightly workflow",
        status: "idle",
        state: "blocked",
      },
    ];
    expect(filterStaleNightlySessions(sessions, REPO_ROOT)).toHaveLength(1);
  });

  it("returns an empty array for an empty session list", () => {
    expect(filterStaleNightlySessions([], REPO_ROOT)).toEqual([]);
  });
});

describe("extractSessionId", () => {
  it("extracts the id from the observed 'backgrounded · <id>' format", () => {
    const output = "backgrounded · f845d101\n  claude agents             list sessions\n";
    expect(extractSessionId(output)).toBe("f845d101");
  });

  it("falls back to the 'claude stop <id>' line if 'backgrounded' isn't found", () => {
    const output = "some unexpected preamble\n  claude stop f845d101      stop this session\n";
    expect(extractSessionId(output)).toBe("f845d101");
  });

  it("returns null when neither pattern is present", () => {
    expect(extractSessionId("nothing recognizable here")).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(extractSessionId("")).toBeNull();
  });
});

describe("parseIntervalToMs", () => {
  it("parses seconds/minutes/hours/days", () => {
    expect(parseIntervalToMs("30s")).toBe(30_000);
    expect(parseIntervalToMs("15m")).toBe(15 * 60_000);
    expect(parseIntervalToMs("12h")).toBe(12 * 3_600_000);
    expect(parseIntervalToMs("2d")).toBe(2 * 86_400_000);
  });

  it("is case-insensitive on the unit and tolerates surrounding whitespace", () => {
    expect(parseIntervalToMs(" 1H ")).toBe(3_600_000);
  });

  it("accepts fractional values", () => {
    expect(parseIntervalToMs("1.5h")).toBe(1.5 * 3_600_000);
  });

  it("throws a clear error for an invalid spec", () => {
    expect(() => parseIntervalToMs("banana")).toThrow(/Invalid interval/);
    expect(() => parseIntervalToMs("12x")).toThrow(/Invalid interval/);
    expect(() => parseIntervalToMs("")).toThrow(/Invalid interval/);
  });
});

describe("isRunDue", () => {
  const oneHourMs = 3_600_000;

  it("is due immediately when no run has ever completed", () => {
    expect(isRunDue(Date.now(), null, oneHourMs)).toBe(true);
  });

  it("is not due when less than the interval has elapsed", () => {
    const now = Date.parse("2026-08-01T12:00:00.000Z");
    const last = "2026-08-01T11:30:00.000Z"; // 30 minutes ago
    expect(isRunDue(now, last, oneHourMs)).toBe(false);
  });

  it("is due once at least the interval has elapsed", () => {
    const now = Date.parse("2026-08-01T12:00:00.000Z");
    const last = "2026-08-01T11:00:00.000Z"; // exactly 1 hour ago
    expect(isRunDue(now, last, oneHourMs)).toBe(true);
  });

  it("treats intervalMs=0 as always due, even immediately after the last run -- continuous churn's default", () => {
    const now = Date.parse("2026-08-01T12:00:00.000Z");
    const oneMsAgo = "2026-08-01T11:59:59.999Z";
    expect(isRunDue(now, oneMsAgo, 0)).toBe(true);
    expect(isRunDue(now, new Date(now).toISOString(), 0)).toBe(true); // even the exact same instant isn't blocked
  });

  it("treats an unparseable timestamp as due rather than getting stuck", () => {
    const now = Date.now();
    expect(isRunDue(now, "not-a-real-timestamp", oneHourMs)).toBe(true);
  });
});

describe("summarizeDaemonHealth", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");

  it("reports no cycle data when the daemon log is absent or empty", () => {
    expect(summarizeDaemonHealth([], now)).toEqual({
      liveness: "no-cycle-data",
      lastCycle: null,
      recentCycles: [],
      lastCycleAgeMs: null,
      staleAfterMs: 2 * 60 * 60 * 1000,
    });
  });

  it("reports a recent running cycle as in-progress", () => {
    const running: DaemonLogEntry = {
      startedAt: "2026-08-01T11:55:00.000Z",
      finishedAt: null,
      outcome: "running",
    };

    const health = summarizeDaemonHealth([running], now);

    expect(health.liveness).toBe("in-progress");
    expect(health.lastCycle).toEqual(running);
    expect(health.lastCycleAgeMs).toBe(5 * 60_000);
  });

  it("reports an unclosed running cycle beyond its persisted timeout window as stale", () => {
    const stale: DaemonLogEntry = {
      startedAt: "2026-08-01T11:54:59.000Z",
      finishedAt: null,
      outcome: "running",
      staleAfterMs: 5 * 60_000,
    };

    const health = summarizeDaemonHealth([stale], now);

    expect(health.liveness).toBe("stale");
    expect(health.lastCycle).toEqual(stale);
    expect(health.staleAfterMs).toBe(5 * 60_000);
  });

  it("collapses a running record into its later terminal outcome for the same cycle", () => {
    const startedAt = "2026-08-01T11:00:00.000Z";
    const running: DaemonLogEntry = { startedAt, finishedAt: null, outcome: "running" };
    const completed: DaemonLogEntry = {
      startedAt,
      finishedAt: "2026-08-01T11:20:00.000Z",
      outcome: "completed",
    };

    const health = summarizeDaemonHealth([running, completed], now);

    expect(health.liveness).toBe("idle");
    expect(health.recentCycles).toEqual([completed]);
    expect(health.lastCycleAgeMs).toBe(40 * 60_000);
  });

  it("marks a running cycle with an invalid timestamp stale rather than implying it is healthy", () => {
    const health = summarizeDaemonHealth(
      [{ startedAt: "not-a-date", finishedAt: null, outcome: "running" }],
      now,
    );

    expect(health.liveness).toBe("stale");
    expect(health.lastCycleAgeMs).toBeNull();
  });
});

describe("daemon log serialize/append/parse", () => {
  const COMPLETED: DaemonLogEntry = {
    startedAt: "2026-08-01T10:00:00.000Z",
    finishedAt: "2026-08-01T10:20:00.000Z",
    outcome: "completed",
  };

  const TIMED_OUT: DaemonLogEntry = {
    startedAt: "2026-08-01T11:00:00.000Z",
    finishedAt: "2026-08-01T13:00:00.000Z",
    outcome: "timed-out",
    detail: "no completedAt update within the configured timeout",
  };

  it("round-trips entries through append/parse", () => {
    const content = appendDaemonLogEntries("", [COMPLETED, TIMED_OUT]);
    expect(parseDaemonLogEntries(content)).toEqual([COMPLETED, TIMED_OUT]);
  });

  it("produces one JSON object per line with no trailing newline from serializeDaemonLogEntry itself", () => {
    const line = serializeDaemonLogEntry(COMPLETED);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual(COMPLETED);
  });

  it("skips malformed lines rather than throwing", () => {
    const content = [serializeDaemonLogEntry(COMPLETED), "not valid json {{{", ""].join("\n");
    expect(parseDaemonLogEntries(content)).toEqual([COMPLETED]);
  });

  it("accepts a durable running record and skips an invalid outcome value", () => {
    const running = JSON.stringify({ startedAt: "2026-08-01T10:00:00.000Z", finishedAt: null, outcome: "running" });
    const bad = JSON.stringify({ startedAt: "2026-08-01T10:00:00.000Z", finishedAt: null, outcome: "in-progress" });
    expect(parseDaemonLogEntries(`${running}\n${bad}`)).toEqual([
      { startedAt: "2026-08-01T10:00:00.000Z", finishedAt: null, outcome: "running" },
    ]);
  });

  it("returns existing content unchanged when there are no new entries", () => {
    const existing = appendDaemonLogEntries("", [COMPLETED]);
    expect(appendDaemonLogEntries(existing, [])).toBe(existing);
  });
});

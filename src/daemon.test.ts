import { describe, expect, it } from "vitest";
import {
  appendDaemonLogEntries,
  isRunDue,
  parseDaemonLogEntries,
  parseIntervalToMs,
  serializeDaemonLogEntry,
  type DaemonLogEntry,
} from "./daemon.js";

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

  it("skips an entry with an invalid outcome value", () => {
    const bad = JSON.stringify({ startedAt: "2026-08-01T10:00:00.000Z", finishedAt: null, outcome: "in-progress" });
    expect(parseDaemonLogEntries(bad)).toEqual([]);
  });

  it("returns existing content unchanged when there are no new entries", () => {
    const existing = appendDaemonLogEntries("", [COMPLETED]);
    expect(appendDaemonLogEntries(existing, [])).toBe(existing);
  });
});

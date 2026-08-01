import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printStatus, runRecap, runStop } from "./cli.js";
import type { StatusData } from "./cli.js";
import { STOP_FLAG_FILENAME, parseStopFlag } from "./stop-flag.js";
import { RECAP_STATE_FILENAME, parseRecapState } from "./recap.js";

describe("printStatus", () => {
  let dir: string;
  let exitSpy: ReturnType<typeof spyOnExit>;
  let errorSpy: ReturnType<typeof spyOnConsoleError>;
  let logSpy: ReturnType<typeof spyOnConsoleLog>;

  function spyOnExit() {
    return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  }
  function spyOnConsoleError() {
    return vi.spyOn(console, "error").mockImplementation(() => {});
  }
  function spyOnConsoleLog() {
    return vi.spyOn(console, "log").mockImplementation(() => {});
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "feature-inventor-cli-test-"));
    errorSpy = spyOnConsoleError();
    logSpy = spyOnConsoleLog();
    exitSpy = spyOnExit();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("prints a clean one-line error and exits non-zero when ROADMAP.md is missing", () => {
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");

    expect(() => printStatus(dir)).toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0] as [string];
    expect(message).toContain("ROADMAP.md");
    expect(message).not.toContain("\n");
  });

  it("prints a clean one-line error and exits non-zero when CHANGELOG.md is missing", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );

    expect(() => printStatus(dir)).toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0] as [string];
    expect(message).toContain("CHANGELOG.md");
    expect(message).not.toContain("\n");
  });

  it("does not throw or exit when both files are present", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");

    expect(() => printStatus(dir)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it("shows a placeholder for recent feature attempts when feature-log.jsonl is absent", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");

    printStatus(dir);

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("Recent feature attempts:");
    expect(output).toContain("(none recorded yet");
  });

  it("prints recent feature attempts most-recent-first when feature-log.jsonl exists", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");
    writeFileSync(
      join(dir, "feature-log.jsonl"),
      [
        JSON.stringify({
          date: "2026-08-01",
          title: "First feature",
          ice: { impact: 6, confidence: 8, ease: 9, composite: 7.7 },
          status: "shipped",
          commitSha: "abc1234",
        }),
        JSON.stringify({
          date: "2026-08-02",
          title: "Second feature",
          ice: { impact: 3, confidence: 4, ease: 2, composite: 3 },
          status: "abandoned",
          reason: "too risky",
        }),
      ].join("\n") + "\n",
    );

    printStatus(dir);

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    const firstIndex = output.indexOf("Second feature");
    const secondIndex = output.indexOf("First feature");
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(output).toContain("[shipped] First feature — ICE 7.7 (abc1234)");
    expect(output).toContain("[abandoned] Second feature — ICE 3.0");
  });

  it("emits parseable JSON with the parsed status data when --json is passed", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );
    writeFileSync(
      join(dir, "CHANGELOG.md"),
      "# Changelog\n\n## 2026-08-01 — Something shipped\n- Notes\n",
    );
    writeFileSync(
      join(dir, "feature-log.jsonl"),
      JSON.stringify({
        date: "2026-08-01",
        title: "First feature",
        ice: { impact: 6, confidence: 8, ease: 9, composite: 7.7 },
        status: "shipped",
        commitSha: "abc1234",
      }) + "\n",
    );

    printStatus(dir, { json: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [output] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(output) as StatusData;

    expect(parsed.nowItems).toEqual(["Something — S/S — why"]);
    expect(parsed.recentShipped).toEqual(["2026-08-01 — Something shipped"]);
    expect(parsed.recentAttempts).toHaveLength(1);
    expect(parsed.recentAttempts[0]).toMatchObject({
      title: "First feature",
      status: "shipped",
      commitSha: "abc1234",
    });
  });

  it("does not print human-readable section headers when --json is passed", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");

    printStatus(dir, { json: true });

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).not.toContain("Feature Inventor — status");
    expect(output).not.toContain("Up next");
  });

  it("shows a pending stop request in text and JSON output", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");
    writeFileSync(
      join(dir, STOP_FLAG_FILENAME),
      JSON.stringify({ requestedAt: "2026-08-01T12:00:00.000Z" }),
    );

    printStatus(dir);
    const textOutput = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(textOutput).toContain("Stop requested at 2026-08-01T12:00:00.000Z");

    logSpy.mockClear();
    printStatus(dir, { json: true });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string) as StatusData;
    expect(parsed.stopRequestedAt).toBe("2026-08-01T12:00:00.000Z");
  });

  it("shows backlog counts for Next/Later/Horizon in text and JSON output", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n\n" +
        "## Next\n\n- [ ] A\n- [ ] B\n\n## Later\n\n- [ ] C\n\n## Horizon\n\n- [ ] D\n- [ ] E\n- [ ] F\n",
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");

    printStatus(dir);
    const textOutput = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(textOutput).toContain("Backlog: 2 in Next, 1 in Later, 3 in Horizon.");

    logSpy.mockClear();
    printStatus(dir, { json: true });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string) as StatusData;
    expect(parsed.backlogCounts).toEqual({ next: 2, later: 1, horizon: 3 });
  });

  it("omits the stop-request notice when no stop is pending", () => {
    writeFileSync(
      join(dir, "ROADMAP.md"),
      "# Roadmap\n\n## Now\n\n- [ ] Something — S/S — why\n",
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");

    printStatus(dir);

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).not.toContain("Stop requested");
  });
});

describe("runStop", () => {
  let dir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "feature-inventor-cli-stop-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes a stop-flag file with a timestamp when none is pending", () => {
    runStop(dir);

    const flagPath = join(dir, STOP_FLAG_FILENAME);
    expect(existsSync(flagPath)).toBe(true);
    const parsed = parseStopFlag(readFileSync(flagPath, "utf8"));
    expect(parsed).not.toBeNull();
    expect(typeof parsed?.requestedAt).toBe("string");

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("Stop requested.");
  });

  it("reports an already-pending request instead of overwriting it", () => {
    runStop(dir);
    const flagPath = join(dir, STOP_FLAG_FILENAME);
    const firstWrite = readFileSync(flagPath, "utf8");

    logSpy.mockClear();
    runStop(dir);

    expect(readFileSync(flagPath, "utf8")).toBe(firstWrite);
    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("already requested");
  });

  it("cancels a pending request", () => {
    runStop(dir);
    logSpy.mockClear();

    runStop(dir, { cancel: true });

    expect(existsSync(join(dir, STOP_FLAG_FILENAME))).toBe(false);
    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("cancelled");
  });

  it("cancelling when nothing is pending says so instead of erroring", () => {
    runStop(dir, { cancel: true });

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("No stop request was pending.");
  });
});

describe("runRecap", () => {
  let dir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "feature-inventor-cli-recap-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeLog(entries: Record<string, unknown>[]) {
    writeFileSync(join(dir, "feature-log.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }

  it("shows everything and reports nothing to show when there's no feature-log.jsonl", () => {
    runRecap(dir);
    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("Nothing to report");
  });

  it("defaults to 'all time' on a first-ever recap (no prior state file)", () => {
    writeLog([
      {
        date: "2026-08-01",
        title: "First feature",
        ice: { impact: 6, confidence: 8, ease: 9, composite: 7.7 },
        status: "shipped",
        commitSha: "abc1234",
      },
    ]);

    runRecap(dir);

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("all time");
    expect(output).toContain("First feature");
  });

  it("writes a recap-state file recording today's date unless --peek is passed", () => {
    writeLog([]);

    runRecap(dir);
    expect(existsSync(join(dir, RECAP_STATE_FILENAME))).toBe(true);

    rmSync(join(dir, RECAP_STATE_FILENAME));
    runRecap(dir, { peek: true });
    expect(existsSync(join(dir, RECAP_STATE_FILENAME))).toBe(false);
  });

  it("honors an explicit --since date over stored state", () => {
    writeLog([
      {
        date: "2026-07-01",
        title: "Old feature",
        ice: { impact: 5, confidence: 5, ease: 5, composite: 5 },
        status: "shipped",
        commitSha: "aaa1111",
      },
      {
        date: "2026-08-02",
        title: "New feature",
        ice: { impact: 5, confidence: 5, ease: 5, composite: 5 },
        status: "shipped",
        commitSha: "bbb2222",
      },
    ]);
    writeFileSync(join(dir, RECAP_STATE_FILENAME), JSON.stringify({ lastRecapAt: "2026-01-01" }));

    runRecap(dir, { since: "2026-08-02" });

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("since 2026-08-02");
    expect(output).toContain("New feature");
    expect(output).not.toContain("Old feature");
  });

  it("uses the stored lastRecapAt watermark when no flags are given", () => {
    writeLog([
      {
        date: "2020-01-01",
        title: "Old feature",
        ice: { impact: 5, confidence: 5, ease: 5, composite: 5 },
        status: "shipped",
        commitSha: "aaa1111",
      },
    ]);
    writeFileSync(join(dir, RECAP_STATE_FILENAME), JSON.stringify({ lastRecapAt: "2020-06-01" }));

    runRecap(dir);

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("since 2020-06-01");
    expect(output).not.toContain("Old feature");

    const newState = parseRecapState(readFileSync(join(dir, RECAP_STATE_FILENAME), "utf8"));
    expect(newState?.lastRecapAt).not.toBe("2020-06-01");
  });
});

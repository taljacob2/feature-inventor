import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printStatus } from "./cli.js";
import type { StatusData } from "./cli.js";

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
});

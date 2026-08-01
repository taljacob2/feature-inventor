import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printStatus } from "./cli.js";

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
});

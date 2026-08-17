import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../cli.js";

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createStatusRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "feature-inventor-cli-foundation-"));
  directories.push(directory);
  writeFileSync(directory + "/ROADMAP.md", "# Roadmap\n\n## Now\n\n- [ ] Improve orientation — S/S — why\n");
  writeFileSync(directory + "/CHANGELOG.md", "# Changelog\n\nNo entries yet.\n");
  return directory;
}

describe("runCli command foundation", () => {
  it("routes overview through the existing status data contract and honors --cwd plus JSON output", async () => {
    const directory = createStatusRepository();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["--cwd", directory, "overview", "--format", "json"], tmpdir());

    expect(log).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(log.mock.calls[0]![0] as string) as { nowItems: string[] };
    expect(parsed.nowItems).toEqual(["Improve orientation — S/S — why"]);
  });

  it("renders a compact human overview with a safe next step", async () => {
    const directory = createStatusRepository();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["overview"], directory);

    const output = String(log.mock.calls[0]![0]);
    expect(output).toContain("Feature Inventor | Overview");
    expect(output).toContain("NEXT SAFE STEP");
    expect(output).toContain("feature-inventor propose");
    expect(output).toContain("No runtime starts from this command.");
  });

  it("keeps status as a compatibility alias and renders focused help without runtime dispatch", async () => {
    const directory = createStatusRepository();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["status", "--json"], directory);
    await runCli(["help", "propose"], directory);

    const outputs = log.mock.calls.map(([value]) => String(value));
    expect(JSON.parse(outputs[0]!).nowItems).toEqual(["Improve orientation — S/S — why"]);
    expect(outputs[1]).toContain("Feature Inventor propose");
    expect(outputs[1]).toContain("It never starts an agent");
  });

  it("treats command-level help as help rather than invoking the command", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runCli(["run", "--help"]);
    expect(log.mock.calls[0]![0]).toContain("Feature Inventor run");
  });

  it("rejects TUI use from non-interactive or machine-readable command paths without opening raw terminal mode", async () => {
    await expect(runCli(["tui", "--non-interactive"])).rejects.toThrow("tui requires an interactive human terminal");
    await expect(runCli(["tui", "--format", "json"])).rejects.toThrow("tui requires an interactive human terminal");
    await expect(runCli(["tui", "unexpected"])).rejects.toThrow("Usage: feature-inventor tui");
  });
});

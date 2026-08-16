import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStatusData, runJournal, runRecap } from "./cli.js";
import { RUN_JOURNAL_FILENAME, appendRunJournalEvents, createRunJournalEvent } from "./run-journal.js";
import { RUNS_DIRECTORY } from "./run-proposal.js";

const RUN_ID = "run-20260817-001";

describe("governed run views", () => {
  const directories: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  function createRepository(): string {
    const directory = mkdtempSync(join(tmpdir(), "feature-inventor-governed-runs-"));
    directories.push(directory);
    writeFileSync(join(directory, "ROADMAP.md"), "## Now\n- [ ] Improve journals\n\n## Next\n- [ ] Improve recovery\n");
    writeFileSync(join(directory, "CHANGELOG.md"), "# Changelog\n\nNo entries yet.\n");
    const runDirectory = join(directory, RUNS_DIRECTORY, RUN_ID);
    mkdirSync(runDirectory, { recursive: true });
    const events = [
      createRunJournalEvent(RUN_ID, "planned", "2026-08-17T12:00:00.000Z"),
      createRunJournalEvent(RUN_ID, "workspace-prepared", "2026-08-17T12:00:01.000Z"),
      createRunJournalEvent(RUN_ID, "run-finalized", "2026-08-17T12:00:02.000Z"),
    ];
    writeFileSync(join(runDirectory, RUN_JOURNAL_FILENAME), appendRunJournalEvents("", events));
    return directory;
  }

  it("derives recent governed runs for status and recap JSON", () => {
    const directory = createRepository();
    expect(getStatusData(directory).governedRuns).toMatchObject([
      { runId: RUN_ID, status: "finalized", eventCount: 3, finalizedAt: "2026-08-17T12:00:02.000Z" },
    ]);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    runRecap(directory, { all: true, peek: true, json: true });
    const recap = JSON.parse(log.mock.calls[0]![0] as string) as { governedRuns: Array<{ runId: string; status: string }> };
    expect(recap.governedRuns).toEqual([{ runId: RUN_ID, status: "finalized", eventCount: 3, latestEvent: expect.any(Object), startedAt: "2026-08-17T12:00:00.000Z", finalizedAt: "2026-08-17T12:00:02.000Z" }]);
  });

  it("renders one journal without modifying the journal itself", () => {
    const directory = createRepository();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    runJournal(directory, [RUN_ID]);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      `Run journal: ${RUN_ID}`,
      "Status: finalized; 3 event(s)",
      "  2026-08-17T12:00:00.000Z planned",
      "  2026-08-17T12:00:01.000Z workspace-prepared",
      "  2026-08-17T12:00:02.000Z run-finalized",
    ]);
  });
});

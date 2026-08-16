import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runFinalize, runReview, runVerify } from "./cli.js";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { buildRunPlan } from "./run-plan.js";
import { RUN_PROPOSAL_FILENAME, RUNS_DIRECTORY, createRunProposal, serializeRunProposal } from "./run-proposal.js";
import { RUN_JOURNAL_FILENAME, appendRunJournalEvents, createRunJournalEvent, parseRunJournalEvents, summarizeRunJournal } from "./run-journal.js";
import { TASK_OUTCOME_FILENAME, createTaskOutcome, serializeTaskOutcome } from "./review-packet.js";
import type { TargetManifest } from "./target-manifest.js";

const roots: string[] = [];
const RUN_ID = "run-20260817-001";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "feature-inventor-review-"));
  roots.push(root);
  const runDirectory = join(root, RUNS_DIRECTORY, RUN_ID);
  mkdirSync(runDirectory, { recursive: true });
  const manifest: TargetManifest = {
    schemaVersion: 1,
    repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
    goals: ["Safe feature"],
    requiredChecks: ["npm test", "npm run build"],
    protectedPaths: [],
    reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: true },
    schedule: { mode: "manual" },
  };
  const proposal = createRunProposal({
    runId: RUN_ID,
    createdAt: "2026-08-17T00:00:00.000Z",
    baseCommit: "abcdef1234567",
    manifest,
    plan: buildRunPlan("# Roadmap\n\n## Now\n- [ ] Safe feature\n", DEFAULT_RUN_POLICY),
  });
  writeFileSync(join(runDirectory, RUN_PROPOSAL_FILENAME), serializeRunProposal(proposal));
  writeFileSync(
    join(runDirectory, RUN_JOURNAL_FILENAME),
    appendRunJournalEvents("", [
      createRunJournalEvent(RUN_ID, "planned", "2026-08-17T00:00:00.000Z"),
      createRunJournalEvent(RUN_ID, "task-created", "2026-08-17T00:00:01.000Z", { taskId: "task-1" }),
      createRunJournalEvent(RUN_ID, "task-completed", "2026-08-17T00:00:02.000Z", { taskId: "task-1", sourceEventId: "evt-stopped" }),
    ]),
  );
  writeFileSync(
    join(runDirectory, TASK_OUTCOME_FILENAME),
    serializeTaskOutcome(
      createTaskOutcome({
        runId: RUN_ID,
        taskId: "task-1",
        capturedAt: "2026-08-17T00:00:03.000Z",
        taskStatus: "stopped",
        statusEventId: "evt-stopped",
        observedAt: "2026-08-17T00:00:02.000Z",
        brief: "Complete",
        description: "Finished locally",
        assistantReport: "Feature and checks completed.",
        error: null,
      }),
    ),
  );
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("evidence-backed finalization", () => {
  it("requires evidence for every immutable proposal check and an explicit confirmation", () => {
    const root = makeRepo();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    runVerify(root, [RUN_ID, "--check", "npm test", "--passed", "--evidence", "157 tests passed"]);
    runReview(root, [RUN_ID]);
    expect(() => runFinalize(root, [RUN_ID, "--confirm"])).toThrow("not ready");

    runVerify(root, [RUN_ID, "--check", "npm run build", "--passed", "--evidence", "tsc exited 0"]);
    runReview(root, [RUN_ID]);
    expect(() => runFinalize(root, [RUN_ID])).toThrow("explicit --confirm");
    runFinalize(root, [RUN_ID, "--confirm"]);

    const journal = parseRunJournalEvents(readFileSync(join(root, RUNS_DIRECTORY, RUN_ID, RUN_JOURNAL_FILENAME), "utf8"));
    expect(summarizeRunJournal(RUN_ID, journal).status).toBe("finalized");
    expect(journal.map((event) => event.type)).toContain("review-packet-created");
  });

  it("rejects verification evidence for checks outside the proposal", () => {
    const root = makeRepo();
    expect(() => runVerify(root, [RUN_ID, "--check", "npm audit", "--passed", "--evidence", "clean"])).toThrow("not required");
  });
});

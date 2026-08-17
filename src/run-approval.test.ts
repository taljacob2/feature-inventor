import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runApprove } from "./cli.js";
import { launchGovernedRun } from "./core/governed-run-service.js";
import { type RunPolicy } from "./engine/contracts.js";
import { RUN_APPROVAL_FILENAME, assertRunApprovalMatchesProposal, createRunApproval, parseRunApproval, requiresHumanApproval } from "./run-approval.js";
import { RUN_JOURNAL_FILENAME, appendRunJournalEvents, createRunJournalEvent, parseRunJournalEvents } from "./run-journal.js";
import { RUN_PROPOSAL_FILENAME, RUNS_DIRECTORY, createRunProposal, serializeRunProposal, type RunProposal } from "./run-proposal.js";
import type { TargetManifest } from "./target-manifest.js";
import type { RuntimeAdapter } from "./runtimes/types.js";

const RUN_ID = "run-20260817-approval";
const BASE_COMMIT = "2e467c9d121477322574431b302bf7de850a96e7";

const policy: RunPolicy = {
  maxFeatures: 1,
  branchPrefix: "review",
  requireIsolatedWorktree: true,
  requireIndependentVerification: true,
  testCommands: ["npm test"],
  remotePushPolicy: "forbidden",
};

const manifest: TargetManifest = {
  schemaVersion: 1,
  repository: { url: "https://github.com/example/demo.git", defaultBranch: "main" },
  goals: ["Improve safely"],
  requiredChecks: ["npm test"],
  protectedPaths: [],
  reviewPolicy: { maxFilesChanged: 5, humanApprovalRequired: true },
  schedule: { mode: "manual" },
};

function proposal(): RunProposal {
  return createRunProposal({
    runId: RUN_ID,
    createdAt: "2026-08-17T12:00:00.000Z",
    baseCommit: BASE_COMMIT,
    manifest,
    plan: {
      status: "planned",
      runtime: "manus",
      policy,
      candidateSource: "Now",
      queue: [{ title: "Improve safety", description: "reviewed", source: "ROADMAP.md", impact: 5, confidence: 5, ease: 5, iceSource: "default" }],
      notAttempted: [],
    },
  });
}

const adapter: RuntimeAdapter = {
  id: "test-runtime",
  displayName: "Test Runtime",
  capabilities: { isolatedWorktree: true, structuredResult: true, passiveObservation: false },
  async preflight() {},
  async launch() {
    return { handle: { runtimeId: "test-runtime", kind: "local-worktree", id: "worktree-1", worktreePath: "/tmp/worktree", branchName: "review/test" } };
  },
};

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createRepositoryWithProposal(): string {
  const directory = mkdtempSync(join(tmpdir(), "feature-inventor-approval-"));
  directories.push(directory);
  const runDirectory = join(directory, RUNS_DIRECTORY, RUN_ID);
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(join(runDirectory, RUN_PROPOSAL_FILENAME), serializeRunProposal(proposal()), "utf8");
  writeFileSync(
    join(runDirectory, RUN_JOURNAL_FILENAME),
    appendRunJournalEvents("", [createRunJournalEvent(RUN_ID, "planned", "2026-08-17T12:00:00.000Z")]),
    "utf8",
  );
  return directory;
}

describe("proposal-bound human approval", () => {
  it("binds reviewer evidence to the immutable proposal identity and rejects drift", () => {
    const runProposal = proposal();
    const approval = createRunApproval({
      proposal: runProposal,
      reviewer: "maintainer@example.test",
      note: "Reviewed scope, risks, and required validation.",
      approvedAt: "2026-08-17T12:01:00.000Z",
    });

    expect(requiresHumanApproval(runProposal)).toBe(true);
    expect(parseRunApproval(JSON.stringify(approval))).toEqual(approval);
    expect(() => assertRunApprovalMatchesProposal({ ...approval, proposal: { ...approval.proposal, baseCommit: "deadbeef" } }, runProposal)).toThrow("base commit");
  });

  it("records one reviewer approval and its digest in the append-only journal", () => {
    const directory = createRepositoryWithProposal();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    runApprove(directory, [RUN_ID, "--reviewer", "maintainer@example.test", "--note", "Reviewed the proposal and risk boundary.", "--json"]);

    const result = JSON.parse(String(log.mock.calls[0]![0])) as { approvalPath: string; approval: { reviewer: string }; requiredBeforeLaunch: boolean };
    expect(result.approvalPath).toBe(join(directory, RUNS_DIRECTORY, RUN_ID, RUN_APPROVAL_FILENAME));
    expect(result.approval.reviewer).toBe("maintainer@example.test");
    expect(result.requiredBeforeLaunch).toBe(true);
    const events = parseRunJournalEvents(readFileSync(join(directory, RUNS_DIRECTORY, RUN_ID, RUN_JOURNAL_FILENAME), "utf8"));
    expect(events.at(-1)).toMatchObject({ type: "approval-recorded", payload: { reviewer: "maintainer@example.test", required: true } });
    expect(() => runApprove(directory, [RUN_ID, "--reviewer", "other@example.test", "--note", "Duplicate approval."])).toThrow("already recorded");
  });

  it("fails closed before any adapter launch until a matching approval is provided", async () => {
    const runProposal = proposal();
    await expect(launchGovernedRun({
      adapter,
      repoRoot: "/tmp/repository",
      proposal: runProposal,
      environment: { repositoryUrl: "https://github.com/example/demo.git", baseCommit: BASE_COMMIT },
    })).rejects.toThrow("Human approval is required");

    const approval = createRunApproval({
      proposal: runProposal,
      reviewer: "maintainer@example.test",
      note: "Reviewed the proposal and verification requirements.",
      approvedAt: "2026-08-17T12:01:00.000Z",
    });
    await expect(launchGovernedRun({
      adapter,
      repoRoot: "/tmp/repository",
      proposal: runProposal,
      approval,
      environment: { repositoryUrl: "https://github.com/example/demo.git", baseCommit: BASE_COMMIT },
    })).resolves.toMatchObject({ handle: { runtimeId: "test-runtime" } });
  });
});

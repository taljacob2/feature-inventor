import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareClaudeRun, runClaudeCodeProposal, type ClaudeProcessExecutor } from "./claude-runtime.js";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { buildRunPlan } from "./run-plan.js";
import { createRunProposal } from "./run-proposal.js";
import { serializeRuntimeResult } from "./runtime-result.js";
import type { TargetManifest } from "./target-manifest.js";

const roots: string[] = [];
const RUN_ID = "run-20260817-claude";
const BASE_COMMIT = "abcdef1234567";

function proposal() {
  const manifest: TargetManifest = {
    schemaVersion: 1,
    repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
    goals: ["Govern one Claude run"],
    requiredChecks: ["npm test", "npm run build"],
    protectedPaths: [],
    reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: true },
    schedule: { mode: "manual" },
  };
  return createRunProposal({
    runId: RUN_ID,
    createdAt: "2026-08-17T00:00:00.000Z",
    baseCommit: BASE_COMMIT,
    manifest,
    plan: buildRunPlan("# Roadmap\n\n## Now\n- [ ] Govern one Claude run\n", DEFAULT_RUN_POLICY),
  });
}

function repoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "feature-inventor-claude-"));
  roots.push(root);
  mkdirSync(join(root, ".feature-inventor", "runs", RUN_ID), { recursive: true });
  return root;
}

function runtimeResult(remotePushed = false) {
  return {
    schemaVersion: 1 as const,
    runId: RUN_ID,
    approvedBaseCommit: BASE_COMMIT,
    checkedOutCommit: BASE_COMMIT,
    worktreePath: "/tmp/isolated-worktree",
    branchName: `nightly/${RUN_ID}`,
    candidateTitle: "Govern one Claude run",
    candidateOutcome: "shipped" as const,
    candidateSummary: "Implemented in an isolated worktree",
    commitSha: "1234567abcdef",
    verification: [
      { command: "npm test", outcome: "passed" as const, summary: "tests passed" },
      { command: "npm run build", outcome: "passed" as const, summary: "build passed" },
    ],
    patchSummary: "2 files changed",
    remotePushed,
    remoteReviewUrl: remotePushed ? "https://example.test/review/1" : null,
    blockers: [],
  };
}

function executor(onClaude: (cwd: string) => void): ClaudeProcessExecutor {
  return {
    async run(command, args, options) {
      if (command === "git" && args[0] === "rev-parse") return { exitCode: 0, stdout: `${BASE_COMMIT}\n`, stderr: "" };
      if (command === "git" && args[0] === "worktree") return { exitCode: 0, stdout: "prepared", stderr: "" };
      if (command === "claude") {
        onClaude(options.cwd);
        return { exitCode: 0, stdout: "completed", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: `unexpected command ${command}` };
    },
  };
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Claude governed runtime adapter", () => {
  it("prepares a proposal-pinned isolated worktree contract without permission bypasses", () => {
    const root = repoRoot();
    const prepared = prepareClaudeRun({ repoRoot: root, proposal: proposal() });
    expect(prepared.branchName).toBe(`nightly/${RUN_ID}`);
    expect(prepared.worktreePath).toContain(`.feature-inventor/worktrees/${RUN_ID}`);
    expect(prepared.prompt).toContain(`Approved base commit: ${BASE_COMMIT}`);
    expect(prepared.prompt).toContain("Never run git push");
    expect(prepared.prompt).toContain("Runtime Result Manifest");
  });

  it("records a valid local-only structured result after creating the worktree", async () => {
    const root = repoRoot();
    const run = proposal();
    const prepared = prepareClaudeRun({ repoRoot: root, proposal: run });
    let callbackPath: string | null = null;
    const outcome = await runClaudeCodeProposal(
      { repoRoot: root, proposal: run },
      executor(() => writeFileSync(prepared.runtimeResultPath, serializeRuntimeResult({ ...runtimeResult(), worktreePath: prepared.worktreePath, branchName: prepared.branchName }), "utf8")),
      { onWorktreePrepared: (value) => { callbackPath = value.worktreePath; } },
    );
    expect(callbackPath).toBe(prepared.worktreePath);
    expect(outcome.error).toBeNull();
    expect(outcome.runtimeResult).toMatchObject({ runId: RUN_ID, remotePushed: false });
  });

  it("fails closed when the runtime result reports a remote effect", async () => {
    const root = repoRoot();
    const run = proposal();
    const prepared = prepareClaudeRun({ repoRoot: root, proposal: run });
    const outcome = await runClaudeCodeProposal(
      { repoRoot: root, proposal: run },
      executor(() => writeFileSync(prepared.runtimeResultPath, serializeRuntimeResult({ ...runtimeResult(true), worktreePath: prepared.worktreePath, branchName: prepared.branchName }), "utf8")),
    );
    expect(outcome.runtimeResult).not.toBeNull();
    expect(outcome.error).toContain("remote push");
  });
});

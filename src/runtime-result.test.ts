import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { buildRunPlan } from "./run-plan.js";
import { createRunProposal } from "./run-proposal.js";
import {
  assertRuntimeResultMatchesProposal,
  buildRuntimeResultStructuredOutputSchema,
  deriveVerificationEvidence,
  parseRuntimeResult,
} from "./runtime-result.js";
import type { TargetManifest } from "./target-manifest.js";

const MANIFEST: TargetManifest = {
  schemaVersion: 1,
  repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
  goals: ["Safe change"],
  requiredChecks: ["npm test", "npm run build"],
  protectedPaths: [],
  reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: true },
  schedule: { mode: "manual" },
};

function proposal() {
  return createRunProposal({
    runId: "run-20260817-001",
    createdAt: "2026-08-17T00:00:00.000Z",
    baseCommit: "abcdef1234567",
    manifest: MANIFEST,
    plan: buildRunPlan("# Roadmap\n\n## Now\n- [ ] Safe change\n", DEFAULT_RUN_POLICY),
  });
}

function rawResult(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runId: "run-20260817-001",
    approvedBaseCommit: "abcdef1234567",
    checkedOutCommit: "abcdef1234567",
    worktreePath: "/tmp/worktree",
    branchName: "nightly/manus-run-1",
    candidateTitle: "Safe change",
    candidateOutcome: "shipped",
    candidateSummary: "Implemented safely",
    commitSha: "1234567abcdef",
    verification: [
      { command: "npm test", outcome: "passed", summary: "162 tests passed" },
      { command: "npm run build", outcome: "passed", summary: "tsc exited 0" },
      { command: "npm audit", outcome: "not-run", summary: "Not a required check" },
    ],
    patchSummary: "2 files changed",
    remotePushed: false,
    remoteReviewUrl: null,
    blockers: [],
    ...overrides,
  };
}

describe("runtime result manifest", () => {
  it("parses a strict result and derives evidence only for the immutable proposal checks", () => {
    const result = parseRuntimeResult(rawResult());
    const approved = proposal();
    assertRuntimeResultMatchesProposal(result, approved);
    expect(deriveVerificationEvidence(result, approved, "2026-08-17T00:01:00.000Z")).toEqual([
      { check: "npm test", outcome: "passed", recordedAt: "2026-08-17T00:01:00.000Z", evidence: "Runtime result: 162 tests passed" },
      { check: "npm run build", outcome: "passed", recordedAt: "2026-08-17T00:01:00.000Z", evidence: "Runtime result: tsc exited 0" },
    ]);
  });

  it("rejects default-branch results, wrong base commits, and unauthorized remote pushes", () => {
    expect(() => parseRuntimeResult(rawResult({ branchName: "main" }))).toThrow("must not be main or master");
    expect(() => assertRuntimeResultMatchesProposal(parseRuntimeResult(rawResult({ checkedOutCommit: "1234567abcdef" })), proposal())).toThrow(
      "approved proposal base commit",
    );
    expect(() => assertRuntimeResultMatchesProposal(parseRuntimeResult(rawResult({ remotePushed: true, remoteReviewUrl: "https://example.test/pr/1" })), proposal())).toThrow(
      "forbidden by the proposal policy",
    );
  });

  it("builds a strict structured-output schema with all root fields required", () => {
    const schema = buildRuntimeResultStructuredOutputSchema() as { required: string[]; additionalProperties: boolean };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("verification");
    expect(schema.required).toContain("remotePushed");
  });
});

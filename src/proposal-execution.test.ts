import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { assertProposalMatchesEnvironment } from "./proposal-execution.js";
import { createRunProposal } from "./run-proposal.js";
import { buildRunPlan } from "./run-plan.js";
import type { TargetManifest } from "./target-manifest.js";

const MANIFEST: TargetManifest = {
  schemaVersion: 1,
  repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
  goals: ["Improve reliability"],
  requiredChecks: ["npm test"],
  protectedPaths: [],
  reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: true },
  schedule: { mode: "manual" },
};

function proposal() {
  return createRunProposal({
    runId: "run-20260817-001",
    createdAt: "2026-08-17T12:00:00.000Z",
    baseCommit: "abcdef1234567",
    manifest: MANIFEST,
    plan: buildRunPlan("# Roadmap\n\n## Now\n- [ ] Improve reliability\n", DEFAULT_RUN_POLICY),
  });
}

describe("proposal execution environment", () => {
  it("accepts equivalent GitHub URL forms and the approved commit", () => {
    expect(() =>
      assertProposalMatchesEnvironment(proposal(), {
        repositoryUrl: "https://github.com/example/project",
        baseCommit: "abcdef1234567",
      }),
    ).not.toThrow();
  });

  it("rejects a different origin or a moved configured branch", () => {
    expect(() =>
      assertProposalMatchesEnvironment(proposal(), {
        repositoryUrl: "https://github.com/example/other.git",
        baseCommit: "abcdef1234567",
      }),
    ).toThrow("does not match current origin");
    expect(() =>
      assertProposalMatchesEnvironment(proposal(), {
        repositoryUrl: "https://github.com/example/project.git",
        baseCommit: "0123456789abc",
      }),
    ).toThrow("does not match configured branch commit");
  });
});

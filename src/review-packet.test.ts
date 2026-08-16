import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { createRunProposal } from "./run-proposal.js";
import { buildRunPlan } from "./run-plan.js";
import { createReviewPacket, createTaskOutcome } from "./review-packet.js";
import type { TargetManifest } from "./target-manifest.js";

const MANIFEST: TargetManifest = {
  schemaVersion: 1,
  repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
  goals: ["Ship safely"],
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
    plan: buildRunPlan("# Roadmap\n\n## Now\n- [ ] Ship safely\n", DEFAULT_RUN_POLICY),
  });
}

function stoppedOutcome() {
  return createTaskOutcome({
    runId: "run-20260817-001",
    taskId: "task-1",
    capturedAt: "2026-08-17T00:01:00.000Z",
    taskStatus: "stopped",
    statusEventId: "evt-stopped",
    observedAt: "2026-08-17T00:00:30.000Z",
    brief: "Complete",
    description: "Task stopped",
    assistantReport: "Implemented and tested.",
    error: null,
  });
}

describe("review packet", () => {
  it("is ready only when a stopped task outcome, captured runtime artifact, and all required passing checks are present", () => {
    const packet = createReviewPacket(proposal(), "2026-08-17T00:02:00.000Z", stoppedOutcome(), [
      { check: "npm test", outcome: "passed", recordedAt: "2026-08-17T00:01:30.000Z", evidence: "157 tests passed" },
      { check: "npm run build", outcome: "passed", recordedAt: "2026-08-17T00:01:40.000Z", evidence: "tsc exited 0" },
    ], true);
    expect(packet).toMatchObject({ readiness: "ready-to-finalize", missingChecks: [], failedChecks: [] });
  });

  it("stays pending when outcome or required checks are absent and blocks failed evidence", () => {
    const pending = createReviewPacket(proposal(), "2026-08-17T00:02:00.000Z", null, []);
    expect(pending).toMatchObject({ readiness: "pending", missingChecks: ["npm test", "npm run build"] });

    const blocked = createReviewPacket(proposal(), "2026-08-17T00:02:00.000Z", stoppedOutcome(), [
      { check: "npm test", outcome: "failed", recordedAt: "2026-08-17T00:01:30.000Z", evidence: "one test failed" },
      { check: "npm run build", outcome: "passed", recordedAt: "2026-08-17T00:01:40.000Z", evidence: "tsc exited 0" },
    ], true);
    expect(blocked).toMatchObject({ readiness: "blocked", failedChecks: ["npm test"] });
  });

  it("rejects evidence for a check outside the immutable proposal", () => {
    expect(() =>
      createReviewPacket(proposal(), "2026-08-17T00:02:00.000Z", stoppedOutcome(), [
        { check: "npm audit", outcome: "passed", recordedAt: "2026-08-17T00:01:30.000Z", evidence: "no advisories" },
      ]),
    ).toThrow("not required by proposal");
  });
});

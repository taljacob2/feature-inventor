import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { createRunProposal, type ContextPackReference } from "./run-proposal.js";
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

const CONTEXT_PACK: ContextPackReference = {
  schemaVersion: 1,
  id: "context-0123456789abcdef",
  targetCommit: "abcdef1234567",
  jsonPath: ".feature-inventor/index/v1/abcdef1234567/context/context-0123456789abcdef.json",
  markdownPath: ".feature-inventor/index/v1/abcdef1234567/context/context-0123456789abcdef.md",
  contentHash: "a".repeat(64),
  indexSchemaVersion: 1,
  snapshotConfigDigest: `sha256:${"b".repeat(64)}`,
  selector: { kind: "feature", value: "governed-run" },
  packKind: "change",
  effectiveMaxEstimatedTokens: 4000,
  estimatedTokens: 2500,
};

function proposal(contextPack?: ContextPackReference) {
  return createRunProposal({
    runId: "run-20260817-001",
    createdAt: "2026-08-17T00:00:00.000Z",
    baseCommit: "abcdef1234567",
    manifest: MANIFEST,
    plan: buildRunPlan("# Roadmap\n\n## Now\n- [ ] Ship safely\n", DEFAULT_RUN_POLICY),
    contextPack,
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

  it("surfaces optional context provenance without changing readiness", () => {
    const packet = createReviewPacket(proposal(CONTEXT_PACK), "2026-08-17T00:02:00.000Z", stoppedOutcome(), [
      { check: "npm test", outcome: "passed", recordedAt: "2026-08-17T00:01:30.000Z", evidence: "tests passed" },
      { check: "npm run build", outcome: "passed", recordedAt: "2026-08-17T00:01:40.000Z", evidence: "build passed" },
    ], true);
    expect(packet.proposal.contextPack).toEqual(CONTEXT_PACK);
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

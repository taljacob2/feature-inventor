import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { buildRunPlan } from "./run-plan.js";
import { createRunProposal } from "./run-proposal.js";
import {
  assertScheduleHandoffMatchesProposal,
  createScheduleHandoff,
  parseScheduleHandoff,
  serializeScheduleHandoff,
} from "./schedule-handoff.js";
import type { TargetManifest } from "./target-manifest.js";

const manifest: TargetManifest = {
  schemaVersion: 1,
  repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
  goals: ["Govern schedule handoffs"],
  requiredChecks: ["npm test"],
  protectedPaths: [],
  reviewPolicy: { maxFilesChanged: 10, humanApprovalRequired: true },
  schedule: { mode: "manual" },
};

function proposal() {
  return createRunProposal({
    runId: "run-20260817-scheduler",
    createdAt: "2026-08-17T00:00:00.000Z",
    baseCommit: "abcdef1234567",
    manifest,
    plan: buildRunPlan("# Roadmap\n\n## Now\n- [ ] Govern schedule handoffs\n", DEFAULT_RUN_POLICY),
  });
}

describe("schedule handoff", () => {
  it("creates a non-executing Claude handoff pinned to the immutable proposal", () => {
    const handoff = createScheduleHandoff(proposal(), "claude", "2026-08-17T01:00:00.000Z");
    expect(handoff.command).toBe("feature-inventor claude run --run run-20260817-scheduler");
    expect(handoff.executionMode).toBe("manual-external-trigger");
    expect(handoff.notes).toContain("does not schedule or execute");
    expect(parseScheduleHandoff(serializeScheduleHandoff(handoff))).toEqual(handoff);
  });

  it("rejects a handoff whose command has been broadened into arbitrary shell input", () => {
    const handoff = createScheduleHandoff(proposal(), "manus", "2026-08-17T01:00:00.000Z");
    const forged = { ...handoff, command: "feature-inventor manus run --run run-20260817-scheduler; git push" };
    expect(() => parseScheduleHandoff(JSON.stringify(forged))).toThrow(/command does not match/);
  });

  it("rejects a valid-looking handoff that points to a different immutable proposal", () => {
    const handoff = createScheduleHandoff(proposal(), "claude", "2026-08-17T01:00:00.000Z");
    expect(() => assertScheduleHandoffMatchesProposal({ ...handoff, proposal: { ...handoff.proposal, baseCommit: "1234567abcdef" } }, proposal())).toThrow(/does not match/);
  });
});

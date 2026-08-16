import { createHash } from "node:crypto";
import type { RunPlanData } from "./run-plan.js";
import type { RunPolicy } from "./engine/contracts.js";
import type { TargetManifest } from "./target-manifest.js";

export const RUNS_DIRECTORY = ".feature-inventor/runs";
export const RUN_PROPOSAL_FILENAME = "proposal.json";

export interface RunProposal {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  target: {
    repositoryUrl: string;
    defaultBranch: string;
    baseCommit: string;
  };
  manifestHash: string;
  policyHash: string;
  policy: RunPolicy;
  goals: string[];
  requiredChecks: string[];
  queue: RunPlanData["queue"];
  notAttempted: RunPlanData["notAttempted"];
  remotePushPolicy: RunPolicy["remotePushPolicy"];
}

export interface CreateRunProposalInput {
  runId: string;
  createdAt: string;
  baseCommit: string;
  manifest: TargetManifest;
  plan: RunPlanData;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function createRunId(now: Date, baseCommit: string): string {
  assertCommit(baseCommit);
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .toLowerCase();
  return `run-${timestamp}-${baseCommit.slice(0, 7).toLowerCase()}`;
}

function assertRunId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) {
    throw new Error("runId must be 3-64 lowercase letters, digits, or hyphens and start with a letter or digit");
  }
}

function assertCommit(value: string): void {
  if (!/^[0-9a-f]{7,64}$/i.test(value)) throw new Error("baseCommit must be a Git commit SHA");
}

/**
 * Captures the immutable planning inputs needed to reproduce a governed run.
 * The proposal stores full policy and queue data alongside their hashes so a
 * reviewer can inspect both the evidence and its stable identity.
 */
export function createRunProposal(input: CreateRunProposalInput): RunProposal {
  assertRunId(input.runId);
  assertCommit(input.baseCommit);

  const policy = {
    ...input.plan.policy,
    testCommands: [...input.plan.policy.testCommands],
  };
  const manifestHash = sha256(stableJson(input.manifest));
  const policyHash = sha256(stableJson(policy));

  return {
    schemaVersion: 1,
    runId: input.runId,
    createdAt: input.createdAt,
    target: {
      repositoryUrl: input.manifest.repository.url,
      defaultBranch: input.manifest.repository.defaultBranch,
      baseCommit: input.baseCommit,
    },
    manifestHash,
    policyHash,
    policy,
    goals: [...input.manifest.goals],
    requiredChecks: [...input.manifest.requiredChecks],
    queue: input.plan.queue.map((candidate) => ({ ...candidate })),
    notAttempted: input.plan.notAttempted.map((candidate) => ({ ...candidate })),
    remotePushPolicy: input.plan.policy.remotePushPolicy,
  };
}

export function serializeRunProposal(proposal: RunProposal): string {
  return `${JSON.stringify(proposal, null, 2)}\n`;
}

export function parseRunProposal(content: string): RunProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid run proposal: ${reason}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid run proposal: expected object");
  const proposal = parsed as Partial<RunProposal>;
  if (proposal.schemaVersion !== 1) throw new Error("Invalid run proposal: schemaVersion must be 1");
  if (typeof proposal.runId !== "string") throw new Error("Invalid run proposal: runId is required");
  assertRunId(proposal.runId);
  if (!proposal.target || typeof proposal.target !== "object" || typeof proposal.target.baseCommit !== "string") {
    throw new Error("Invalid run proposal: target.baseCommit is required");
  }
  assertCommit(proposal.target.baseCommit);
  if (!proposal.policy || !Array.isArray(proposal.policy.testCommands)) throw new Error("Invalid run proposal: policy is required");
  if (!Array.isArray(proposal.queue) || !Array.isArray(proposal.notAttempted)) {
    throw new Error("Invalid run proposal: queue and notAttempted are required");
  }
  return proposal as RunProposal;
}

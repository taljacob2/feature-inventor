import { createHash } from "node:crypto";
import type { RunProposal } from "./run-proposal.js";

export const RUN_APPROVAL_FILENAME = "approval.json";

export interface RunApproval {
  schemaVersion: 1;
  runId: string;
  approvedAt: string;
  reviewer: string;
  note: string;
  proposal: {
    baseCommit: string;
    manifestHash: string;
    policyHash: string;
  };
}

export interface CreateRunApprovalInput {
  proposal: RunProposal;
  reviewer: string;
  note: string;
  approvedAt: string;
}

function assertNonEmptyString(value: unknown, label: string, maximumLength = 4_000): asserts value is string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximumLength) {
    throw new Error(`${label} must be a non-empty string no longer than ${maximumLength} characters`);
  }
}

function assertRunId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) {
    throw new Error("approval.runId must be a valid proposal run ID");
  }
}

function assertCommit(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{7,64}$/i.test(value)) {
    throw new Error("approval.proposal.baseCommit must be a Git commit SHA");
  }
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be a SHA-256 digest`);
}

/** True when manifest policy or risk policy requires an explicit human decision before execution. */
export function requiresHumanApproval(proposal: RunProposal): boolean {
  return proposal.humanApprovalRequired || proposal.riskVerification?.manualReviewRequired === true;
}

/** Creates one reviewer-attested record bound to the proposal's immutable execution identity. */
export function createRunApproval(input: CreateRunApprovalInput): RunApproval {
  assertNonEmptyString(input.reviewer, "reviewer", 200);
  assertNonEmptyString(input.note, "approval note");
  if (Number.isNaN(Date.parse(input.approvedAt))) throw new Error("approvedAt must be a valid ISO date");
  return {
    schemaVersion: 1,
    runId: input.proposal.runId,
    approvedAt: input.approvedAt,
    reviewer: input.reviewer.trim(),
    note: input.note.trim(),
    proposal: {
      baseCommit: input.proposal.target.baseCommit,
      manifestHash: input.proposal.manifestHash,
      policyHash: input.proposal.policyHash,
    },
  };
}

/** Returns a stable digest recorded in the append-only journal beside the approval event. */
export function approvalDigest(approval: RunApproval): string {
  return createHash("sha256").update(JSON.stringify(approval)).digest("hex");
}

export function assertRunApprovalMatchesProposal(approval: RunApproval, proposal: RunProposal): void {
  if (approval.runId !== proposal.runId) throw new Error("Approval run ID does not match proposal");
  if (approval.proposal.baseCommit !== proposal.target.baseCommit) throw new Error("Approval base commit does not match proposal");
  if (approval.proposal.manifestHash !== proposal.manifestHash) throw new Error("Approval manifest hash does not match proposal");
  if (approval.proposal.policyHash !== proposal.policyHash) throw new Error("Approval policy hash does not match proposal");
}

export function serializeRunApproval(approval: RunApproval): string {
  return `${JSON.stringify(approval, null, 2)}\n`;
}

/** Parses and validates stored reviewer evidence before it can authorize a runtime launch. */
export function parseRunApproval(content: string): RunApproval {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid run approval: ${reason}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid run approval: expected object");
  const approval = parsed as Partial<RunApproval>;
  if (approval.schemaVersion !== 1) throw new Error("Invalid run approval: schemaVersion must be 1");
  assertRunId(approval.runId);
  assertNonEmptyString(approval.approvedAt, "approval.approvedAt", 100);
  if (Number.isNaN(Date.parse(approval.approvedAt))) throw new Error("approval.approvedAt must be a valid ISO date");
  assertNonEmptyString(approval.reviewer, "approval.reviewer", 200);
  assertNonEmptyString(approval.note, "approval.note");
  if (typeof approval.proposal !== "object" || approval.proposal === null || Array.isArray(approval.proposal)) {
    throw new Error("Invalid run approval: proposal identity is required");
  }
  assertCommit(approval.proposal.baseCommit);
  assertHash(approval.proposal.manifestHash, "approval.proposal.manifestHash");
  assertHash(approval.proposal.policyHash, "approval.proposal.policyHash");
  return approval as RunApproval;
}

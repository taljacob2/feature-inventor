import { createHash } from "node:crypto";
import type { RunPlanData } from "./run-plan.js";
import type { RunPolicy } from "./engine/contracts.js";
import type { TargetManifest } from "./target-manifest.js";
import type { RiskAwareVerificationDecision } from "./risk-verification-policy.js";

export const RUNS_DIRECTORY = ".feature-inventor/runs";
export const RUN_PROPOSAL_FILENAME = "proposal.json";

/**
 * Informational design-context provenance. It is deliberately not execution,
 * verification, approval, or source evidence, and it does not affect a run's
 * lifecycle or review readiness.
 */
export interface ContextPackReference {
  schemaVersion: 1;
  id: string;
  targetCommit: string;
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  indexSchemaVersion: 1;
  snapshotConfigDigest: string;
  selector: {
    kind: "feature" | "flow" | "path" | "command";
    value: string;
  };
  packKind: "orientation" | "change" | "verification" | "deep";
  effectiveMaxEstimatedTokens: number;
  estimatedTokens: number;
}

export interface RunProposal {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  target: {
    repositoryUrl: string;
    defaultBranch: string;
    baseCommit: string;
  };
  contextPack?: ContextPackReference;
  /** Deterministic policy record; does not authorize runtime execution. */
  riskVerification?: RiskAwareVerificationDecision;
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
  contextPack?: ContextPackReference;
  riskVerification?: RiskAwareVerificationDecision;
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

export function assertRiskAwareVerificationDecision(decision: RiskAwareVerificationDecision): void {
  if (decision.schemaVersion !== 1) throw new Error("riskVerification.schemaVersion must be 1");
  if (!Array.isArray(decision.operatorRequiredChecks) || !Array.isArray(decision.derivedRequiredChecks) || !Array.isArray(decision.requiredChecks)) {
    throw new Error("riskVerification must contain check arrays");
  }
  if (!Array.isArray(decision.classification.riskTags) || !Array.isArray(decision.classification.protectedPaths) || !Array.isArray(decision.classification.matchedFeatures)) {
    throw new Error("riskVerification.classification is incomplete");
  }
  if (!Array.isArray(decision.manualReviewReasons) || typeof decision.manualReviewRequired !== "boolean" || typeof decision.policyApplied !== "boolean") {
    throw new Error("riskVerification review expectations are invalid");
  }
  const unique = (values: string[]): boolean => values.every((value, index) => typeof value === "string" && value.trim() !== "" && values.indexOf(value) === index);
  if (!unique(decision.operatorRequiredChecks) || !unique(decision.derivedRequiredChecks) || !unique(decision.requiredChecks)) {
    throw new Error("riskVerification checks must be unique non-empty strings");
  }
  if (decision.derivedRequiredChecks.some((check) => decision.operatorRequiredChecks.includes(check))) {
    throw new Error("riskVerification derived checks must exclude operator-required checks");
  }
  if (JSON.stringify(decision.requiredChecks) !== JSON.stringify([...decision.operatorRequiredChecks, ...decision.derivedRequiredChecks])) {
    throw new Error("riskVerification required checks must preserve operator checks followed by derived checks");
  }
}

export function assertContextPackReference(reference: ContextPackReference): void {
  if (reference.schemaVersion !== 1) throw new Error("contextPack.schemaVersion must be 1");
  if (!/^context-[0-9a-f]{16}$/.test(reference.id)) throw new Error("contextPack.id must be a valid context pack ID");
  assertCommit(reference.targetCommit);
  const directory = `.feature-inventor/index/v1/${reference.targetCommit}/context/`;
  if (reference.jsonPath !== `${directory}${reference.id}.json`) throw new Error("contextPack.jsonPath must be the pack's repository-relative JSON artifact path");
  if (reference.markdownPath !== `${directory}${reference.id}.md`) throw new Error("contextPack.markdownPath must be the pack's repository-relative Markdown artifact path");
  if (!/^[0-9a-f]{64}$/.test(reference.contentHash)) throw new Error("contextPack.contentHash must be a SHA-256 digest");
  if (reference.indexSchemaVersion !== 1) throw new Error("contextPack.indexSchemaVersion must be 1");
  if (!/^sha256:[0-9a-f]{64}$/.test(reference.snapshotConfigDigest)) throw new Error("contextPack.snapshotConfigDigest must be a SHA-256 digest");
  if (!["feature", "flow", "path", "command"].includes(reference.selector.kind) || reference.selector.value.trim() === "") {
    throw new Error("contextPack.selector must record a valid explicit selector");
  }
  if (!["orientation", "change", "verification", "deep"].includes(reference.packKind)) {
    throw new Error("contextPack.packKind is invalid");
  }
  if (!Number.isInteger(reference.effectiveMaxEstimatedTokens) || reference.effectiveMaxEstimatedTokens < 1) {
    throw new Error("contextPack.effectiveMaxEstimatedTokens must be a positive integer");
  }
  if (!Number.isInteger(reference.estimatedTokens) || reference.estimatedTokens < 0 || reference.estimatedTokens > reference.effectiveMaxEstimatedTokens) {
    throw new Error("contextPack.estimatedTokens must be within the effective token budget");
  }
}

/**
 * Captures the immutable planning inputs needed to reproduce a governed run.
 * The proposal stores full policy and queue data alongside their hashes so a
 * reviewer can inspect both the evidence and its stable identity.
 */
export function createRunProposal(input: CreateRunProposalInput): RunProposal {
  assertRunId(input.runId);
  assertCommit(input.baseCommit);

  if (input.contextPack) {
    assertContextPackReference(input.contextPack);
    if (input.contextPack.targetCommit !== input.baseCommit) {
      throw new Error("contextPack.targetCommit must match the proposal baseCommit");
    }
  }
  if (input.riskVerification) {
    assertRiskAwareVerificationDecision(input.riskVerification);
    if (JSON.stringify(input.riskVerification.operatorRequiredChecks) !== JSON.stringify(input.manifest.requiredChecks)) {
      throw new Error("riskVerification operator-required checks must match the manifest");
    }
  }
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
    ...(input.contextPack ? { contextPack: structuredClone(input.contextPack) } : {}),
    ...(input.riskVerification ? { riskVerification: structuredClone(input.riskVerification) } : {}),
    manifestHash,
    policyHash,
    policy,
    goals: [...input.manifest.goals],
    requiredChecks: input.riskVerification ? [...input.riskVerification.requiredChecks] : [...input.manifest.requiredChecks],
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
  if (proposal.contextPack !== undefined) {
    if (typeof proposal.contextPack !== "object" || proposal.contextPack === null || Array.isArray(proposal.contextPack)) {
      throw new Error("Invalid run proposal: contextPack must be an object when present");
    }
    assertContextPackReference(proposal.contextPack as ContextPackReference);
    if (proposal.contextPack.targetCommit !== proposal.target.baseCommit) {
      throw new Error("Invalid run proposal: contextPack.targetCommit must match target.baseCommit");
    }
  }
  if (proposal.riskVerification !== undefined) {
    if (typeof proposal.riskVerification !== "object" || proposal.riskVerification === null || Array.isArray(proposal.riskVerification)) {
      throw new Error("Invalid run proposal: riskVerification must be an object when present");
    }
    assertRiskAwareVerificationDecision(proposal.riskVerification as RiskAwareVerificationDecision);
    if (JSON.stringify(proposal.requiredChecks) !== JSON.stringify(proposal.riskVerification.requiredChecks)) {
      throw new Error("Invalid run proposal: requiredChecks must match riskVerification.requiredChecks");
    }
  }
  if (!proposal.policy || !Array.isArray(proposal.policy.testCommands)) throw new Error("Invalid run proposal: policy is required");
  if (!Array.isArray(proposal.queue) || !Array.isArray(proposal.notAttempted)) {
    throw new Error("Invalid run proposal: queue and notAttempted are required");
  }
  return proposal as RunProposal;
}

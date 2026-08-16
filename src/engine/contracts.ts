import type { FeatureCollision, PrioritizableFeature } from "./prioritization.js";

/** Supported executors are adapters, not the source of product behavior. */
export type RuntimeKind = "claude-code" | "manus";

/**
 * Remote writes are deliberately distinct from local commits. An adapter must
 * refuse pushes unless this policy is explicitly set to `explicit-only` and
 * the caller separately requests that effect.
 */
export type RemotePushPolicy = "forbidden" | "explicit-only";

export interface RunPolicy {
  /** Maximum features that an executor may ship during one run. */
  maxFeatures: number;
  /** The prefix used for an isolated branch, e.g. `nightly/<run-id>`. */
  branchPrefix: string;
  /** Every run must use a dedicated worktree rather than the caller's checkout. */
  requireIsolatedWorktree: boolean;
  /** A second pass must inspect the diff and independently rerun checks. */
  requireIndependentVerification: boolean;
  /** Commands the workspace adapter must run before an attempt can ship. */
  testCommands: string[];
  /** Default remote-side-effect policy. */
  remotePushPolicy: RemotePushPolicy;
}

/**
 * Conservative defaults for a portable executor. One feature is enough to
 * validate a new runtime without recreating the previous daemon's continuous
 * churn behavior.
 */
export const DEFAULT_RUN_POLICY: RunPolicy = {
  maxFeatures: 1,
  branchPrefix: "nightly",
  requireIsolatedWorktree: true,
  requireIndependentVerification: true,
  testCommands: ["npm test", "npm run build"],
  remotePushPolicy: "forbidden",
};

export interface FeatureCandidate extends PrioritizableFeature {
  description: string;
  source: string;
  rationale?: string;
}

export interface RunRequest {
  /** Explicit target path; executors must never infer an unrelated repository. */
  repoRoot: string;
  /** The human or scheduler that requested this cycle. */
  requestedBy: string;
  runtime: RuntimeKind;
  policy: RunPolicy;
}

/** Agent-provided input after runtime-specific schema validation. */
export interface ResearchResult {
  candidateFeatures: FeatureCandidate[];
}

export interface PrioritizationResult {
  keptFeatures: FeatureCandidate[];
  collisionPairs: FeatureCollision[];
}

export type RunLifecycleStatus = "planned" | "started" | "finalized" | "failed";

export interface PlannedRun {
  status: "planned";
  runtime: RuntimeKind;
  policy: RunPolicy;
  queue: FeatureCandidate[];
  notAttempted: FeatureCandidate[];
}

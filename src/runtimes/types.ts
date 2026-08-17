import type { RunProposal } from "../run-proposal.js";
import type { RuntimeResult } from "../runtime-result.js";

/** Runtime IDs are registry-owned strings so third-party adapters do not require a core source-code union change. */
export type RuntimeId = string;

export interface RuntimeCapabilities {
  isolatedWorktree: boolean;
  asynchronousObservation: boolean;
  structuredResult: boolean;
  localRepositoryAccess: boolean;
  remoteEffects: "forbidden" | "explicit-only" | "unsupported";
}

export interface RuntimeEnvironment {
  repositoryUrl: string | null;
  baseCommit: string | null;
}

export interface RunHandle {
  runtimeId: RuntimeId;
  kind: "local-process" | "external-task";
  id: string;
  worktreePath?: string;
  branchName?: string;
  taskUrl?: string;
  metadata: Record<string, unknown>;
}

export type RuntimeState = "started" | "waiting" | "completed" | "failed" | "awaiting-review";

export interface RuntimeObservation {
  runtimeId: RuntimeId;
  handleId: string;
  state: RuntimeState;
  observedAt: string;
  sourceEventId: string | null;
  message: string | null;
  runtimeResult: RuntimeResult | null;
  metadata: Record<string, unknown>;
}

export interface RuntimeLaunchContext {
  repoRoot: string;
  proposal: RunProposal;
  environment: RuntimeEnvironment;
  allowRemotePush: boolean;
  options: Record<string, unknown>;
}

export interface RuntimeLaunchResult {
  handle: RunHandle;
  observation: RuntimeObservation | null;
}

export interface RuntimeObserveContext {
  repoRoot: string;
  proposal: RunProposal;
  handle: RunHandle;
  options: Record<string, unknown>;
}

/**
 * Provider adapters translate only provider mechanics. The core owns proposal
 * pinning, journal transitions, evidence, review packets, and finalization.
 */
export interface RuntimeAdapter {
  readonly id: RuntimeId;
  readonly displayName: string;
  readonly capabilities: RuntimeCapabilities;

  preflight(context: RuntimeLaunchContext): Promise<void>;
  launch(context: RuntimeLaunchContext): Promise<RuntimeLaunchResult>;
  observe?(context: RuntimeObserveContext): Promise<RuntimeObservation>;
}

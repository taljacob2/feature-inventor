import { assertProposalMatchesEnvironment } from "../proposal-execution.js";
import { assertRunApprovalMatchesProposal, requiresHumanApproval, type RunApproval } from "../run-approval.js";
import type { RunProposal } from "../run-proposal.js";
import type { RunEventType } from "../run-journal.js";
import type {
  RunHandle,
  RuntimeAdapter,
  RuntimeEnvironment,
  RuntimeLaunchContext,
  RuntimeLaunchResult,
  RuntimeObservation,
} from "../runtimes/types.js";

export interface LifecycleUpdate {
  type: RunEventType;
  payload: Record<string, unknown>;
}

export interface GovernedLaunchRequest {
  adapter: RuntimeAdapter;
  repoRoot: string;
  proposal: RunProposal;
  /** Required when proposal policy or risk policy requires explicit human approval. */
  approval?: RunApproval;
  environment: RuntimeEnvironment;
  allowRemotePush?: boolean;
  options?: Record<string, unknown>;
}

export interface GovernedLaunchResult {
  handle: RunHandle;
  launch: RuntimeLaunchResult;
  updates: LifecycleUpdate[];
}

function updateForObservation(observation: RuntimeObservation): LifecycleUpdate | null {
  const payload = {
    runtime: observation.runtimeId,
    handleId: observation.handleId,
    sourceEventId: observation.sourceEventId,
    message: observation.message,
    ...observation.metadata,
  };
  switch (observation.state) {
    case "started":
      return { type: "task-running", payload };
    case "waiting":
      return { type: "task-waiting", payload };
    case "completed":
      return { type: "task-completed", payload };
    case "failed":
      return { type: "run-failed", payload };
    case "awaiting-review":
      return { type: "task-completed", payload };
  }
}

/**
 * The only generic launch path. Providers translate execution mechanics; this
 * service verifies the immutable proposal and emits normalized lifecycle work.
 */
export async function launchGovernedRun(request: GovernedLaunchRequest): Promise<GovernedLaunchResult> {
  const { adapter, proposal, environment } = request;
  if (proposal.queue.length === 0) throw new Error("No queued candidate is available in the selected proposal");
  if (!adapter.capabilities.structuredResult) throw new Error(`Runtime ${adapter.id} cannot provide a structured runtime result`);
  if (proposal.policy.requireIsolatedWorktree && !adapter.capabilities.isolatedWorktree) {
    throw new Error(`Runtime ${adapter.id} cannot satisfy the required isolated-worktree policy`);
  }
  if (environment.repositoryUrl === null || environment.baseCommit === null) {
    throw new Error("Could not resolve the local Git origin and configured default-branch commit");
  }
  assertProposalMatchesEnvironment(proposal, { repositoryUrl: environment.repositoryUrl, baseCommit: environment.baseCommit });
  if (requiresHumanApproval(proposal)) {
    if (!request.approval) {
      throw new Error(`Human approval is required before launching ${proposal.runId}; run \`feature-inventor approve ${proposal.runId} --reviewer NAME --note TEXT\` after reviewing the proposal.`);
    }
    assertRunApprovalMatchesProposal(request.approval, proposal);
  }

  const context: RuntimeLaunchContext = {
    repoRoot: request.repoRoot,
    proposal,
    environment,
    allowRemotePush: request.allowRemotePush === true,
    options: request.options ?? {},
  };
  await adapter.preflight(context);
  const launch = await adapter.launch(context);
  const updates: LifecycleUpdate[] = [];
  if (launch.handle.kind === "external-task") {
    updates.push({
      type: "task-created",
      payload: {
        runtime: adapter.id,
        handleId: launch.handle.id,
        taskId: launch.handle.id,
        taskUrl: launch.handle.taskUrl ?? null,
        ...launch.handle.metadata,
      },
    });
  } else {
    updates.push({
      type: "workspace-prepared",
      payload: {
        runtime: adapter.id,
        handleId: launch.handle.id,
        worktreePath: launch.handle.worktreePath ?? null,
        branchName: launch.handle.branchName ?? null,
        ...launch.handle.metadata,
      },
    });
    updates.push({ type: "candidate-started", payload: { runtime: adapter.id, approvedQueue: proposal.queue.map((item) => item.title) } });
  }
  if (launch.observation) {
    const update = updateForObservation(launch.observation);
    if (update) updates.push(update);
  }
  return { handle: launch.handle, launch, updates };
}

export function normalizeObservation(observation: RuntimeObservation): LifecycleUpdate | null {
  return updateForObservation(observation);
}

export interface GovernedObservationRequest {
  adapter: RuntimeAdapter;
  repoRoot: string;
  proposal: RunProposal;
  handle: RunHandle;
  options?: Record<string, unknown>;
}

/** Performs one passive provider observation and returns a normalized lifecycle update. */
export async function observeGovernedRun(request: GovernedObservationRequest): Promise<{ observation: RuntimeObservation; update: LifecycleUpdate | null }> {
  if (request.handle.runtimeId !== request.adapter.id) {
    throw new Error(`Run handle runtime ${request.handle.runtimeId} does not match adapter ${request.adapter.id}`);
  }
  if (!request.adapter.observe) throw new Error(`Runtime ${request.adapter.id} does not support passive observation`);
  const observation = await request.adapter.observe({
    repoRoot: request.repoRoot,
    proposal: request.proposal,
    handle: request.handle,
    options: request.options ?? {},
  });
  return { observation, update: updateForObservation(observation) };
}

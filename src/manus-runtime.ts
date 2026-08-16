import type { RunProposal } from "./run-proposal.js";
import { buildRuntimeResultStructuredOutputSchema } from "./runtime-result.js";

const MANUS_TASK_CREATE_URL = "https://api.manus.ai/v2/task.create";

export type ManusAgentProfile = "manus-1.6" | "manus-1.6-lite" | "manus-1.6-max";

export interface ManusRunTaskRequest {
  apiKey: string;
  /** The checked local origin, verified against proposal.target before this adapter is called. */
  repoUrl: string;
  proposal: RunProposal;
  /** Required in addition to `remotePushPolicy: explicit-only` before a task may push. */
  allowRemotePush?: boolean;
  projectId?: string;
  githubConnectorId?: string;
  agentProfile?: ManusAgentProfile;
  fetchImpl?: typeof fetch;
}

export interface ManusRunTask {
  taskId: string;
  taskUrl: string;
  taskTitle: string;
}

interface ManusApiFailure {
  ok?: false;
  error?: { code?: string; message?: string };
  message?: string;
}

interface ManusApiSuccess {
  ok: true;
  task_id: string;
  task_url: string;
  task_title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSuccess(value: unknown): value is ManusApiSuccess {
  return (
    isRecord(value) &&
    value.ok === true &&
    typeof value.task_id === "string" &&
    typeof value.task_url === "string" &&
    typeof value.task_title === "string"
  );
}

function apiFailureMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  const typed = value as ManusApiFailure;
  if (typed.error?.message) return typed.error.message;
  if (typed.message) return typed.message;
  return fallback;
}

function permitsRemotePush(request: ManusRunTaskRequest): boolean {
  return request.proposal.remotePushPolicy === "explicit-only" && request.allowRemotePush === true;
}

/**
 * Produces the self-contained operational brief for one immutable proposal.
 * The task receives the run ID and approved base commit in addition to the
 * queue and policy, so it cannot silently substitute the latest default
 * branch for the operator-reviewed repository state.
 */
export function buildManusRunPrompt(request: ManusRunTaskRequest): string {
  const remotePushAllowed = permitsRemotePush(request);
  const { proposal } = request;
  const queued = proposal.queue.map((candidate, index) => ({
    priority: index + 1,
    title: candidate.title,
    description: candidate.description,
    ice: {
      impact: candidate.impact,
      confidence: candidate.confidence,
      ease: candidate.ease,
      source: candidate.iceSource,
    },
  }));
  const branchName = `${proposal.policy.branchPrefix}/manus-${proposal.runId}`;

  return `You are the Manus execution adapter for Feature Inventor. Execute exactly one governed, auditable proposal.\n\n` +
    `Run ID: ${proposal.runId}\n` +
    `Repository remote: ${request.repoUrl}\n` +
    `Approved default branch: ${proposal.target.defaultBranch}\n` +
    `Approved base commit (authoritative): ${proposal.target.baseCommit}\n` +
    `Proposal policy hash: ${proposal.policyHash}\n` +
    `Proposal manifest hash: ${proposal.manifestHash}\n` +
    `Operator goals: ${JSON.stringify(proposal.goals)}\n\n` +
    `Runtime policy (authoritative):\n${JSON.stringify(proposal.policy, null, 2)}\n\n` +
    `Planned candidate queue (authoritative; do not invent additional feature work):\n${JSON.stringify(queued, null, 2)}\n\n` +
    `Required procedure:\n` +
    `1. Clone only the stated repository into this task's own workspace. Do not operate in any pre-existing checkout or access any other repository.\n` +
    `2. Fetch the approved commit and verify \`git rev-parse ${proposal.target.baseCommit}\` resolves to ${proposal.target.baseCommit}. Create a dedicated worktree and branch named \`${branchName}\` from that exact commit. If the commit cannot be resolved or checked out, stop without implementation and report a blocked run. Never substitute the current default branch. Never modify main or master.\n` +
    `3. Attempt no more than ${proposal.policy.maxFeatures} queued candidate(s), in the listed order. If a candidate is too risky or underspecified, abandon it cleanly and state why rather than forcing it.\n` +
    `4. For each implementation, add or update focused tests and run every required command exactly as listed in the policy. A candidate may be called shipped only if every command passes.\n` +
    `5. Independently inspect the final diff and rerun every required command before trusting a shipped claim. If verification finds a substantive issue, revert the feature commit rather than hiding history.\n` +
    `6. Commit verified work and update ROADMAP.md/CHANGELOG.md only in the dedicated branch. Do not use Claude Code, the local feature-inventor daemon, or workflows/nightly.js.\n` +
    `7. ${
      remotePushAllowed
        ? `You may push ONLY the dedicated review branch after successful independent verification. Never push, merge, or rewrite main/master, and never create a release.`
        : `Do NOT run git push, gh pr create, gh pr merge, or any other remote-mutating command. Leave all commits local to the isolated worktree and report the branch name plus a patch/diff summary.`
    }\n` +
    `8. End with a concise report that states every field required by the Runtime Result Manifest: run ID, approved base commit, actual checked-out commit, worktree path, branch name, candidate outcome and summary, commit SHA or null, each verification command with passed/failed/not-run outcome and factual summary, patch summary, remote pushed boolean, review URL or null, and blockers. The API will extract this manifest after task completion; do not omit fields or substitute a newer base commit.\n\n` +
    `Safety constraints: do not ask for broad permissions; do not spend time on unrelated backlog work; do not treat passing unrelated tests as meaningful coverage.`;
}

/**
 * Creates an asynchronous Manus task. It deliberately does not poll, answer
 * questions, approve tool calls, or confirm remote effects; those actions stay
 * visible to the human operator and cannot be silently authorized by this CLI.
 */
export async function createManusRunTask(request: ManusRunTaskRequest): Promise<ManusRunTask> {
  if (request.proposal.queue.length === 0) {
    throw new Error("No queued candidate is available in the selected proposal");
  }
  if (request.apiKey.trim() === "") throw new Error("MANUS_API_KEY is required to create a Manus run");
  if (request.repoUrl.trim() === "") throw new Error("A repository origin URL is required to create a Manus run");

  const fetchImpl = request.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    title: `Feature Inventor — Manus run ${request.proposal.runId}`,
    interactive_mode: false,
    share_visibility: "private",
    agent_profile: request.agentProfile ?? "manus-1.6",
    structured_output_schema: buildRuntimeResultStructuredOutputSchema(),
    message: {
      content: [{ type: "text", text: buildManusRunPrompt(request) }],
      ...(request.githubConnectorId ? { connectors: [request.githubConnectorId] } : {}),
    },
    ...(request.projectId ? { project_id: request.projectId } : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(MANUS_TASK_CREATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": request.apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not create Manus run: ${reason}`);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new Error(`Could not create Manus run: API returned HTTP ${response.status} without JSON`);
  }

  if (!response.ok || !isSuccess(responseBody)) {
    throw new Error(`Could not create Manus run: ${apiFailureMessage(responseBody, `HTTP ${response.status}`)}`);
  }

  return {
    taskId: responseBody.task_id,
    taskUrl: responseBody.task_url,
    taskTitle: responseBody.task_title,
  };
}

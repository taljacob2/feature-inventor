import type { RunPlanData } from "./run-plan.js";

const MANUS_TASK_CREATE_URL = "https://api.manus.ai/v2/task.create";

export type ManusAgentProfile = "manus-1.6" | "manus-1.6-lite" | "manus-1.6-max";

export interface ManusRunTaskRequest {
  apiKey: string;
  repoUrl: string;
  plan: RunPlanData;
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
  return request.plan.policy.remotePushPolicy === "explicit-only" && request.allowRemotePush === true;
}

/**
 * Produces the self-contained operational brief for a Manus task. The task is
 * told to act only in a fresh clone/worktree and may push a review branch only
 * when both the stored policy and the individual invocation allow it.
 */
export function buildManusRunPrompt(request: ManusRunTaskRequest): string {
  const remotePushAllowed = permitsRemotePush(request);
  const queued = request.plan.queue.map((candidate, index) => ({
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

  return `You are the Manus execution adapter for Feature Inventor. Execute one governed, auditable run.\n\n` +
    `Repository remote: ${request.repoUrl}\n` +
    `Runtime policy (authoritative):\n${JSON.stringify(request.plan.policy, null, 2)}\n\n` +
    `Planned candidate queue (authoritative; do not invent additional feature work):\n${JSON.stringify(queued, null, 2)}\n\n` +
    `Required procedure:\n` +
    `1. Clone the stated repository into this task's own workspace. Do not operate in any pre-existing checkout. ` +
    `Confirm the cloned package.json names the repository feature-inventor.\n` +
    `2. Starting from the clone's default branch, create a dedicated Git worktree and a branch named ` +
    `"${request.plan.policy.branchPrefix}/manus-<unique-run-id>". Never modify main or master.\n` +
    `3. Attempt no more than ${request.plan.policy.maxFeatures} queued candidate(s), in the listed order. ` +
    `If a candidate is too risky or underspecified, abandon it cleanly and state why rather than forcing it.\n` +
    `4. For each implementation, add or update focused tests and run every required command exactly as listed in the policy. ` +
    `A candidate may be called shipped only if every command passes.\n` +
    `5. Independently inspect the final diff and rerun every required command before trusting a shipped claim. ` +
    `If verification finds a substantive issue, revert the feature commit rather than hiding history.\n` +
    `6. Commit verified work and update ROADMAP.md/CHANGELOG.md only in the dedicated branch. ` +
    `Do not use Claude Code, the local feature-inventor daemon, or workflows/nightly.js.\n` +
    `7. ${
      remotePushAllowed
        ? `You may push ONLY the dedicated review branch after successful independent verification. Never push, merge, or rewrite main/master, and never create a release.`
        : `Do NOT run git push, gh pr create, gh pr merge, or any other remote-mutating command. Leave all commits local to the isolated worktree and report the branch name plus a patch/diff summary.`
    }\n` +
    `8. End with a concise report containing: cloned commit, worktree path, branch name, candidate outcome, tests run and actual results, commits/reverts, verification findings, remote effects, and any blockers.\n\n` +
    `Safety constraints: do not access any repository other than the stated remote; do not spend time on unrelated backlog work; ` +
    `do not ask for broad permissions; do not treat passing unrelated tests as meaningful coverage.`;
}

/**
 * Creates an asynchronous Manus task. It deliberately does not poll, answer
 * questions, approve tool calls, or confirm remote effects; those actions stay
 * visible to the human operator and cannot be silently authorized by this CLI.
 */
export async function createManusRunTask(request: ManusRunTaskRequest): Promise<ManusRunTask> {
  if (request.plan.queue.length === 0) {
    throw new Error("No open Now or Next candidate is available for a Manus run");
  }
  if (request.apiKey.trim() === "") throw new Error("MANUS_API_KEY is required to create a Manus run");
  if (request.repoUrl.trim() === "") throw new Error("A repository origin URL is required to create a Manus run");

  const fetchImpl = request.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    title: "Feature Inventor — Manus run",
    interactive_mode: false,
    share_visibility: "private",
    agent_profile: request.agentProfile ?? "manus-1.6",
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

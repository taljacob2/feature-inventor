import { execFile as execFileCallback } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RunProposal } from "./run-proposal.js";
import { RUNTIME_RESULT_FILENAME, assertRuntimeResultMatchesProposal, parseRuntimeResultFile, type RuntimeResult } from "./runtime-result.js";

const execFile = promisify(execFileCallback);
const WORKTREES_DIRECTORY = ".feature-inventor/worktrees";

export interface ClaudeProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ClaudeProcessExecutor {
  run(command: string, args: string[], options: { cwd: string }): Promise<ClaudeProcessResult>;
}

export interface ClaudeRunRequest {
  repoRoot: string;
  proposal: RunProposal;
}

export interface ClaudeRunPreparation {
  runId: string;
  worktreePath: string;
  branchName: string;
  runtimeResultPath: string;
  prompt: string;
}

export interface ClaudeRunOptions {
  onWorktreePrepared?: (preparation: ClaudeRunPreparation) => Promise<void> | void;
}

export interface ClaudeRunOutcome extends ClaudeRunPreparation {
  process: ClaudeProcessResult;
  runtimeResult: RuntimeResult | null;
  error: string | null;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function branchNameFor(proposal: RunProposal): string {
  const prefix = proposal.policy.branchPrefix.endsWith("/") ? proposal.policy.branchPrefix : `${proposal.policy.branchPrefix}/`;
  return `${prefix}${proposal.runId}`;
}

/** Creates the only instruction contract permitted for a Claude Code governed run. */
export function buildClaudeRunPrompt(preparation: ClaudeRunPreparation, proposal: RunProposal): string {
  const requiredChecks = proposal.requiredChecks.map((check) => `- ${check}`).join("\n");
  const queue = proposal.queue.map((item, index) => `${index + 1}. ${item.title} — ${item.description}`).join("\n");
  return `You are the Claude Code runtime adapter for Feature Inventor. Execute exactly the approved governed run below.\n\n` +
    `Run ID: ${proposal.runId}\n` +
    `Approved base commit: ${proposal.target.baseCommit}\n` +
    `Isolated worktree: ${preparation.worktreePath}\n` +
    `Dedicated local branch: ${preparation.branchName}\n` +
    `Runtime result artifact: ${preparation.runtimeResultPath}\n\n` +
    `Approved queue (do not invent, reprioritize, or add candidates):\n${queue}\n\n` +
    `Required verification commands:\n${requiredChecks}\n\n` +
    `Mandatory constraints:\n` +
    `1. Work only inside the isolated worktree. Before changing files, verify HEAD is exactly ${proposal.target.baseCommit}; if it is not, stop and write a blocked runtime result.\n` +
    `2. Never modify, commit to, merge into, reset, or check out main or master. Never run git push, gh pr create, gh pr merge, or any remote-mutating command.\n` +
    `3. Implement only the approved queue. If a candidate is unsafe or blocked, record that outcome rather than expanding scope.\n` +
    `4. Run every required verification command and record each factual result. Do not claim a command passed unless it actually exited successfully.\n` +
    `5. You may create local commits only on ${preparation.branchName}.\n` +
    `6. Before exiting, write a valid JSON Runtime Result Manifest to ${preparation.runtimeResultPath}. It must include schemaVersion 1, runId, approvedBaseCommit, checkedOutCommit, worktreePath, branchName, candidateTitle, candidateOutcome, candidateSummary, commitSha or null, verification records, patchSummary, remotePushed false, remoteReviewUrl null, and blockers.\n` +
    `7. Do not ask for broad permissions. If the local Claude Code policy blocks an operation, stop safely and record the blocker in the manifest.`;
}

/** Provides the deterministic paths and prompt for one immutable proposal. */
export function prepareClaudeRun(request: ClaudeRunRequest): ClaudeRunPreparation {
  const branchName = branchNameFor(request.proposal);
  const worktreePath = join(request.repoRoot, WORKTREES_DIRECTORY, request.proposal.runId);
  const runtimeResultPath = join(request.repoRoot, ".feature-inventor", "runs", request.proposal.runId, RUNTIME_RESULT_FILENAME);
  const preparation: ClaudeRunPreparation = {
    runId: request.proposal.runId,
    worktreePath,
    branchName,
    runtimeResultPath,
    prompt: "",
  };
  return { ...preparation, prompt: buildClaudeRunPrompt(preparation, request.proposal) };
}

const defaultExecutor: ClaudeProcessExecutor = {
  async run(command, args, options) {
    try {
      const result = await execFile(command, args, { cwd: options.cwd, maxBuffer: 8 * 1024 * 1024 });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      const typed = err as { code?: number | string; stdout?: string; stderr?: string; message?: string };
      return {
        exitCode: typeof typed.code === "number" ? typed.code : 1,
        stdout: typed.stdout ?? "",
        stderr: typed.stderr ?? typed.message ?? "Claude Code invocation failed",
      };
    }
  },
};

async function git(repoRoot: string, args: string[], executor: ClaudeProcessExecutor): Promise<ClaudeProcessResult> {
  return executor.run("git", args, { cwd: repoRoot });
}

function runError(process: ClaudeProcessResult, context: string): Error {
  return new Error(`${context}: ${compact(process.stderr || process.stdout || `exit code ${process.exitCode}`)}`);
}

/**
 * Creates a proposal-pinned worktree and invokes Claude Code in print mode.
 * It intentionally does not pass any permission-bypass option and performs no remote action.
 */
export async function runClaudeCodeProposal(
  request: ClaudeRunRequest,
  executor: ClaudeProcessExecutor = defaultExecutor,
  options: ClaudeRunOptions = {},
): Promise<ClaudeRunOutcome> {
  const preparation = prepareClaudeRun(request);
  mkdirSync(join(request.repoRoot, WORKTREES_DIRECTORY), { recursive: true });
  const current = await git(request.repoRoot, ["rev-parse", request.proposal.target.baseCommit], executor);
  if (current.exitCode !== 0) throw runError(current, `Approved base commit ${request.proposal.target.baseCommit} is unavailable locally`);
  const resolvedCommit = current.stdout.trim();
  if (resolvedCommit !== request.proposal.target.baseCommit) {
    throw new Error(`Approved base commit drifted: expected ${request.proposal.target.baseCommit}, resolved ${resolvedCommit}`);
  }
  if (existsSync(preparation.worktreePath)) {
    throw new Error(`Claude worktree already exists for ${request.proposal.runId}: ${preparation.worktreePath}`);
  }
  const worktree = await git(
    request.repoRoot,
    ["worktree", "add", "-b", preparation.branchName, preparation.worktreePath, request.proposal.target.baseCommit],
    executor,
  );
  if (worktree.exitCode !== 0) throw runError(worktree, "Could not create isolated Claude worktree");
  await options.onWorktreePrepared?.(preparation);

  const process = await executor.run("claude", ["--print", preparation.prompt], { cwd: preparation.worktreePath });
  let runtimeResult: RuntimeResult | null = null;
  let error: string | null = null;
  if (existsSync(preparation.runtimeResultPath)) {
    try {
      runtimeResult = parseRuntimeResultFile(readFileSync(preparation.runtimeResultPath, "utf8"));
      assertRuntimeResultMatchesProposal(runtimeResult, request.proposal);
      if (runtimeResult.worktreePath !== preparation.worktreePath || runtimeResult.branchName !== preparation.branchName) {
        throw new Error("Claude Code runtime result does not match the adapter-created worktree and branch");
      }
      if (runtimeResult.remotePushed || runtimeResult.remoteReviewUrl !== null) {
        throw new Error("Claude Code runtime results must not report a remote push or review URL");
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  } else {
    error = "Claude Code exited without writing a runtime-result.json artifact";
  }
  if (process.exitCode !== 0 && error === null) error = compact(process.stderr || process.stdout || `Claude Code exited with ${process.exitCode}`);
  return { ...preparation, process, runtimeResult, error };
}

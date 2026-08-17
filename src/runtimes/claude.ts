import { runClaudeCodeProposal } from "../claude-runtime.js";
import type { RuntimeAdapter } from "./types.js";

export function createClaudeAdapter(): RuntimeAdapter {
  return {
    id: "claude",
    displayName: "Claude Code",
    capabilities: {
      isolatedWorktree: true,
      asynchronousObservation: false,
      structuredResult: true,
      localRepositoryAccess: true,
      remoteEffects: "forbidden",
    },
    async preflight(context) {
      if (context.allowRemotePush) throw new Error("Claude Code adapter does not permit remote pushes");
    },
    async launch(context) {
      const outcome = await runClaudeCodeProposal({ repoRoot: context.repoRoot, proposal: context.proposal });
      const handle = {
        runtimeId: "claude",
        kind: "local-process" as const,
        id: context.proposal.runId,
        worktreePath: outcome.worktreePath,
        branchName: outcome.branchName,
        metadata: { runtimeResultPath: outcome.runtimeResultPath, exitCode: outcome.process.exitCode },
      };
      return {
        handle,
        observation: {
          runtimeId: "claude",
          handleId: handle.id,
          state: outcome.runtimeResult !== null && outcome.error === null ? "completed" : "failed",
          observedAt: new Date().toISOString(),
          sourceEventId: null,
          message: outcome.error,
          runtimeResult: outcome.runtimeResult,
          metadata: {
            worktreePath: outcome.worktreePath,
            branchName: outcome.branchName,
            runtimeResultPath: outcome.runtimeResultPath,
            checkedOutCommit: outcome.runtimeResult?.checkedOutCommit ?? null,
            commitSha: outcome.runtimeResult?.commitSha ?? null,
            remotePushed: outcome.runtimeResult?.remotePushed ?? false,
          },
        },
      };
    },
  };
}

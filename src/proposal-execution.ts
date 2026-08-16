import type { RunProposal } from "./run-proposal.js";

export interface ProposalExecutionEnvironment {
  repositoryUrl: string;
  baseCommit: string;
}

function normalizeRepositoryUrl(value: string): string {
  return value.trim().replace(/\/$/, "").replace(/\.git$/, "").toLowerCase();
}

/**
 * Refuses execution when the operator-approved proposal no longer describes
 * the checked repository state. Runtime adapters must call this before they
 * create any agent task or workspace.
 */
export function assertProposalMatchesEnvironment(
  proposal: RunProposal,
  environment: ProposalExecutionEnvironment,
): void {
  if (normalizeRepositoryUrl(proposal.target.repositoryUrl) !== normalizeRepositoryUrl(environment.repositoryUrl)) {
    throw new Error(
      `Proposal repository ${proposal.target.repositoryUrl} does not match current origin ${environment.repositoryUrl}`,
    );
  }
  if (proposal.target.baseCommit.toLowerCase() !== environment.baseCommit.toLowerCase()) {
    throw new Error(
      `Proposal base commit ${proposal.target.baseCommit} does not match configured branch commit ${environment.baseCommit}; create a new proposal`,
    );
  }
}

import type { RunProposal } from "./run-proposal.js";
import type { VerificationEvidence } from "./review-packet.js";

export const RUNTIME_RESULT_FILENAME = "runtime-result.json";

export type CandidateOutcome = "shipped" | "abandoned" | "reverted" | "blocked";
export type CheckOutcome = "passed" | "failed" | "not-run";

export interface RuntimeCheckResult {
  command: string;
  outcome: CheckOutcome;
  summary: string;
}

export interface RuntimeResult {
  schemaVersion: 1;
  runId: string;
  approvedBaseCommit: string;
  checkedOutCommit: string;
  worktreePath: string;
  branchName: string;
  candidateTitle: string;
  candidateOutcome: CandidateOutcome;
  candidateSummary: string;
  commitSha: string | null;
  verification: RuntimeCheckResult[];
  patchSummary: string;
  remotePushed: boolean;
  remoteReviewUrl: string | null;
  blockers: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRunId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) throw new Error("runtime result runId must be a valid proposal run ID");
}

function assertCommit(value: string, field: string): void {
  if (!/^[0-9a-f]{7,64}$/i.test(value)) throw new Error(`${field} must be a Git commit SHA`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid runtime result: ${field} is required`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid runtime result: ${field} must be a non-empty string or null`);
  return value;
}

function parseCheck(value: unknown): RuntimeCheckResult {
  if (!isRecord(value)) throw new Error("Invalid runtime result: verification entry must be an object");
  const command = requiredString(value.command, "verification.command");
  const outcome = value.outcome;
  if (outcome !== "passed" && outcome !== "failed" && outcome !== "not-run") {
    throw new Error("Invalid runtime result: verification.outcome must be passed, failed, or not-run");
  }
  return { command, outcome, summary: requiredString(value.summary, "verification.summary") };
}

/** Parses the strict structured-output value returned for one execution task. */
export function parseRuntimeResult(value: unknown): RuntimeResult {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("Invalid runtime result: schemaVersion must be 1");
  const runId = requiredString(value.runId, "runId");
  assertRunId(runId);
  const approvedBaseCommit = requiredString(value.approvedBaseCommit, "approvedBaseCommit");
  const checkedOutCommit = requiredString(value.checkedOutCommit, "checkedOutCommit");
  assertCommit(approvedBaseCommit, "approvedBaseCommit");
  assertCommit(checkedOutCommit, "checkedOutCommit");
  const candidateOutcome = value.candidateOutcome;
  if (candidateOutcome !== "shipped" && candidateOutcome !== "abandoned" && candidateOutcome !== "reverted" && candidateOutcome !== "blocked") {
    throw new Error("Invalid runtime result: candidateOutcome is invalid");
  }
  if (!Array.isArray(value.verification)) throw new Error("Invalid runtime result: verification must be an array");
  if (!Array.isArray(value.blockers) || !value.blockers.every((item) => typeof item === "string")) {
    throw new Error("Invalid runtime result: blockers must be a string array");
  }
  if (typeof value.remotePushed !== "boolean") throw new Error("Invalid runtime result: remotePushed must be boolean");

  const result: RuntimeResult = {
    schemaVersion: 1,
    runId,
    approvedBaseCommit,
    checkedOutCommit,
    worktreePath: requiredString(value.worktreePath, "worktreePath"),
    branchName: requiredString(value.branchName, "branchName"),
    candidateTitle: requiredString(value.candidateTitle, "candidateTitle"),
    candidateOutcome,
    candidateSummary: requiredString(value.candidateSummary, "candidateSummary"),
    commitSha: nullableString(value.commitSha, "commitSha"),
    verification: value.verification.map(parseCheck),
    patchSummary: requiredString(value.patchSummary, "patchSummary"),
    remotePushed: value.remotePushed,
    remoteReviewUrl: nullableString(value.remoteReviewUrl, "remoteReviewUrl"),
    blockers: [...value.blockers],
  };
  if (result.branchName === "main" || result.branchName === "master") {
    throw new Error("Invalid runtime result: branchName must not be main or master");
  }
  if (result.commitSha !== null) assertCommit(result.commitSha, "commitSha");
  return result;
}

export function serializeRuntimeResult(result: RuntimeResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function parseRuntimeResultFile(content: string): RuntimeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid runtime result JSON: ${reason}`);
  }
  return parseRuntimeResult(parsed);
}

/** Enforces the immutable proposal and no-implicit-push policy before review evidence is derived. */
export function assertRuntimeResultMatchesProposal(result: RuntimeResult, proposal: RunProposal): void {
  if (result.runId !== proposal.runId) throw new Error(`Runtime result ${result.runId} does not match proposal ${proposal.runId}`);
  if (result.approvedBaseCommit !== proposal.target.baseCommit || result.checkedOutCommit !== proposal.target.baseCommit) {
    throw new Error("Runtime result did not execute the approved proposal base commit");
  }
  if (result.remotePushed && proposal.remotePushPolicy !== "explicit-only") {
    throw new Error("Runtime result reports a remote push forbidden by the proposal policy");
  }
  if (result.remotePushed && result.remoteReviewUrl === null) {
    throw new Error("Runtime result reports a remote push without a review URL");
  }
}

/** Converts passed or failed runtime checks into append-only review evidence for proposal-required commands only. */
export function deriveVerificationEvidence(result: RuntimeResult, proposal: RunProposal, recordedAt: string): VerificationEvidence[] {
  assertRuntimeResultMatchesProposal(result, proposal);
  return result.verification
    .filter((check) => proposal.requiredChecks.includes(check.command) && check.outcome !== "not-run")
    .map((check) => ({
      check: check.command,
      outcome: check.outcome === "passed" ? "passed" : "failed",
      recordedAt,
      evidence: `Runtime result: ${check.summary}`,
    }));
}

/** Strict schema supplied to the task API for post-completion runtime evidence extraction. */
export function buildRuntimeResultStructuredOutputSchema(): Record<string, unknown> {
  const nullableString = { type: ["string", "null"] };
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "integer" },
      runId: { type: "string" },
      approvedBaseCommit: { type: "string" },
      checkedOutCommit: { type: "string" },
      worktreePath: { type: "string" },
      branchName: { type: "string" },
      candidateTitle: { type: "string" },
      candidateOutcome: { type: "string", enum: ["shipped", "abandoned", "reverted", "blocked"] },
      candidateSummary: { type: "string" },
      commitSha: nullableString,
      verification: {
        type: "array",
        items: {
          type: "object",
          properties: {
            command: { type: "string" },
            outcome: { type: "string", enum: ["passed", "failed", "not-run"] },
            summary: { type: "string" },
          },
          required: ["command", "outcome", "summary"],
          additionalProperties: false,
        },
      },
      patchSummary: { type: "string" },
      remotePushed: { type: "boolean" },
      remoteReviewUrl: nullableString,
      blockers: { type: "array", items: { type: "string" } },
    },
    required: [
      "schemaVersion",
      "runId",
      "approvedBaseCommit",
      "checkedOutCommit",
      "worktreePath",
      "branchName",
      "candidateTitle",
      "candidateOutcome",
      "candidateSummary",
      "commitSha",
      "verification",
      "patchSummary",
      "remotePushed",
      "remoteReviewUrl",
      "blockers",
    ],
    additionalProperties: false,
  };
}

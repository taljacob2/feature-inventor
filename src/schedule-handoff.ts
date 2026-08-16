import type { RunProposal } from "./run-proposal.js";

export const SCHEDULE_HANDOFF_FILENAME = "schedule-handoff.json";

export type ScheduledRuntime = "claude" | "manus";

export interface ScheduleHandoff {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  runtime: ScheduledRuntime;
  command: string;
  proposal: {
    baseCommit: string;
    manifestHash: string;
    policyHash: string;
  };
  executionMode: "manual-external-trigger";
  notes: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRunId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) throw new Error("schedule handoff runId must be a valid proposal run ID");
}

function assertCommit(value: string): void {
  if (!/^[0-9a-f]{7,64}$/i.test(value)) throw new Error("schedule handoff baseCommit must be a Git SHA");
}

function assertHash(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) throw new Error(`schedule handoff ${field} must be a SHA-256 hash`);
  return value;
}

function commandFor(runId: string, runtime: ScheduledRuntime): string {
  return runtime === "claude"
    ? `feature-inventor claude run --run ${runId}`
    : `feature-inventor manus run --run ${runId}`;
}

/** Creates a non-executing handoff for a scheduler that is configured elsewhere. */
export function createScheduleHandoff(proposal: RunProposal, runtime: ScheduledRuntime, createdAt: string): ScheduleHandoff {
  assertRunId(proposal.runId);
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("schedule handoff createdAt must be an ISO date");
  return {
    schemaVersion: 1,
    runId: proposal.runId,
    createdAt,
    runtime,
    command: commandFor(proposal.runId, runtime),
    proposal: {
      baseCommit: proposal.target.baseCommit,
      manifestHash: proposal.manifestHash,
      policyHash: proposal.policyHash,
    },
    executionMode: "manual-external-trigger",
    notes:
      "This artifact does not schedule or execute work. An external scheduler must invoke exactly this command only after the named proposal has been reviewed.",
  };
}

export function serializeScheduleHandoff(handoff: ScheduleHandoff): string {
  return `${JSON.stringify(handoff, null, 2)}\n`;
}

/** Rejects artifacts that could broaden the selected proposal or smuggle arbitrary shell commands into scheduling. */
export function parseScheduleHandoff(content: string): ScheduleHandoff {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid schedule handoff JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) throw new Error("Invalid schedule handoff: schemaVersion must be 1");
  if (typeof parsed.runId !== "string") throw new Error("Invalid schedule handoff: runId is required");
  assertRunId(parsed.runId);
  if (parsed.runtime !== "claude" && parsed.runtime !== "manus") throw new Error("Invalid schedule handoff: runtime must be claude or manus");
  if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) throw new Error("Invalid schedule handoff: createdAt is required");
  if (!isRecord(parsed.proposal) || typeof parsed.proposal.baseCommit !== "string") throw new Error("Invalid schedule handoff: proposal is required");
  assertCommit(parsed.proposal.baseCommit);
  const manifestHash = assertHash(parsed.proposal.manifestHash, "proposal.manifestHash");
  const policyHash = assertHash(parsed.proposal.policyHash, "proposal.policyHash");
  if (parsed.executionMode !== "manual-external-trigger") throw new Error("Invalid schedule handoff: executionMode is not supported");
  const expectedCommand = commandFor(parsed.runId, parsed.runtime);
  if (parsed.command !== expectedCommand) throw new Error("Invalid schedule handoff: command does not match the selected runtime and run ID");
  if (typeof parsed.notes !== "string" || parsed.notes.trim() === "") throw new Error("Invalid schedule handoff: notes are required");
  return {
    schemaVersion: 1,
    runId: parsed.runId,
    createdAt: parsed.createdAt,
    runtime: parsed.runtime,
    command: expectedCommand,
    proposal: { baseCommit: parsed.proposal.baseCommit, manifestHash, policyHash },
    executionMode: "manual-external-trigger",
    notes: parsed.notes,
  };
}

/** Confirms a stored handoff is for this exact immutable proposal. */
export function assertScheduleHandoffMatchesProposal(handoff: ScheduleHandoff, proposal: RunProposal): void {
  if (
    handoff.runId !== proposal.runId ||
    handoff.proposal.baseCommit !== proposal.target.baseCommit ||
    handoff.proposal.manifestHash !== proposal.manifestHash ||
    handoff.proposal.policyHash !== proposal.policyHash
  ) {
    throw new Error("Schedule handoff does not match the selected immutable proposal");
  }
}

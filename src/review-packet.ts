import type { RunProposal } from "./run-proposal.js";

export const TASK_OUTCOME_FILENAME = "task-outcome.json";
export const REVIEW_PACKET_FILENAME = "review.json";
export const VERIFICATION_EVIDENCE_FILENAME = "verification.jsonl";

export interface TaskOutcome {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  capturedAt: string;
  taskStatus: "stopped" | "error" | "waiting" | "running" | "unknown";
  statusEventId: string | null;
  observedAt: string;
  brief: string | null;
  description: string | null;
  assistantReport: string | null;
  error: string | null;
}

export interface VerificationEvidence {
  check: string;
  outcome: "passed" | "failed";
  recordedAt: string;
  evidence: string;
}

export interface ReviewPacket {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  proposal: {
    baseCommit: string;
    manifestHash: string;
    policyHash: string;
    requiredChecks: string[];
  };
  taskOutcome: TaskOutcome | null;
  verification: VerificationEvidence[];
  missingChecks: string[];
  failedChecks: string[];
  readiness: "pending" | "blocked" | "ready-to-finalize";
}

function assertRunId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) throw new Error("runId must be a valid proposal run ID");
}

function assertDate(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Creates a structured, operator-captured result artifact from a passive task observation. */
export function createTaskOutcome(input: Omit<TaskOutcome, "schemaVersion">): TaskOutcome {
  assertRunId(input.runId);
  if (input.taskId.trim() === "") throw new Error("taskId is required");
  assertDate(input.capturedAt, "capturedAt");
  assertDate(input.observedAt, "observedAt");
  return { ...input, schemaVersion: 1 };
}

/** Builds the evidence-backed packet that gates finalization. */
export function createReviewPacket(
  proposal: RunProposal,
  createdAt: string,
  taskOutcome: TaskOutcome | null,
  verification: VerificationEvidence[],
): ReviewPacket {
  assertDate(createdAt, "createdAt");
  if (taskOutcome !== null && taskOutcome.runId !== proposal.runId) {
    throw new Error(`Task outcome ${taskOutcome.runId} does not match proposal ${proposal.runId}`);
  }
  const requiredChecks = unique(proposal.requiredChecks);
  const knownChecks = new Set(requiredChecks);
  for (const item of verification) {
    if (!knownChecks.has(item.check)) throw new Error(`Verification check is not required by proposal: ${item.check}`);
    assertDate(item.recordedAt, "verification.recordedAt");
    if (item.evidence.trim() === "") throw new Error("Verification evidence cannot be empty");
  }
  const latestByCheck = new Map<string, VerificationEvidence>();
  for (const item of verification) latestByCheck.set(item.check, item);
  const missingChecks = requiredChecks.filter((check) => !latestByCheck.has(check));
  const failedChecks = requiredChecks.filter((check) => latestByCheck.get(check)?.outcome === "failed");
  const readiness: ReviewPacket["readiness"] =
    taskOutcome === null || taskOutcome.taskStatus !== "stopped" || missingChecks.length > 0
      ? "pending"
      : failedChecks.length > 0
        ? "blocked"
        : "ready-to-finalize";
  return {
    schemaVersion: 1,
    runId: proposal.runId,
    createdAt,
    proposal: {
      baseCommit: proposal.target.baseCommit,
      manifestHash: proposal.manifestHash,
      policyHash: proposal.policyHash,
      requiredChecks,
    },
    taskOutcome,
    verification: verification.map((item) => ({ ...item })),
    missingChecks,
    failedChecks,
    readiness,
  };
}

export function serializeTaskOutcome(outcome: TaskOutcome): string {
  return `${JSON.stringify(outcome, null, 2)}\n`;
}

export function serializeReviewPacket(packet: ReviewPacket): string {
  return `${JSON.stringify(packet, null, 2)}\n`;
}

export function appendVerificationEvidence(existing: string, evidence: VerificationEvidence): string {
  assertDate(evidence.recordedAt, "verification.recordedAt");
  if (evidence.check.trim() === "" || evidence.evidence.trim() === "") {
    throw new Error("Verification check and evidence are required");
  }
  return `${existing}${existing.length === 0 || existing.endsWith("\n") ? "" : "\n"}${JSON.stringify(evidence)}\n`;
}

/** Ignores an incomplete final JSONL line so interrupted local writes preserve prior evidence. */
export function parseVerificationEvidence(content: string): VerificationEvidence[] {
  const evidence: VerificationEvidence[] = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        isRecord(parsed) &&
        typeof parsed.check === "string" &&
        (parsed.outcome === "passed" || parsed.outcome === "failed") &&
        typeof parsed.recordedAt === "string" &&
        typeof parsed.evidence === "string"
      ) {
        assertDate(parsed.recordedAt, "verification.recordedAt");
        if (parsed.check.trim() !== "" && parsed.evidence.trim() !== "") {
          evidence.push({
            check: parsed.check,
            outcome: parsed.outcome,
            recordedAt: parsed.recordedAt,
            evidence: parsed.evidence,
          });
        }
      }
    } catch {
      // Keep earlier evidence available after an interrupted append.
    }
  }
  return evidence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTaskOutcome(content: string): TaskOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid task outcome: ${reason}`);
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || typeof parsed.runId !== "string" || typeof parsed.taskId !== "string") {
    throw new Error("Invalid task outcome: schemaVersion, runId, and taskId are required");
  }
  assertRunId(parsed.runId);
  return parsed as unknown as TaskOutcome;
}

export function parseReviewPacket(content: string): ReviewPacket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid review packet: ${reason}`);
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || typeof parsed.runId !== "string" || !isRecord(parsed.proposal)) {
    throw new Error("Invalid review packet: schemaVersion, runId, and proposal are required");
  }
  assertRunId(parsed.runId);
  if (
    typeof parsed.createdAt !== "string" ||
    typeof parsed.proposal.baseCommit !== "string" ||
    typeof parsed.proposal.manifestHash !== "string" ||
    typeof parsed.proposal.policyHash !== "string" ||
    !Array.isArray(parsed.proposal.requiredChecks) ||
    !Array.isArray(parsed.verification) ||
    !Array.isArray(parsed.missingChecks) ||
    !Array.isArray(parsed.failedChecks) ||
    (parsed.readiness !== "pending" && parsed.readiness !== "blocked" && parsed.readiness !== "ready-to-finalize")
  ) {
    throw new Error("Invalid review packet: incomplete evidence-backed packet");
  }
  assertDate(parsed.createdAt, "createdAt");
  return parsed as unknown as ReviewPacket;
}

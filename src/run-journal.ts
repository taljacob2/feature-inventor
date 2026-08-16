export const RUN_JOURNAL_FILENAME = "events.jsonl";

export type RunEventType =
  | "planned"
  | "schedule-handoff-created"
  | "task-created"
  | "task-running"
  | "task-waiting"
  | "task-completed"
  | "workspace-prepared"
  | "candidate-started"
  | "candidate-abandoned"
  | "implementation-committed"
  | "verification-started"
  | "verification-passed"
  | "verification-failed"
  | "candidate-reverted"
  | "review-packet-created"
  | "run-finalized"
  | "run-failed";

export interface RunJournalEvent {
  schemaVersion: 1;
  runId: string;
  timestamp: string;
  type: RunEventType;
  payload: Record<string, unknown>;
}

export type RunLifecycleStatus = "planned" | "active" | "awaiting-review" | "finalized" | "failed";

export interface RunJournalSummary {
  runId: string;
  status: RunLifecycleStatus;
  latestEvent: RunJournalEvent | null;
  eventCount: number;
  startedAt: string | null;
  finalizedAt: string | null;
}

const TRANSITIONS: Record<RunEventType | "none", RunEventType[]> = {
  none: ["planned"],
  planned: ["schedule-handoff-created", "task-created", "workspace-prepared", "run-failed"],
  "schedule-handoff-created": ["task-created", "workspace-prepared", "run-failed"],
  "task-created": ["task-running", "task-waiting", "task-completed", "workspace-prepared", "run-failed"],
  "task-running": ["task-waiting", "task-completed", "run-failed"],
  "task-waiting": ["task-running", "task-completed", "run-failed"],
  "task-completed": ["review-packet-created", "run-finalized", "run-failed"],
  "workspace-prepared": ["candidate-started", "run-finalized", "run-failed"],
  "candidate-started": ["candidate-abandoned", "implementation-committed", "task-completed", "run-failed"],
  "candidate-abandoned": ["candidate-started", "run-finalized", "run-failed"],
  "implementation-committed": ["verification-started", "run-failed"],
  "verification-started": ["verification-passed", "verification-failed", "run-failed"],
  "verification-passed": ["candidate-started", "review-packet-created", "run-finalized", "run-failed"],
  "verification-failed": ["candidate-reverted", "run-failed"],
  "candidate-reverted": ["candidate-started", "run-finalized", "run-failed"],
  "review-packet-created": ["run-finalized", "run-failed"],
  "run-finalized": [],
  "run-failed": [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRunEventType(value: unknown): value is RunEventType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TRANSITIONS, value) && value !== "none";
}

function assertRunId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) throw new Error("runId must be a valid proposal run ID");
}

export function createRunJournalEvent(
  runId: string,
  type: RunEventType,
  timestamp: string,
  payload: Record<string, unknown> = {},
): RunJournalEvent {
  assertRunId(runId);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("timestamp must be a valid ISO date");
  return { schemaVersion: 1, runId, timestamp, type, payload: { ...payload } };
}

export function serializeRunJournalEvent(event: RunJournalEvent): string {
  return JSON.stringify(event);
}

/**
 * Parses independently recoverable JSONL records. Corrupt lines are ignored so
 * an interrupted append never invalidates earlier truthful run history.
 */
export function parseRunJournalEvents(content: string): RunJournalEvent[] {
  const events: RunJournalEvent[] = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        isRecord(parsed) &&
        parsed.schemaVersion === 1 &&
        typeof parsed.runId === "string" &&
        typeof parsed.timestamp === "string" &&
        isRunEventType(parsed.type) &&
        isRecord(parsed.payload)
      ) {
        assertRunId(parsed.runId);
        if (!Number.isNaN(Date.parse(parsed.timestamp))) {
          events.push({
            schemaVersion: 1,
            runId: parsed.runId,
            timestamp: parsed.timestamp,
            type: parsed.type,
            payload: parsed.payload,
          });
        }
      }
    } catch {
      // Keep prior valid events available after partial or corrupt writes.
    }
  }
  return events;
}

export function appendRunJournalEvents(existing: string, additions: RunJournalEvent[]): string {
  const suffix = additions.map(serializeRunJournalEvent).join("\n");
  if (suffix === "") return existing;
  return `${existing}${existing.length === 0 || existing.endsWith("\n") ? "" : "\n"}${suffix}\n`;
}

export function assertLegalRunTransition(events: RunJournalEvent[], next: RunJournalEvent): void {
  const relevant = events.filter((event) => event.runId === next.runId);
  const previous = relevant.at(-1)?.type ?? "none";
  if (!TRANSITIONS[previous].includes(next.type)) {
    throw new Error(`Illegal run transition for ${next.runId}: ${previous} -> ${next.type}`);
  }
}

export function summarizeRunJournal(runId: string, events: RunJournalEvent[]): RunJournalSummary {
  const relevant = events.filter((event) => event.runId === runId);
  const latestEvent = relevant.at(-1) ?? null;
  const terminal = latestEvent?.type;
  const status: RunLifecycleStatus =
    terminal === "run-finalized"
      ? "finalized"
      : terminal === "run-failed"
        ? "failed"
        : terminal === "task-completed"
          ? "awaiting-review"
          : relevant.length === 0
            ? "planned"
            : "active";

  return {
    runId,
    status,
    latestEvent,
    eventCount: relevant.length,
    startedAt: relevant[0]?.timestamp ?? null,
    finalizedAt: status === "finalized" || status === "failed" ? latestEvent?.timestamp ?? null : null,
  };
}

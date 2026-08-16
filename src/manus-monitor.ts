import { createRunJournalEvent, type RunEventType, type RunJournalEvent } from "./run-journal.js";

const MANUS_TASK_LIST_MESSAGES_URL = "https://api.manus.ai/v2/task.listMessages";

type ManusAgentStatus = "running" | "waiting" | "stopped" | "error" | "unknown";

export interface ManusTaskSnapshot {
  taskId: string;
  status: ManusAgentStatus;
  sourceEventId: string | null;
  observedAt: string;
  brief: string | null;
  description: string | null;
  waitingForEventId: string | null;
  waitingForEventType: string | null;
  waitingDescription: string | null;
  error: string | null;
  assistantReport: string | null;
}

interface ManusApiFailure {
  ok?: false;
  error?: { message?: string };
  message?: string;
}

interface RawTaskEvent {
  id?: unknown;
  type?: unknown;
  timestamp?: unknown;
  status_update?: unknown;
  error_message?: unknown;
  assistant_message?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function apiFailureMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  const typed = value as ManusApiFailure;
  return typed.error?.message ?? typed.message ?? fallback;
}

function eventTime(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return fallback;
}

function latestStatusEvent(messages: unknown[]): RawTaskEvent | null {
  const statuses = messages.filter(
    (message): message is RawTaskEvent => isRecord(message) && message.type === "status_update" && isRecord(message.status_update),
  );
  if (statuses.length === 0) return null;
  return [...statuses].sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0)).at(-1) ?? null;
}

function latestAssistantReport(messages: unknown[]): string | null {
  const messagesWithReports = messages.filter(
    (message): message is RawTaskEvent => isRecord(message) && message.type === "assistant_message" && isRecord(message.assistant_message),
  );
  const latest = [...messagesWithReports].sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0)).at(-1);
  return latest && isRecord(latest.assistant_message) ? getString(latest.assistant_message.content) : null;
}

function latestError(messages: unknown[]): string | null {
  const errors = messages.filter(
    (message): message is RawTaskEvent => isRecord(message) && message.type === "error_message" && isRecord(message.error_message),
  );
  const latest = [...errors].sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0)).at(-1);
  return latest && isRecord(latest.error_message) ? getString(latest.error_message.content) : null;
}

/** Interprets public task event fields into one passive, operator-visible status. */
export function interpretManusTaskMessages(taskId: string, messages: unknown[], observedAt = new Date().toISOString()): ManusTaskSnapshot {
  const latest = latestStatusEvent(messages);
  if (latest === null || !isRecord(latest.status_update)) {
    return {
      taskId,
      status: "unknown",
      sourceEventId: null,
      observedAt,
      brief: null,
      description: null,
      waitingForEventId: null,
      waitingForEventType: null,
      waitingDescription: null,
      error: latestError(messages),
      assistantReport: latestAssistantReport(messages),
    };
  }
  const update = latest.status_update;
  const statusValue = getString(update.agent_status);
  const status: ManusAgentStatus =
    statusValue === "running" || statusValue === "waiting" || statusValue === "stopped" || statusValue === "error"
      ? statusValue
      : "unknown";
  const detail = isRecord(update.status_detail) ? update.status_detail : {};
  return {
    taskId,
    status,
    sourceEventId: getString(latest.id),
    observedAt: eventTime(latest.timestamp, observedAt),
    brief: getString(update.brief),
    description: getString(update.description),
    waitingForEventId: getString(detail.waiting_for_event_id),
    waitingForEventType: getString(detail.waiting_for_event_type),
    waitingDescription: getString(detail.waiting_description),
    error: status === "error" ? latestError(messages) ?? getString(update.description) : latestError(messages),
    assistantReport: latestAssistantReport(messages),
  };
}

/** Maps a passive task snapshot to the next governed journal event, if any. */
export function journalEventFromManusSnapshot(runId: string, snapshot: ManusTaskSnapshot): RunJournalEvent | null {
  const type: RunEventType | null =
    snapshot.status === "running"
      ? "task-running"
      : snapshot.status === "waiting"
        ? "task-waiting"
        : snapshot.status === "stopped"
          ? "task-completed"
          : snapshot.status === "error"
            ? "run-failed"
            : null;
  if (type === null) return null;
  return createRunJournalEvent(runId, type, snapshot.observedAt, {
    taskId: snapshot.taskId,
    sourceEventId: snapshot.sourceEventId,
    brief: snapshot.brief,
    description: snapshot.description,
    waitingForEventId: snapshot.waitingForEventId,
    waitingForEventType: snapshot.waitingForEventType,
    waitingDescription: snapshot.waitingDescription,
    error: snapshot.error,
    assistantReport: snapshot.assistantReport,
  });
}

/** Returns true when the monitor already recorded this exact external status event. */
export function journalAlreadyContainsSourceEvent(events: RunJournalEvent[], sourceEventId: string | null): boolean {
  if (sourceEventId === null) return false;
  return events.some((event) => event.payload.sourceEventId === sourceEventId);
}

/** Fetches public progress events only. It never sends a message or confirms an action. */
export async function getManusTaskSnapshot(
  apiKey: string,
  taskId: string,
  options: { fetchImpl?: typeof fetch; observedAt?: string } = {},
): Promise<ManusTaskSnapshot> {
  if (apiKey.trim() === "") throw new Error("MANUS_API_KEY is required to watch a Manus run");
  if (taskId.trim() === "") throw new Error("A Manus task ID is required to watch a run");
  const url = new URL(MANUS_TASK_LIST_MESSAGES_URL);
  url.searchParams.set("task_id", taskId);
  url.searchParams.set("order", "desc");
  url.searchParams.set("limit", "200");

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, { headers: { "x-manus-api-key": apiKey } });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not watch Manus run: ${reason}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Could not watch Manus run: API returned HTTP ${response.status} without JSON`);
  }
  if (!response.ok || !isRecord(body) || body.ok !== true || !Array.isArray(body.messages)) {
    throw new Error(`Could not watch Manus run: ${apiFailureMessage(body, `HTTP ${response.status}`)}`);
  }
  return interpretManusTaskMessages(taskId, body.messages, options.observedAt);
}

import { describe, expect, it, vi } from "vitest";
import {
  getManusTaskSnapshot,
  interpretManusTaskMessages,
  journalAlreadyContainsSourceEvent,
  journalEventFromManusSnapshot,
} from "./manus-monitor.js";
import { createRunJournalEvent } from "./run-journal.js";

const TASK_ID = "task-123";
const RUN_ID = "run-20260817-001";

function statusEvent(id: string, timestamp: number, status: string, detail: Record<string, unknown> = {}) {
  return {
    id,
    type: "status_update",
    timestamp,
    status_update: { agent_status: status, brief: `Task is ${status}`, status_detail: detail },
  };
}

describe("Manus task monitor", () => {
  it("uses the latest official status event and preserves waiting context without confirming anything", () => {
    const snapshot = interpretManusTaskMessages(
      TASK_ID,
      [
        statusEvent("evt-running", 1_000, "running"),
        statusEvent("evt-waiting", 2_000, "waiting", {
          waiting_for_event_id: "approval-1",
          waiting_for_event_type: "terminalExecute",
          waiting_description: "Run npm test",
        }),
      ],
      "2026-08-17T00:00:00.000Z",
    );

    expect(snapshot).toMatchObject({
      taskId: TASK_ID,
      status: "waiting",
      sourceEventId: "evt-waiting",
      waitingForEventId: "approval-1",
      waitingForEventType: "terminalExecute",
      waitingDescription: "Run npm test",
    });
    expect(journalEventFromManusSnapshot(RUN_ID, snapshot)).toMatchObject({ type: "task-waiting" });
  });

  it("maps stopped and error statuses to reviewable terminal journal events", () => {
    const stopped = interpretManusTaskMessages(TASK_ID, [statusEvent("evt-stopped", 3_000, "stopped")]);
    expect(journalEventFromManusSnapshot(RUN_ID, stopped)).toMatchObject({ type: "task-completed" });

    const errored = interpretManusTaskMessages(TASK_ID, [
      { id: "message-error", type: "error_message", timestamp: 4_000, error_message: { content: "clone failed" } },
      statusEvent("evt-error", 5_000, "error"),
    ]);
    expect(journalEventFromManusSnapshot(RUN_ID, errored)).toMatchObject({ type: "run-failed", payload: { error: "clone failed" } });
  });

  it("treats repeated source events as already recovered", () => {
    const event = createRunJournalEvent(RUN_ID, "task-running", "2026-08-17T00:00:00.000Z", {
      sourceEventId: "evt-running",
    });
    expect(journalAlreadyContainsSourceEvent([event], "evt-running")).toBe(true);
    expect(journalAlreadyContainsSourceEvent([event], "evt-next")).toBe(false);
  });

  it("fetches only task messages using task_id and never sends a confirmation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, messages: [statusEvent("evt-running", 1_000, "running")] }), { status: 200 }),
    );
    const snapshot = await getManusTaskSnapshot("test-key", TASK_ID, { fetchImpl, observedAt: "2026-08-17T00:00:00.000Z" });

    expect(snapshot.status).toBe("running");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://api.manus.ai/v2/task.listMessages?task_id=task-123");
    expect(init).toMatchObject({ headers: { "x-manus-api-key": "test-key" } });
  });
});

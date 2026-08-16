import { describe, expect, it } from "vitest";
import {
  appendRunJournalEvents,
  assertLegalRunTransition,
  createRunJournalEvent,
  parseRunJournalEvents,
  summarizeRunJournal,
} from "./run-journal.js";

const RUN_ID = "run-20260817-001";
const at = (second: number) => `2026-08-17T12:00:0${second}.000Z`;

describe("run journal", () => {
  it("records a legal lifecycle and summarizes its terminal state", () => {
    const planned = createRunJournalEvent(RUN_ID, "planned", at(0));
    const prepared = createRunJournalEvent(RUN_ID, "workspace-prepared", at(1));
    const started = createRunJournalEvent(RUN_ID, "candidate-started", at(2), { title: "Improve doctor" });
    const committed = createRunJournalEvent(RUN_ID, "implementation-committed", at(3), { commit: "abcdef1" });
    const verification = createRunJournalEvent(RUN_ID, "verification-started", at(4));
    const passed = createRunJournalEvent(RUN_ID, "verification-passed", at(5));
    const finalized = createRunJournalEvent(RUN_ID, "run-finalized", at(6));
    const events = [planned, prepared, started, committed, verification, passed, finalized];

    for (let index = 1; index < events.length; index += 1) assertLegalRunTransition(events.slice(0, index), events[index]!);

    expect(summarizeRunJournal(RUN_ID, events)).toMatchObject({
      status: "finalized",
      eventCount: 7,
      startedAt: at(0),
      finalizedAt: at(6),
    });
  });

  it("rejects an illegal transition and preserves prior valid events after a corrupt line", () => {
    const planned = createRunJournalEvent(RUN_ID, "planned", at(0));
    const finalized = createRunJournalEvent(RUN_ID, "run-finalized", at(1));
    expect(() => assertLegalRunTransition([planned], finalized)).toThrow("Illegal run transition");

    const content = `${appendRunJournalEvents("", [planned])}{not-json}\n`;
    expect(parseRunJournalEvents(content)).toEqual([planned]);
  });

  it("reports active and failed run states", () => {
    const planned = createRunJournalEvent(RUN_ID, "planned", at(0));
    expect(summarizeRunJournal(RUN_ID, [planned]).status).toBe("active");

    const failed = createRunJournalEvent(RUN_ID, "run-failed", at(1), { reason: "interrupted" });
    expect(summarizeRunJournal(RUN_ID, [planned, failed])).toMatchObject({ status: "failed", finalizedAt: at(1) });
  });
});


describe("external task lifecycle", () => {
  it("allows one task-created event after planning and rejects a duplicate task launch", () => {
    const planned = createRunJournalEvent(RUN_ID, "planned", at(0));
    const taskCreated = createRunJournalEvent(RUN_ID, "task-created", at(1), { taskId: "task-1" });
    expect(() => assertLegalRunTransition([planned], taskCreated)).not.toThrow();
    expect(() => assertLegalRunTransition([planned, taskCreated], taskCreated)).toThrow("Illegal run transition");
  });
});

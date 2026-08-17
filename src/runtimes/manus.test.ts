import { describe, expect, it } from "vitest";
import { createManusAdapter } from "./manus.js";

describe("Manus runtime adapter observation", () => {
  it("translates a stopped external task into a normalized awaiting-review observation", async () => {
    const adapter = createManusAdapter({
      async observeTask() {
        return {
          taskId: "task-1",
          status: "stopped" as const,
          sourceEventId: "event-1",
          observedAt: "2026-08-17T00:00:00.000Z",
          brief: "Task finished",
          description: "Implementation complete",
          waitingForEventId: null,
          waitingForEventType: null,
          waitingDescription: null,
          error: null,
          assistantReport: "A local commit was created.",
          structuredOutput: null,
        };
      },
    });
    const observation = await adapter.observe!({
      repoRoot: "/repo",
      proposal: {} as never,
      handle: { runtimeId: "manus", kind: "external-task", id: "task-1", metadata: {} },
      options: { apiKey: "test-key" },
    });
    expect(observation.state).toBe("awaiting-review");
    expect(observation.sourceEventId).toBe("event-1");
    expect(observation.metadata.assistantReport).toBe("A local commit was created.");
  });

  it("refuses an observation without an API key or external task handle", async () => {
    const adapter = createManusAdapter();
    await expect(adapter.observe!({
      repoRoot: "/repo",
      proposal: {} as never,
      handle: { runtimeId: "manus", kind: "local-process", id: "local-1", metadata: {} },
      options: {},
    })).rejects.toThrow("external task handle");
  });
});

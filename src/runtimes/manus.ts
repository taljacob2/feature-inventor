import { createManusRunTask, type ManusAgentProfile } from "../manus-runtime.js";
import { getManusTaskSnapshot } from "../manus-monitor.js";
import { parseRuntimeResult } from "../runtime-result.js";
import type { RuntimeAdapter, RuntimeObservation } from "./types.js";

function optionalString(options: Record<string, unknown>, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function observationFromSnapshot(taskId: string, snapshot: Awaited<ReturnType<typeof getManusTaskSnapshot>>): RuntimeObservation {
  let runtimeResult = null;
  let resultError: string | null = null;
  if (snapshot.structuredOutput?.success) {
    try {
      runtimeResult = parseRuntimeResult(snapshot.structuredOutput.value);
    } catch (err) {
      resultError = err instanceof Error ? err.message : String(err);
    }
  }
  const state =
    snapshot.status === "running"
      ? "started"
      : snapshot.status === "waiting"
        ? "waiting"
        : snapshot.status === "stopped"
          ? "awaiting-review"
          : snapshot.status === "error"
            ? "failed"
            : "waiting";
  return {
    runtimeId: "manus",
    handleId: taskId,
    state,
    observedAt: snapshot.observedAt,
    sourceEventId: snapshot.sourceEventId,
    message: resultError ?? snapshot.error ?? snapshot.description,
    runtimeResult,
    metadata: {
      taskId,
      brief: snapshot.brief,
      description: snapshot.description,
      waitingForEventId: snapshot.waitingForEventId,
      waitingForEventType: snapshot.waitingForEventType,
      waitingDescription: snapshot.waitingDescription,
      assistantReport: snapshot.assistantReport,
      structuredOutputEventId: snapshot.structuredOutput?.sourceEventId ?? null,
      structuredOutputSuccess: snapshot.structuredOutput?.success ?? null,
      structuredOutputError: snapshot.structuredOutput?.error ?? null,
    },
  };
}

export interface ManusAdapterDependencies {
  observeTask?: typeof getManusTaskSnapshot;
}

export function createManusAdapter(dependencies: ManusAdapterDependencies = {}): RuntimeAdapter {
  const observeTask = dependencies.observeTask ?? getManusTaskSnapshot;
  return {
    id: "manus",
    displayName: "Manus",
    capabilities: {
      isolatedWorktree: true,
      asynchronousObservation: true,
      structuredResult: true,
      localRepositoryAccess: false,
      remoteEffects: "explicit-only",
    },
    async preflight(context) {
      if (typeof context.options.apiKey !== "string" || context.options.apiKey.trim() === "") {
        throw new Error("MANUS_API_KEY is required to create a Manus run");
      }
    },
    async launch(context) {
      const task = await createManusRunTask({
        apiKey: context.options.apiKey as string,
        repoUrl: context.environment.repositoryUrl ?? "",
        proposal: context.proposal,
        allowRemotePush: context.allowRemotePush,
        projectId: optionalString(context.options, "projectId"),
        githubConnectorId: optionalString(context.options, "githubConnectorId"),
        agentProfile: optionalString(context.options, "agentProfile") as ManusAgentProfile | undefined,
      });
      return {
        handle: {
          runtimeId: "manus",
          kind: "external-task" as const,
          id: task.taskId,
          taskUrl: task.taskUrl,
          metadata: { taskTitle: task.taskTitle },
        },
        observation: null,
      };
    },
    async observe(context) {
      if (context.handle.kind !== "external-task") throw new Error("Manus observation requires an external task handle");
      const apiKey = optionalString(context.options, "apiKey");
      if (!apiKey) throw new Error("MANUS_API_KEY is required to watch a Manus run");
      const snapshot = await observeTask(apiKey, context.handle.id);
      return observationFromSnapshot(context.handle.id, snapshot);
    },
  };
}

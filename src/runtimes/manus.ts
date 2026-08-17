import { createManusRunTask, type ManusAgentProfile } from "../manus-runtime.js";
import type { RuntimeAdapter } from "./types.js";

function optionalString(options: Record<string, unknown>, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function createManusAdapter(): RuntimeAdapter {
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
  };
}

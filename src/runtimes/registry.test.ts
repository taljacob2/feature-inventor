import { describe, expect, it } from "vitest";
import { launchGovernedRun, observeGovernedRun } from "../core/governed-run-service.js";
import type { RunProposal } from "../run-proposal.js";
import { RuntimeRegistry } from "./registry.js";
import type { RuntimeAdapter } from "./types.js";

const proposal = {
  schemaVersion: 1,
  runId: "run-20260817-abcdef0",
  createdAt: "2026-08-17T00:00:00.000Z",
  target: { repositoryUrl: "https://github.com/example/repo", defaultBranch: "master", baseCommit: "abcdef0" },
  manifestHash: "a".repeat(64),
  policyHash: "b".repeat(64),
  policy: {
    maxFeatures: 1,
    branchPrefix: "nightly",
    requireIsolatedWorktree: true,
    requireIndependentVerification: true,
    testCommands: ["npm test"],
    remotePushPolicy: "forbidden",
  },
  goals: ["test"],
  requiredChecks: ["npm test"],
  queue: [{ title: "Candidate", description: "A safe test", impact: 1, confidence: 1, ease: 1, iceSource: "test" }],
  notAttempted: [],
  remotePushPolicy: "forbidden",
} as unknown as RunProposal;

function fakeAdapter(id = "fake"): RuntimeAdapter {
  return {
    id,
    displayName: "Fake runtime",
    capabilities: {
      isolatedWorktree: true,
      asynchronousObservation: false,
      structuredResult: true,
      localRepositoryAccess: true,
      remoteEffects: "forbidden",
    },
    async preflight() {},
    async launch() {
      return {
        handle: { runtimeId: id, kind: "local-process", id: "handle-1", worktreePath: "/tmp/worktree", branchName: "nightly/test", metadata: {} },
        observation: {
          runtimeId: id,
          handleId: "handle-1",
          state: "completed",
          observedAt: "2026-08-17T00:00:01.000Z",
          sourceEventId: null,
          message: null,
          runtimeResult: null,
          metadata: {},
        },
      };
    },
  };
}

describe("RuntimeRegistry", () => {
  it("registers arbitrary adapter IDs and rejects duplicates or unknown IDs", () => {
    const registry = new RuntimeRegistry().register(fakeAdapter("codex"));
    expect(registry.ids()).toEqual(["codex"]);
    expect(registry.get("codex").displayName).toBe("Fake runtime");
    expect(() => registry.register(fakeAdapter("codex"))).toThrow("already registered");
    expect(() => registry.get("missing")).toThrow("Unknown runtime adapter");
  });
});

describe("generic adapter conformance", () => {
  it("enforces proposal pinning and emits provider-neutral lifecycle updates", async () => {
    const result = await launchGovernedRun({
      adapter: fakeAdapter(),
      repoRoot: "/repo",
      proposal,
      environment: { repositoryUrl: "https://github.com/example/repo.git", baseCommit: "abcdef0" },
    });
    expect(result.updates.map((update) => update.type)).toEqual(["workspace-prepared", "candidate-started", "task-completed"]);
  });

  it("rejects adapters that cannot satisfy the proposal isolation policy", async () => {
    const adapter = fakeAdapter();
    adapter.capabilities.isolatedWorktree = false;
    await expect(launchGovernedRun({
      adapter,
      repoRoot: "/repo",
      proposal,
      environment: { repositoryUrl: "https://github.com/example/repo", baseCommit: "abcdef0" },
    })).rejects.toThrow("isolated-worktree");
  });

  it("converts a passive adapter observation into a normalized task lifecycle update", async () => {
    const adapter = fakeAdapter("async");
    adapter.capabilities.asynchronousObservation = true;
    adapter.observe = async () => ({
      runtimeId: "async",
      handleId: "task-1",
      state: "awaiting-review",
      observedAt: "2026-08-17T00:00:02.000Z",
      sourceEventId: "event-1",
      message: "Task stopped",
      runtimeResult: null,
      metadata: { taskId: "task-1" },
    });
    const result = await observeGovernedRun({
      adapter,
      repoRoot: "/repo",
      proposal,
      handle: { runtimeId: "async", kind: "external-task", id: "task-1", metadata: {} },
    });
    expect(result.update).toEqual({
      type: "task-completed",
      payload: expect.objectContaining({ runtime: "async", sourceEventId: "event-1" }),
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { createRunProposal } from "./run-proposal.js";
import { buildRunPlan } from "./run-plan.js";
import { buildManusRunPrompt, createManusRunTask } from "./manus-runtime.js";
import type { TargetManifest } from "./target-manifest.js";

const ROADMAP = `# Roadmap

## Now

- [ ] Safe candidate — ICE 8/7/6
`;

const MANIFEST: TargetManifest = {
  schemaVersion: 1,
  repository: { url: "https://github.com/example/feature-inventor.git", defaultBranch: "master" },
  goals: ["Improve governed execution"],
  requiredChecks: ["npm test"],
  protectedPaths: [],
  reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: true },
  schedule: { mode: "manual" },
};

function proposalWithPolicy(remotePushPolicy: "forbidden" | "explicit-only" = "forbidden") {
  const plan = buildRunPlan(ROADMAP, { ...DEFAULT_RUN_POLICY, remotePushPolicy });
  return createRunProposal({
    runId: "run-20260817-001",
    createdAt: "2026-08-17T12:00:00.000Z",
    baseCommit: "abcdef1234567",
    manifest: MANIFEST,
    plan,
  });
}

describe("Manus runtime adapter", () => {
  it("builds a local-only task brief from one approved proposal", () => {
    const prompt = buildManusRunPrompt({
      apiKey: "test-key",
      repoUrl: "https://github.com/example/feature-inventor.git",
      proposal: proposalWithPolicy(),
    });

    expect(prompt).toContain("Run ID: run-20260817-001");
    expect(prompt).toContain("Approved base commit (authoritative): abcdef1234567");
    expect(prompt).toContain("Never substitute the current default branch");
    expect(prompt).toContain("Do NOT run git push");
    expect(prompt).toContain("Never modify main or master");
    expect(prompt).toContain("workflows/nightly.js");
  });

  it("permits only a review-branch push after both policy and invocation consent", () => {
    const prompt = buildManusRunPrompt({
      apiKey: "test-key",
      repoUrl: "https://github.com/example/feature-inventor.git",
      proposal: proposalWithPolicy("explicit-only"),
      allowRemotePush: true,
    });

    expect(prompt).toContain("You may push ONLY the dedicated review branch");
    expect(prompt).toContain("Never push, merge, or rewrite main/master");
  });

  it("creates an asynchronous private task with the configured project and connector", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          task_id: "abcdefghijklmnopqrstuv",
          task_url: "https://manus.im/app/abcdefghijklmnopqrstuv",
          task_title: "Feature Inventor — Manus run run-20260817-001",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const task = await createManusRunTask({
      apiKey: "test-key",
      repoUrl: "https://github.com/example/feature-inventor.git",
      proposal: proposalWithPolicy(),
      projectId: "project-1",
      githubConnectorId: "github-connector-1",
      fetchImpl,
    });

    expect(task.taskId).toBe("abcdefghijklmnopqrstuv");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.manus.ai/v2/task.create");
    expect(init?.headers).toMatchObject({ "x-manus-api-key": "test-key" });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      title: "Feature Inventor — Manus run run-20260817-001",
      project_id: "project-1",
      interactive_mode: false,
      share_visibility: "private",
      message: { connectors: ["github-connector-1"] },
    });
  });

  it("rejects a failed API response and an empty approved queue", async () => {
    const failedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { message: "permission denied" } }), { status: 403 }),
    );

    await expect(
      createManusRunTask({
        apiKey: "test-key",
        repoUrl: "https://github.com/example/feature-inventor.git",
        proposal: proposalWithPolicy(),
        fetchImpl: failedFetch,
      }),
    ).rejects.toThrow("permission denied");

    const emptyPlan = buildRunPlan("# Roadmap\n\n## Now\n", DEFAULT_RUN_POLICY);
    const emptyProposal = createRunProposal({
      runId: "run-20260817-002",
      createdAt: "2026-08-17T12:00:00.000Z",
      baseCommit: "abcdef1234567",
      manifest: MANIFEST,
      plan: emptyPlan,
    });
    await expect(
      createManusRunTask({
        apiKey: "test-key",
        repoUrl: "https://github.com/example/feature-inventor.git",
        proposal: emptyProposal,
      }),
    ).rejects.toThrow("No queued candidate");
  });
});

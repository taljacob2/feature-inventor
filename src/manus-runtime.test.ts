import { describe, expect, it, vi } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { buildRunPlan } from "./run-plan.js";
import { buildManusRunPrompt, createManusRunTask } from "./manus-runtime.js";

const ROADMAP = `# Roadmap

## Now

- [ ] Safe candidate — ICE 8/7/6
`;

function planWithPolicy(remotePushPolicy: "forbidden" | "explicit-only" = "forbidden") {
  return buildRunPlan(ROADMAP, { ...DEFAULT_RUN_POLICY, remotePushPolicy });
}

describe("Manus runtime adapter", () => {
  it("builds a local-only task brief by default", () => {
    const prompt = buildManusRunPrompt({
      apiKey: "test-key",
      repoUrl: "https://github.com/example/feature-inventor.git",
      plan: planWithPolicy(),
    });

    expect(prompt).toContain("Do NOT run git push");
    expect(prompt).toContain("Never modify main or master");
    expect(prompt).toContain("workflows/nightly.js");
  });

  it("permits only a review-branch push after both policy and invocation consent", () => {
    const prompt = buildManusRunPrompt({
      apiKey: "test-key",
      repoUrl: "https://github.com/example/feature-inventor.git",
      plan: planWithPolicy("explicit-only"),
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
          task_title: "Feature Inventor — Manus run",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const task = await createManusRunTask({
      apiKey: "test-key",
      repoUrl: "https://github.com/example/feature-inventor.git",
      plan: planWithPolicy(),
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
      project_id: "project-1",
      interactive_mode: false,
      share_visibility: "private",
      message: { connectors: ["github-connector-1"] },
    });
  });

  it("rejects a failed API response and an empty execution queue", async () => {
    const failedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { message: "permission denied" } }), { status: 403 }),
    );

    await expect(
      createManusRunTask({
        apiKey: "test-key",
        repoUrl: "https://github.com/example/feature-inventor.git",
        plan: planWithPolicy(),
        fetchImpl: failedFetch,
      }),
    ).rejects.toThrow("permission denied");

    const emptyPlan = buildRunPlan("# Roadmap\n\n## Now\n", DEFAULT_RUN_POLICY);
    await expect(
      createManusRunTask({
        apiKey: "test-key",
        repoUrl: "https://github.com/example/feature-inventor.git",
        plan: emptyPlan,
      }),
    ).rejects.toThrow("No open Now or Next candidate");
  });
});

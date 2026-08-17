import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runIndexBuild, runIndexContext, runIndexHeatmap, runIndexReport } from "../cli.js";
import { INDEX_ARTIFACT_FILENAMES, buildIndexSnapshot } from "./index-builder.js";
import { getIndexStatus } from "./index-status.js";
import { DEFAULT_INDEXING_CONFIG } from "./types.js";

const REGISTRY = `
version: 1
features:
  - id: sample
    name: Sample
    intent: Build a deterministic fixture index.
    entryPoints:
      - src/entry.ts#run
    primaryPaths:
      - src/entry.ts
      - src/service.ts
    tests:
      - src/entry.test.ts
    flows:
      - sample-flow
    riskTags:
      - lifecycle-state
flows:
  - id: sample-flow
    name: Sample flow
    startsAt:
      - src/entry.ts#run
    steps:
      - source: src/entry.ts#run
        role: command-dispatch
`;

const MANIFEST = JSON.stringify(
  {
    schemaVersion: 1,
    repository: { url: "https://github.com/example/index-fixture.git", defaultBranch: "master" },
    goals: ["Exercise repository indexing"],
    requiredChecks: ["npm test"],
    protectedPaths: [],
    reviewPolicy: { maxFilesChanged: 10, humanApprovalRequired: true },
    schedule: { mode: "manual" },
    indexing: { enabled: true, historyDays: 90, defaultContextPack: "change", maxEstimatedTokens: 4000, includeGovernedArtifacts: true },
  },
  null,
  2,
);

describe("index snapshot builder and commands", () => {
  const directories: string[] = [];

  function createGitFixture(): { directory: string; commit: string } {
    const directory = mkdtempSync(join(tmpdir(), "feature-inventor-index-builder-"));
    directories.push(directory);
    execFileSync("git", ["init"], { cwd: directory, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory });
    mkdir(directory, "docs/indexing");
    mkdir(directory, "src");
    writeFileSync(join(directory, ".gitignore"), ".feature-inventor/\n", "utf8");
    writeFileSync(join(directory, "INDEX.md"), "# Fixture Index\n", "utf8");
    writeFileSync(join(directory, "feature-inventor.target.json"), MANIFEST, "utf8");
    writeFileSync(join(directory, "docs/indexing/features.yml"), REGISTRY, "utf8");
    writeFileSync(join(directory, "src/entry.ts"), 'import { service } from "./service.js";\nexport function run(): string { return service(); }\n', "utf8");
    writeFileSync(join(directory, "src/service.ts"), 'export function service(): string { return "ok"; }\n', "utf8");
    writeFileSync(join(directory, "src/entry.test.ts"), 'import { run } from "./entry.js";\nexport {};\n', "utf8");
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: directory });
    return { directory, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim() };
  }

  function mkdir(root: string, path: string): void {
    execFileSync("mkdir", ["-p", join(root, path)]);
  }

  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("persists deterministic commit-pinned artifact files and returns a fresh status", async () => {
    const { directory, commit } = createGitFixture();
    const first = await buildIndexSnapshot(directory, commit, DEFAULT_INDEXING_CONFIG);
    const firstContents = Object.values(INDEX_ARTIFACT_FILENAMES).map((filename) => readFileSync(join(first.snapshotDirectory, filename), "utf8"));
    const second = await buildIndexSnapshot(directory, commit, DEFAULT_INDEXING_CONFIG);
    const secondContents = Object.values(INDEX_ARTIFACT_FILENAMES).map((filename) => readFileSync(join(second.snapshotDirectory, filename), "utf8"));

    expect(firstContents).toEqual(secondContents);
    for (const filename of Object.values(INDEX_ARTIFACT_FILENAMES)) expect(existsSync(join(first.snapshotDirectory, filename))).toBe(true);
    expect(first.graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: "src/entry.ts", target: "src/service.ts" })]));
    expect(first.report.limitations.join(" ")).toContain("not runtime or user usage");
    expect(getIndexStatus(directory, DEFAULT_INDEXING_CONFIG, commit, true).state).toBe("fresh");
  });

  it("builds and queries an explicit heatmap lens through the CLI helpers", async () => {
    const { directory } = createGitFixture();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runIndexBuild(directory, { json: true });
    const buildData = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(buildData.metadata.targetCommit).toMatch(/^[0-9a-f]{40}$/);

    await runIndexHeatmap(directory, ["--by", "centrality", "--limit", "1", "--json"]);
    const heatmapData = JSON.parse(String(logSpy.mock.calls[1]?.[0]));
    expect(heatmapData).toMatchObject({ lens: "centrality" });
    expect(heatmapData.rows).toHaveLength(1);

    await runIndexReport(directory, { json: true });
    const reportData = JSON.parse(String(logSpy.mock.calls[2]?.[0]));
    expect(reportData.status.state).toBe("fresh");
    expect(reportData.report).toContain("Generated Repository Index Report");

    await runIndexContext(directory, ["--feature", "sample", "--max-tokens", "500", "--json"]);
    const contextData = JSON.parse(String(logSpy.mock.calls[3]?.[0]));
    expect(contextData.pack.provenance).toMatchObject({ selector: { kind: "feature", value: "sample" }, effectiveMaxEstimatedTokens: 500 });
    expect(existsSync(contextData.artifactPaths.jsonPath)).toBe(true);
  });

  it("refuses context generation when the indexed snapshot is no longer fresh", async () => {
    const { directory } = createGitFixture();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runIndexBuild(directory);
    writeFileSync(join(directory, "src", "service.ts"), "export function service(): string { return \"changed\"; }\n", "utf8");

    await expect(runIndexContext(directory, ["--feature", "sample"])).rejects.toThrow("requires a fresh snapshot; current state is dirty");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses a build from a dirty checkout rather than claiming artifacts match a commit", async () => {
    const { directory } = createGitFixture();
    writeFileSync(join(directory, "src", "entry.ts"), "export function run(): string { return \"dirty\"; }\n", "utf8");

    await expect(runIndexBuild(directory)).rejects.toThrow("requires a clean working tree");
  });
});

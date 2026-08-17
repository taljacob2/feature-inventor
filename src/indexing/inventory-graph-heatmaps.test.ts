import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildHistoricalActivity } from "./git-history.js";
import { buildHeatmaps, rowsForHeatmapLens } from "./heatmaps.js";
import { buildRepositoryInventory } from "./inventory.js";
import { buildTypeScriptModuleGraph } from "./typescript-graph.js";
import type { FeatureRegistry, HistoricalActivity } from "./types.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const REGISTRY: FeatureRegistry = {
  version: 1,
  features: [
    {
      id: "sample",
      name: "Sample",
      intent: "Exercise graph extraction.",
      entryPoints: ["src/entry.ts#run"],
      primaryPaths: ["src/entry.ts", "src/service.ts"],
      tests: ["src/entry.test.ts"],
      flows: ["sample-flow"],
      riskTags: ["lifecycle-state"],
    },
  ],
  flows: [
    {
      id: "sample-flow",
      name: "Sample flow",
      startsAt: ["src/entry.ts#run"],
      steps: [{ source: "src/entry.ts#run", role: "entry" }],
    },
  ],
};

describe("inventory, TypeScript graph, and heatmap lenses", () => {
  const directories: string[] = [];

  function createFixture(): string {
    const directory = mkdtempSync(join(tmpdir(), "feature-inventor-index-graph-"));
    directories.push(directory);
    mkdirSync(join(directory, "src"));
    mkdirSync(join(directory, "node_modules", "ignored"), { recursive: true });
    writeFileSync(join(directory, "src", "entry.ts"), 'import { service } from "./service.js";\nexport function run(): string { return service(); }\n', "utf8");
    writeFileSync(join(directory, "src", "service.ts"), 'export function service(): string { return "ok"; }\n', "utf8");
    writeFileSync(join(directory, "src", "entry.test.ts"), 'import { run } from "./entry.js";\nexport {};\n', "utf8");
    writeFileSync(join(directory, "src", "external.ts"), 'import { packageValue } from "package-value";\nexport const value = packageValue;\n', "utf8");
    writeFileSync(join(directory, "README.md"), "# Fixture\n", "utf8");
    writeFileSync(join(directory, "package.json"), "{}\n", "utf8");
    writeFileSync(join(directory, "node_modules", "ignored", "index.ts"), "export {};\n", "utf8");
    return directory;
  }

  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
  });

  it("builds a sorted inventory and resolves NodeNext .js specifiers to indexed TypeScript modules", () => {
    const directory = createFixture();
    const inventory = buildRepositoryInventory(directory, COMMIT);
    expect(inventory.files.map((file) => file.path)).toEqual([
      "package.json",
      "README.md",
      "src/entry.test.ts",
      "src/entry.ts",
      "src/external.ts",
      "src/service.ts",
    ]);
    expect(inventory.totals).toMatchObject({ sourceFiles: 3, testFiles: 1, documentationFiles: 1, configurationFiles: 1 });

    const graph = buildTypeScriptModuleGraph(directory, COMMIT, inventory.files);
    expect(graph.nodes.find((node) => node.path === "src/entry.ts")?.exports).toEqual(["run"]);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "src/entry.ts", target: "src/service.ts", specifier: "./service.js", external: false }),
        expect.objectContaining({ source: "src/entry.test.ts", target: "src/entry.ts", specifier: "./entry.js", external: false }),
        expect.objectContaining({ source: "src/external.ts", target: null, specifier: "package-value", external: true }),
      ]),
    );
  });

  it("keeps centrality, churn, and test linkage separate while exposing raw evidence", () => {
    const directory = createFixture();
    const inventory = buildRepositoryInventory(directory, COMMIT);
    const graph = buildTypeScriptModuleGraph(directory, COMMIT, inventory.files);
    const history: HistoricalActivity = {
      generatedForCommit: COMMIT,
      historyDays: 90,
      commitsScanned: 3,
      files: [
        { path: "src/entry.ts", commits: 2, additions: 5, deletions: 1, changedLines: 6 },
        { path: "src/service.ts", commits: 1, additions: 3, deletions: 0, changedLines: 3 },
      ],
      complete: true,
      warnings: [],
    };
    const heatmaps = buildHeatmaps(graph, history, REGISTRY);
    const entry = heatmaps.rows.find((row) => row.path === "src/entry.ts");
    expect(entry).toMatchObject({ reachability: 1, fanIn: 1, fanOut: 1, centrality: 2, churnCommits: 2, churnChangedLines: 6, testLinks: 1 });
    expect(entry?.evidence).toEqual({ entryPoint: true, featureIds: ["sample"] });
    expect(rowsForHeatmapLens(heatmaps.rows, "churn", 1)[0]?.path).toBe("src/entry.ts");
    expect(rowsForHeatmapLens(heatmaps.rows, "centrality", 1)[0]?.path).toBe("src/entry.ts");
    expect(heatmaps.limitations.join(" ")).toContain("not runtime or user usage");
  });

  it("aggregates Git activity against the indexed commit rather than the wall clock", async () => {
    const directory = createFixture();
    execFileSync("git", ["init"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory });
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync("git", ["commit", "-m", "first"], { cwd: directory });
    writeFileSync(join(directory, "src", "service.ts"), 'export function service(): string { return "changed"; }\n', "utf8");
    execFileSync("git", ["add", "src/service.ts"], { cwd: directory });
    execFileSync("git", ["commit", "-m", "second"], { cwd: directory });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();

    const history = await buildHistoricalActivity(directory, commit, 90);
    expect(history.complete).toBe(true);
    expect(history.commitsScanned).toBe(2);
    expect(history.files.find((file) => file.path === "src/service.ts")).toMatchObject({ commits: 2, changedLines: expect.any(Number) });
  });
});

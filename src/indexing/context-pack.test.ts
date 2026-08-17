import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildContextPack, formatContextPack, persistContextPack, readContextPack } from "./context-pack.js";
import { resolveContextScope } from "./context-scope.js";
import type { ContextPackProvenance, FeatureRegistry, ModuleGraph } from "./types.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const REGISTRY: FeatureRegistry = {
  version: 1,
  features: [
    {
      id: "sample",
      name: "Sample feature",
      intent: "Exercise context-pack selection.",
      entryPoints: ["src/entry.ts#runFeature"],
      primaryPaths: ["src/service.ts"],
      tests: ["src/entry.test.ts"],
      flows: ["sample-flow"],
      riskTags: ["lifecycle-state"],
    },
  ],
  flows: [
    {
      id: "sample-flow",
      name: "Sample flow",
      startsAt: ["src/entry.ts#runFeature"],
      steps: [
        { source: "src/entry.ts#runFeature", role: "command-dispatch" },
        { source: "src/service.ts#performService", role: "implementation" },
      ],
    },
  ],
};

const GRAPH: ModuleGraph = {
  generatedForCommit: COMMIT,
  language: "typescript",
  nodes: [
    { path: "src/entry.ts", language: "typescript", exports: ["runFeature"], isTest: false },
    { path: "src/service.ts", language: "typescript", exports: ["performService"], isTest: false },
    { path: "src/helper.ts", language: "typescript", exports: ["helper"], isTest: false },
    { path: "src/entry.test.ts", language: "typescript", exports: [], isTest: true },
  ],
  edges: [
    { source: "src/entry.ts", target: "src/service.ts", specifier: "./service.js", kind: "import", external: false },
    { source: "src/service.ts", target: "src/helper.ts", specifier: "./helper.js", kind: "import", external: false },
    { source: "src/entry.test.ts", target: "src/entry.ts", specifier: "./entry.js", kind: "import", external: false },
  ],
  warnings: [],
};

function provenance(): Omit<ContextPackProvenance, "effectiveMaxEstimatedTokens"> {
  return {
    targetCommit: COMMIT,
    snapshotPath: `/repo/.feature-inventor/index/v1/${COMMIT}`,
    indexSchemaVersion: 1,
    snapshotConfigDigest: "sha256:fixture",
    selector: { kind: "feature", value: "sample" },
    packKind: "change",
    requestedMaxEstimatedTokens: 4000,
  };
}

describe("context pack", () => {
  const directories: string[] = [];

  function createFixture(): string {
    const directory = mkdtempSync(join(tmpdir(), "feature-inventor-context-pack-"));
    directories.push(directory);
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "src", "entry.ts"), ["import { performService } from \"./service.js\";", "", "export function runFeature(): string {", "  return performService();", "}", ""].join("\n"), "utf8");
    writeFileSync(join(directory, "src", "service.ts"), ["import { helper } from \"./helper.js\";", "", "export function performService(): string {", "  return helper();", "}", "", ...Array.from({ length: 70 }, (_, index) => `// service context line ${index}`), ""].join("\n"), "utf8");
    writeFileSync(join(directory, "src", "helper.ts"), "export function helper(): string { return \"ok\"; }\n", "utf8");
    writeFileSync(join(directory, "src", "entry.test.ts"), "import { runFeature } from \"./entry.js\";\nexport {};\n", "utf8");
    return directory;
  }

  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
  });

  it("resolves feature and command selectors through the curated entry-point map", () => {
    const featureItems = resolveContextScope(REGISTRY, { kind: "feature", value: "sample" });
    expect(featureItems.map((item) => `${item.anchor.path}#${item.anchor.symbol ?? ""}`)).toEqual(
      expect.arrayContaining(["src/entry.ts#runFeature", "src/service.ts#", "src/entry.test.ts#", "src/service.ts#performService"]),
    );
    expect(featureItems.find((item) => item.anchor.symbol === "runFeature")?.priority).toBe(100);

    const commandItems = resolveContextScope(REGISTRY, { kind: "command", value: "runFeature" });
    expect(commandItems[0]).toMatchObject({ anchor: { path: "src/entry.ts", symbol: "runFeature" }, priority: 100 });
  });

  it("keeps direct scope ahead of graph neighbors, enforces a hard token budget, and reports overflow", () => {
    const directory = createFixture();
    const scopeItems = resolveContextScope(REGISTRY, { kind: "feature", value: "sample" });
    const pack = buildContextPack({ repoRoot: directory, graph: GRAPH, scopeItems, provenance: provenance(), maxEstimatedTokens: 390 });

    expect(pack.estimatedTokens).toBeLessThanOrEqual(390);
    expect(pack.selected[0]).toMatchObject({ anchor: { path: "src/entry.ts", symbol: "runFeature" }, priority: 100 });
    expect(pack.overflow).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "budget-exceeded" })]));
    expect([...pack.selected, ...pack.overflow].some((item) => item.anchor.path === "src/helper.ts")).toBe(true);
    expect(pack.readingRules.join(" ")).toContain("not a substitute");
  });

  it("renders source-linked excerpts and persists stable machine and Markdown pack artifacts", () => {
    const directory = createFixture();
    const scopeItems = resolveContextScope(REGISTRY, { kind: "flow", value: "sample-flow" });
    const first = buildContextPack({ repoRoot: directory, graph: GRAPH, scopeItems, provenance: { ...provenance(), selector: { kind: "flow", value: "sample-flow" } } });
    const second = buildContextPack({ repoRoot: directory, graph: GRAPH, scopeItems, provenance: { ...provenance(), selector: { kind: "flow", value: "sample-flow" } } });
    expect(first).toEqual(second);
    const markdown = formatContextPack(first);
    expect(markdown).toContain("Target commit");
    expect(markdown).toContain("src/entry.ts#runFeature");
    expect(markdown).toContain("Reading Rules");

    const snapshotDirectory = join(directory, ".feature-inventor", "index", "v1", COMMIT);
    const paths = persistContextPack(snapshotDirectory, first);
    expect(readContextPack(paths.jsonPath)).toEqual(first);
    expect(readFileSync(paths.markdownPath, "utf8")).toBe(markdown);
  });

  it("fails before silently creating a pack when the fixed metadata overhead consumes the requested budget", () => {
    const directory = createFixture();
    const scopeItems = resolveContextScope(REGISTRY, { kind: "path", value: "src/entry.ts#runFeature" });
    expect(() => buildContextPack({ repoRoot: directory, graph: GRAPH, scopeItems, provenance: provenance(), maxEstimatedTokens: 320 })).toThrow(
      "must exceed fixed overhead",
    );
  });
});

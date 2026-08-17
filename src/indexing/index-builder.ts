import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { formatRegistryValidation, validateFeatureRegistryFile } from "./feature-registry.js";
import { buildHistoricalActivity } from "./git-history.js";
import { buildHeatmaps, rowsForHeatmapLens } from "./heatmaps.js";
import { createIndexConfigDigest, indexSnapshotDirectory } from "./index-status.js";
import { buildRepositoryInventory } from "./inventory.js";
import { buildSourceModuleGraph } from "./typescript-graph.js";
import {
  INDEX_SCHEMA_VERSION,
  type HeatmapLens,
  type IndexBuildResult,
  type IndexReport,
  type IndexSnapshotMetadata,
  type IndexingConfig,
} from "./types.js";

const execFileAsync = promisify(execFile);
export const INDEX_ARTIFACT_FILENAMES = {
  inventory: "inventory.json",
  graph: "graph.json",
  history: "history.json",
  heatmaps: "heatmaps.json",
  report: "report.md",
} as const;

async function gitCommitTimestamp(repoRoot: string, commit: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["show", "-s", "--format=%cI", commit], { cwd: repoRoot });
  const timestamp = stdout.trim();
  if (timestamp === "") throw new Error(`Could not determine timestamp for commit ${commit}`);
  return timestamp;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function markdownTable(rows: Array<[string, string]>): string {
  return ["| Measure | Value |", "|---|---:|", ...rows.map(([label, value]) => `| ${label} | ${value} |`)].join("\n");
}

function topTable(report: IndexReport, lens: HeatmapLens): string {
  const rows = report.topByLens[lens];
  if (rows.length === 0) return "No indexed source modules were available.";
  const value = (row: (typeof rows)[number]): number => {
    switch (lens) {
      case "reachability":
        return row.reachability;
      case "centrality":
        return row.centrality;
      case "churn":
        return row.churnChangedLines;
      case "test-linkage":
        return row.testLinks;
    }
  };
  return ["| Path | Value | Fan-in | Fan-out | Churn commits | Test links |", "|---|---:|---:|---:|---:|---:|", ...rows.map((row) => `| ${row.path} | ${value(row)} | ${row.fanIn} | ${row.fanOut} | ${row.churnCommits} | ${row.testLinks} |`)].join("\n");
}

function formatIndexReport(report: IndexReport): string {
  const sections = [
    "# Generated Repository Index Report",
    "",
    `- **Target commit:** \`${report.generatedForCommit}\``,
    "- **Evidence boundary:** Structural metrics, Git activity, and test linkage are separate lenses. They do not represent application runtime or user usage.",
    "",
    "## Inventory",
    "",
    markdownTable([
      ["Files", String(report.inventory.files)],
      ["Source files", String(report.inventory.sourceFiles)],
      ["Test files", String(report.inventory.testFiles)],
      ["Documentation files", String(report.inventory.documentationFiles)],
      ["Configuration files", String(report.inventory.configurationFiles)],
      ["Bytes", String(report.inventory.bytes)],
    ]),
    "",
    "## Graph and History",
    "",
    markdownTable([
      ["Indexed source modules", String(report.graph.nodes)],
      ["Module relationships", String(report.graph.edges)],
      ["External or unresolved relationships", String(report.graph.unresolvedEdges)],
      ["Git commits scanned", String(report.history.commitsScanned)],
      ["Files with Git activity", String(report.history.filesWithActivity)],
    ]),
    "",
    "## Structural Centrality",
    "",
    topTable(report, "centrality"),
    "",
    "## Historical Churn",
    "",
    topTable(report, "churn"),
    "",
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "",
  ];
  return sections.join("\n");
}

function createReport(result: Omit<IndexBuildResult, "report">): IndexReport {
  const lenses: HeatmapLens[] = ["reachability", "centrality", "churn", "test-linkage"];
  return {
    generatedForCommit: result.metadata.targetCommit,
    inventory: result.inventory.totals,
    graph: {
      nodes: result.graph.nodes.length,
      edges: result.graph.edges.filter((edge) => edge.target !== null).length,
      unresolvedEdges: result.graph.edges.filter((edge) => edge.target === null).length,
    },
    history: {
      commitsScanned: result.history.commitsScanned,
      filesWithActivity: result.history.files.length,
    },
    topByLens: Object.fromEntries(lenses.map((lens) => [lens, rowsForHeatmapLens(result.heatmaps.rows, lens, 10)])) as IndexReport["topByLens"],
    limitations: [...result.heatmaps.limitations, ...result.graph.warnings, ...result.history.warnings],
  };
}

/** Builds and persists one local snapshot from a clean checkout at an exact commit. */
export async function buildIndexSnapshot(
  repoRoot: string,
  targetCommit: string,
  config: IndexingConfig,
): Promise<IndexBuildResult> {
  if (!config.enabled) throw new Error("Indexing is disabled by the target manifest");
  const validation = validateFeatureRegistryFile(repoRoot);
  if (!validation.valid || validation.registry === null) throw new Error(formatRegistryValidation(validation));

  const [generatedAt, history] = await Promise.all([
    gitCommitTimestamp(repoRoot, targetCommit),
    buildHistoricalActivity(repoRoot, targetCommit, config.historyDays),
  ]);
  const inventory = buildRepositoryInventory(repoRoot, targetCommit);
  const graph = buildSourceModuleGraph(repoRoot, targetCommit, inventory.files);
  const heatmaps = buildHeatmaps(graph, history, validation.registry);
  const metadata: IndexSnapshotMetadata = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatorVersion: "feature-inventor 0.1.0",
    targetCommit,
    // Commit timestamp keeps a rebuild of an unchanged checkout byte-stable.
    generatedAt,
    configDigest: createIndexConfigDigest(config),
    sources: {
      code: true,
      gitHistoryDays: config.historyDays,
      governedArtifacts: false,
      runtimeTelemetry: false,
      complete: graph.warnings.length === 0 && history.complete,
    },
  };
  const snapshotDirectory = indexSnapshotDirectory(repoRoot, targetCommit);
  const partial = { metadata, inventory, graph, history, heatmaps, snapshotDirectory };
  const report = createReport(partial);
  mkdirSync(snapshotDirectory, { recursive: true });
  writeJson(join(snapshotDirectory, "metadata.json"), metadata);
  writeJson(join(snapshotDirectory, INDEX_ARTIFACT_FILENAMES.inventory), inventory);
  writeJson(join(snapshotDirectory, INDEX_ARTIFACT_FILENAMES.graph), graph);
  writeJson(join(snapshotDirectory, INDEX_ARTIFACT_FILENAMES.history), history);
  writeJson(join(snapshotDirectory, INDEX_ARTIFACT_FILENAMES.heatmaps), heatmaps);
  writeFileSync(join(snapshotDirectory, INDEX_ARTIFACT_FILENAMES.report), formatIndexReport(report), "utf8");
  return { ...partial, report };
}

/** Reads a generated JSON artifact. Snapshot freshness is assessed by the caller. */
export function readIndexArtifact<T>(snapshotDirectory: string, filename: string): T {
  return JSON.parse(readFileSync(join(snapshotDirectory, filename), "utf8")) as T;
}

export function readIndexReport(snapshotDirectory: string): string {
  return readFileSync(join(snapshotDirectory, INDEX_ARTIFACT_FILENAMES.report), "utf8");
}

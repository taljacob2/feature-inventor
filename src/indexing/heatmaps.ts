import { type FeatureRegistry, type HeatmapLens, type HeatmapRow, type HeatmapsArtifact, type HistoricalActivity, type ModuleGraph } from "./types.js";

function sourcePath(reference: string): string {
  return reference.split("#", 1)[0] ?? reference;
}

function featurePaths(registry: FeatureRegistry): Map<string, Set<string>> {
  const paths = new Map<string, Set<string>>();
  for (const feature of registry.features) {
    const references = [...feature.entryPoints, ...feature.primaryPaths, ...feature.tests];
    for (const reference of references) {
      const path = sourcePath(reference);
      const featureIds = paths.get(path) ?? new Set<string>();
      featureIds.add(feature.id);
      paths.set(path, featureIds);
    }
  }
  return paths;
}

function testLinkCounts(graph: ModuleGraph): Map<string, number> {
  const counts = new Map<string, number>();
  const testPaths = new Set(graph.nodes.filter((node) => node.isTest).map((node) => node.path));
  for (const edge of graph.edges) {
    if (!testPaths.has(edge.source) || edge.target === null) continue;
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }
  return counts;
}

function structuralCounts(graph: ModuleGraph): { fanIn: Map<string, number>; fanOut: Map<string, number> } {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.target === null) continue;
    fanOut.set(edge.source, (fanOut.get(edge.source) ?? 0) + 1);
    fanIn.set(edge.target, (fanIn.get(edge.target) ?? 0) + 1);
  }
  return { fanIn, fanOut };
}

/**
 * Produces incomparable-but-complementary evidence lenses. Centrality measures
 * indexed module relationships, while churn records Git activity; neither is a
 * claim about user-facing or production execution frequency.
 */
export function buildHeatmaps(graph: ModuleGraph, history: HistoricalActivity, registry: FeatureRegistry): HeatmapsArtifact {
  const historicalByPath = new Map(history.files.map((file) => [file.path, file]));
  const knownFeatures = featurePaths(registry);
  const entryPoints = new Set(registry.features.flatMap((feature) => feature.entryPoints.map(sourcePath)));
  const testLinks = testLinkCounts(graph);
  const { fanIn, fanOut } = structuralCounts(graph);
  const rows: HeatmapRow[] = graph.nodes
    .filter((node) => !node.isTest)
    .map((node) => {
      const inCount = fanIn.get(node.path) ?? 0;
      const outCount = fanOut.get(node.path) ?? 0;
      const historical = historicalByPath.get(node.path);
      return {
        path: node.path,
        reachability: entryPoints.has(node.path) ? 1 : 0,
        fanIn: inCount,
        fanOut: outCount,
        centrality: inCount + outCount,
        churnCommits: historical?.commits ?? 0,
        churnChangedLines: historical?.changedLines ?? 0,
        testLinks: testLinks.get(node.path) ?? 0,
        evidence: {
          entryPoint: entryPoints.has(node.path),
          featureIds: [...(knownFeatures.get(node.path) ?? [])].sort((left, right) => left.localeCompare(right)),
        },
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    generatedForCommit: graph.generatedForCommit,
    historyDays: history.historyDays,
    rows,
    limitations: [
      "Reachability marks only explicitly declared feature entry points; it is not a full call graph.",
      "Centrality counts resolved indexed TypeScript, JavaScript, and Svelte-script import and export relationships; external and unresolved imports are excluded.",
      "Churn is Git commit and changed-line activity anchored to the indexed commit; it is not runtime or user usage.",
      "Test linkage counts direct imports from indexed test files; it is not test coverage.",
      "No target application runtime telemetry is collected or represented.",
    ],
  };
}

function valueForLens(row: HeatmapRow, lens: HeatmapLens): number {
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
}

/** Sorts one requested evidence lens without blending it with other dimensions. */
export function rowsForHeatmapLens(rows: readonly HeatmapRow[], lens: HeatmapLens, limit?: number): HeatmapRow[] {
  const sorted = [...rows].sort((left, right) => valueForLens(right, lens) - valueForLens(left, lens) || left.path.localeCompare(right.path));
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

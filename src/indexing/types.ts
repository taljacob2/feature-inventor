export const INDEX_SCHEMA_VERSION = 1 as const;
export const INDEX_ROOT_DIRECTORY = ".feature-inventor/index";
export const INDEX_FEATURE_REGISTRY_PATH = "docs/indexing/features.yml";
export const INDEX_ROOT_DOCUMENT_PATH = "INDEX.md";

export type ContextPackKind = "orientation" | "change" | "verification" | "deep";

export interface IndexingConfig {
  enabled: boolean;
  historyDays: number;
  defaultContextPack: ContextPackKind;
  maxEstimatedTokens: number;
  includeGovernedArtifacts: boolean;
}

export const DEFAULT_INDEXING_CONFIG: IndexingConfig = {
  enabled: true,
  historyDays: 90,
  defaultContextPack: "change",
  maxEstimatedTokens: 4_000,
  includeGovernedArtifacts: true,
};

export interface IndexSourceCoverage {
  code: boolean;
  gitHistoryDays: number;
  governedArtifacts: boolean;
  runtimeTelemetry: boolean;
  complete: boolean;
}

/** The commit-pinned envelope written by a future deterministic index builder. */
export interface IndexSnapshotMetadata {
  schemaVersion: typeof INDEX_SCHEMA_VERSION;
  generatorVersion: string;
  targetCommit: string;
  generatedAt: string;
  configDigest: string;
  sources: IndexSourceCoverage;
}

export type IndexStatusState = "disabled" | "not-initialized" | "fresh" | "stale" | "dirty" | "incomplete" | "unavailable";

export interface IndexStatus {
  state: IndexStatusState;
  enabled: boolean;
  targetCommit: string | null;
  workspaceClean: boolean | null;
  snapshotPath: string | null;
  snapshot: IndexSnapshotMetadata | null;
  warnings: string[];
}

export interface SourceAnchor {
  path: string;
  symbol: string | null;
}

export interface IndexedFeature {
  id: string;
  name: string;
  intent: string;
  entryPoints: string[];
  primaryPaths: string[];
  tests: string[];
  flows: string[];
  riskTags: string[];
}

export interface IndexedFlowStep {
  source: string;
  role: string;
}

export interface IndexedFlow {
  id: string;
  name: string;
  startsAt: string[];
  steps: IndexedFlowStep[];
}

export interface FeatureRegistry {
  version: typeof INDEX_SCHEMA_VERSION;
  features: IndexedFeature[];
  flows: IndexedFlow[];
}

export interface RegistryDiagnostic {
  path: string;
  message: string;
}

export interface RegistryValidation {
  registry: FeatureRegistry | null;
  diagnostics: RegistryDiagnostic[];
  valid: boolean;
}

export type RepositoryFileKind = "source" | "test" | "documentation" | "configuration" | "other";

export interface RepositoryInventoryFile {
  path: string;
  kind: RepositoryFileKind;
  language: string | null;
  bytes: number;
}

export interface RepositoryInventory {
  generatedForCommit: string;
  files: RepositoryInventoryFile[];
  totals: {
    files: number;
    sourceFiles: number;
    testFiles: number;
    documentationFiles: number;
    configurationFiles: number;
    bytes: number;
  };
  ignoredDirectories: string[];
}

export type ModuleEdgeKind = "import" | "export-from" | "dynamic-import";

export interface ModuleGraphNode {
  path: string;
  language: "typescript";
  exports: string[];
  isTest: boolean;
}

export interface ModuleGraphEdge {
  source: string;
  target: string | null;
  specifier: string;
  kind: ModuleEdgeKind;
  /** True when the import could not be resolved to an indexed repository module. */
  external: boolean;
}

export interface ModuleGraph {
  generatedForCommit: string;
  language: "typescript";
  nodes: ModuleGraphNode[];
  edges: ModuleGraphEdge[];
  warnings: string[];
}

export interface HistoricalFileActivity {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  changedLines: number;
}

export interface HistoricalActivity {
  generatedForCommit: string;
  historyDays: number;
  commitsScanned: number;
  files: HistoricalFileActivity[];
  complete: boolean;
  warnings: string[];
}

export type HeatmapLens = "reachability" | "centrality" | "churn" | "test-linkage";

export interface HeatmapRow {
  path: string;
  reachability: number;
  fanIn: number;
  fanOut: number;
  centrality: number;
  churnCommits: number;
  churnChangedLines: number;
  testLinks: number;
  evidence: {
    entryPoint: boolean;
    featureIds: string[];
  };
}

export interface HeatmapsArtifact {
  generatedForCommit: string;
  historyDays: number;
  rows: HeatmapRow[];
  limitations: string[];
}

export interface IndexReport {
  generatedForCommit: string;
  inventory: RepositoryInventory["totals"];
  graph: {
    nodes: number;
    edges: number;
    unresolvedEdges: number;
  };
  history: {
    commitsScanned: number;
    filesWithActivity: number;
  };
  topByLens: Record<HeatmapLens, HeatmapRow[]>;
  limitations: string[];
}

export interface IndexBuildResult {
  metadata: IndexSnapshotMetadata;
  inventory: RepositoryInventory;
  graph: ModuleGraph;
  history: HistoricalActivity;
  heatmaps: HeatmapsArtifact;
  report: IndexReport;
  snapshotDirectory: string;
}

export const CONTEXT_PACK_DEFAULT_TOKEN_BUDGETS: Record<ContextPackKind, number> = {
  orientation: 1_500,
  change: 4_000,
  verification: 3_000,
  deep: 8_000,
};

export type ContextSelectorKind = "feature" | "flow" | "path" | "command";

export interface ContextSelector {
  kind: ContextSelectorKind;
  value: string;
}

export type ContextEvidenceType =
  | "explicit-scope"
  | "curated-feature-map"
  | "declared-flow"
  | "direct-test"
  | "source-graph-dependency"
  | "source-graph-dependent";

export interface ContextSourceAnchor {
  path: string;
  symbol: string | null;
}

export interface ContextSelection {
  anchor: ContextSourceAnchor;
  priority: number;
  selectionReasons: string[];
  evidenceTypes: ContextEvidenceType[];
  lineStart: number;
  lineEnd: number;
  estimatedTokens: number;
  content: string;
}

export interface ContextOverflowItem {
  anchor: ContextSourceAnchor;
  priority: number;
  selectionReasons: string[];
  evidenceTypes: ContextEvidenceType[];
  estimatedTokens: number;
  reason: "budget-exceeded";
}

export interface ContextPackProvenance {
  targetCommit: string;
  snapshotPath: string;
  indexSchemaVersion: typeof INDEX_SCHEMA_VERSION;
  snapshotConfigDigest: string;
  selector: ContextSelector;
  packKind: ContextPackKind;
  requestedMaxEstimatedTokens: number;
  effectiveMaxEstimatedTokens: number;
}

export interface ContextPack {
  id: string;
  provenance: ContextPackProvenance;
  fixedOverheadEstimatedTokens: number;
  estimatedTokens: number;
  selected: ContextSelection[];
  overflow: ContextOverflowItem[];
  readingRules: string[];
}

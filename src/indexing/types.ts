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

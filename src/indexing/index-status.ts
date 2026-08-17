import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INDEX_ROOT_DIRECTORY,
  INDEX_SCHEMA_VERSION,
  type IndexSnapshotMetadata,
  type IndexStatus,
  type IndexingConfig,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string`);
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
  return value;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${path} must be a non-negative integer`);
  return value;
}

/** Returns the canonical local directory for one commit-pinned snapshot. */
export function indexSnapshotDirectory(repoRoot: string, targetCommit: string): string {
  return join(repoRoot, INDEX_ROOT_DIRECTORY, `v${INDEX_SCHEMA_VERSION}`, targetCommit);
}

export function indexSnapshotMetadataPath(repoRoot: string, targetCommit: string): string {
  return join(indexSnapshotDirectory(repoRoot, targetCommit), "metadata.json");
}

/** A stable digest lets a snapshot prove which indexing policy produced it. */
export function createIndexConfigDigest(config: IndexingConfig): string {
  const canonical = JSON.stringify({
    defaultContextPack: config.defaultContextPack,
    enabled: config.enabled,
    historyDays: config.historyDays,
    includeGovernedArtifacts: config.includeGovernedArtifacts,
    maxEstimatedTokens: config.maxEstimatedTokens,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/** Parses the schema envelope only; artifact-specific payloads are validated by their own future readers. */
export function parseIndexSnapshotMetadata(content: string): IndexSnapshotMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid index metadata: ${reason}`);
  }
  if (!isRecord(parsed)) throw new Error("Invalid index metadata: root must be an object");
  if (parsed.schemaVersion !== INDEX_SCHEMA_VERSION) {
    throw new Error(`Invalid index metadata: schemaVersion must be ${INDEX_SCHEMA_VERSION}`);
  }
  if (!isRecord(parsed.sources)) throw new Error("Invalid index metadata: sources must be an object");
  const sources = parsed.sources;
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatorVersion: requireString(parsed.generatorVersion, "metadata.generatorVersion"),
    targetCommit: requireString(parsed.targetCommit, "metadata.targetCommit"),
    generatedAt: requireString(parsed.generatedAt, "metadata.generatedAt"),
    configDigest: requireString(parsed.configDigest, "metadata.configDigest"),
    sources: {
      code: requireBoolean(sources.code, "metadata.sources.code"),
      gitHistoryDays: requireNonNegativeInteger(sources.gitHistoryDays, "metadata.sources.gitHistoryDays"),
      governedArtifacts: requireBoolean(sources.governedArtifacts, "metadata.sources.governedArtifacts"),
      runtimeTelemetry: requireBoolean(sources.runtimeTelemetry, "metadata.sources.runtimeTelemetry"),
      complete: requireBoolean(sources.complete, "metadata.sources.complete"),
    },
  };
}

export interface IndexStatusInput {
  config: IndexingConfig;
  targetCommit: string | null;
  workspaceClean: boolean | null;
  snapshotPath: string | null;
  metadataContent: string | null;
}

/**
 * Derives a transparent status from Git facts and a snapshot envelope. This is
 * deliberately side-effect free so command and test code share the same policy.
 */
export function buildIndexStatus(input: IndexStatusInput): IndexStatus {
  const { config, targetCommit, workspaceClean, snapshotPath, metadataContent } = input;
  const warnings: string[] = [];
  if (!config.enabled) {
    return { state: "disabled", enabled: false, targetCommit, workspaceClean, snapshotPath, snapshot: null, warnings };
  }
  if (targetCommit === null) {
    return {
      state: "unavailable",
      enabled: true,
      targetCommit: null,
      workspaceClean,
      snapshotPath: null,
      snapshot: null,
      warnings: ["Could not resolve the current Git commit, so index freshness cannot be assessed"],
    };
  }
  if (metadataContent === null) {
    return {
      state: "not-initialized",
      enabled: true,
      targetCommit,
      workspaceClean,
      snapshotPath,
      snapshot: null,
      warnings: ["No index snapshot exists for the current commit; use the curated index and direct source inspection"],
    };
  }

  let snapshot: IndexSnapshotMetadata;
  try {
    snapshot = parseIndexSnapshotMetadata(metadataContent);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      state: "incomplete",
      enabled: true,
      targetCommit,
      workspaceClean,
      snapshotPath,
      snapshot: null,
      warnings: [`Snapshot metadata could not be validated: ${reason}`],
    };
  }

  if (!snapshot.sources.complete) warnings.push("Snapshot reports incomplete source coverage; do not treat it as a complete repository map");
  if (snapshot.targetCommit !== targetCommit) warnings.push(`Snapshot commit ${snapshot.targetCommit} does not match current commit ${targetCommit}`);
  const expectedDigest = createIndexConfigDigest(config);
  if (snapshot.configDigest !== expectedDigest) warnings.push("Snapshot indexing policy does not match the current target-manifest configuration");
  if (workspaceClean === false) warnings.push("Working tree has uncommitted changes relative to the indexed commit");
  if (workspaceClean === null) warnings.push("Working-tree state could not be determined");

  const state = !snapshot.sources.complete
    ? "incomplete"
    : snapshot.targetCommit !== targetCommit || snapshot.configDigest !== expectedDigest
      ? "stale"
      : workspaceClean === false
        ? "dirty"
        : "fresh";
  return { state, enabled: true, targetCommit, workspaceClean, snapshotPath, snapshot, warnings };
}

/** Selects the current-commit snapshot first, then the newest available snapshot to make staleness visible. */
function findSnapshotMetadataPath(repoRoot: string, targetCommit: string): string {
  const currentPath = indexSnapshotMetadataPath(repoRoot, targetCommit);
  if (existsSync(currentPath)) return currentPath;
  const versionRoot = join(repoRoot, INDEX_ROOT_DIRECTORY, `v${INDEX_SCHEMA_VERSION}`);
  if (!existsSync(versionRoot)) return currentPath;
  try {
    const candidates = readdirSync(versionRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(versionRoot, entry.name, "metadata.json"))
      .filter((path) => existsSync(path))
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
    return candidates[0] ?? currentPath;
  } catch {
    return currentPath;
  }
}

/** Reads a local snapshot envelope without building, modifying, or repairing it. */
export function getIndexStatus(repoRoot: string, config: IndexingConfig, targetCommit: string | null, workspaceClean: boolean | null): IndexStatus {
  const snapshotPath = targetCommit === null ? null : findSnapshotMetadataPath(repoRoot, targetCommit);
  const metadataContent = snapshotPath !== null && existsSync(snapshotPath) ? readFileSync(snapshotPath, "utf8") : null;
  return buildIndexStatus({ config, targetCommit, workspaceClean, snapshotPath, metadataContent });
}

export function formatIndexStatus(status: IndexStatus): string {
  const lines = [
    "Index status",
    `State: ${status.state}`,
    `Enabled: ${status.enabled ? "yes" : "no"}`,
    `Target commit: ${status.targetCommit ?? "unavailable"}`,
    `Workspace: ${status.workspaceClean === null ? "unavailable" : status.workspaceClean ? "clean" : "dirty"}`,
  ];
  if (status.snapshotPath) lines.push(`Expected snapshot: ${status.snapshotPath}`);
  if (status.snapshot) {
    lines.push(`Snapshot generator: ${status.snapshot.generatorVersion}`);
    lines.push(`Snapshot commit: ${status.snapshot.targetCommit}`);
    lines.push(`Source coverage: ${status.snapshot.sources.complete ? "complete" : "incomplete"}`);
  }
  for (const warning of status.warnings) lines.push(`Warning: ${warning}`);
  return lines.join("\n");
}

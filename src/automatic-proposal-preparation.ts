import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createContextPackReference } from "./context-pack-provenance.js";
import { validateFeatureRegistryFile } from "./indexing/feature-registry.js";
import { buildIndexSnapshot } from "./indexing/index-builder.js";
import { buildContextPack, persistContextPack } from "./indexing/context-pack.js";
import { resolveContextScope } from "./indexing/context-scope.js";
import { type ContextSelector, type IndexingConfig, type ModuleGraph } from "./indexing/types.js";
import type { ContextPackReference } from "./run-proposal.js";
import type { RunPlanData } from "./run-plan.js";

const execFileAsync = promisify(execFile);

export interface AutomaticProposalPreparation {
  mode: "automatic";
  targetCommit: string;
  snapshotDirectory: string;
  selector: ContextSelector | null;
  contextPack: ContextPackReference | null;
  skippedReason: string | null;
}

async function gitValue(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
  const value = stdout.trim();
  if (value === "") throw new Error(`Git command returned no value: git ${args.join(" ")}`);
  return value;
}

async function isCleanCheckout(repoRoot: string): Promise<boolean> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot });
  return stdout === "";
}

/**
 * Selects exactly one reviewed feature from the proposal queue. This refuses
 * partial-name and heuristic matches, because automatic context must remain
 * traceable to an explicit curated feature boundary.
 */
export function exactFeatureSelectorForPlan(registry: NonNullable<ReturnType<typeof validateFeatureRegistryFile>["registry"]>, plan: RunPlanData): ContextSelector | null {
  const names = new Set(plan.queue.map((candidate) => candidate.title));
  const featureIds = new Set(plan.queue.map((candidate) => candidate.source).filter((source) => source.startsWith("feature:")).map((source) => source.slice("feature:".length)));
  const matches = registry.features
    .filter((feature) => names.has(feature.id) || names.has(feature.name) || featureIds.has(feature.id))
    .map((feature) => feature.id)
    .sort((left, right) => left.localeCompare(right));
  return matches.length === 1 ? { kind: "feature", value: matches[0]! } : null;
}

/**
 * Rebuilds a local snapshot only from a clean checkout at the immutable
 * proposal commit. It never starts a runtime, creates a proposal, or broadens
 * scope when a single exact curated feature cannot be identified.
 */
export async function prepareAutomaticProposalContext(
  repoRoot: string,
  baseCommit: string,
  config: IndexingConfig,
  plan: RunPlanData,
): Promise<AutomaticProposalPreparation> {
  if (!config.enabled || !config.autoPrepareOnPropose) {
    throw new Error("Automatic proposal preparation is not enabled by the target manifest");
  }
  const [headCommit, clean] = await Promise.all([
    gitValue(repoRoot, ["rev-parse", "HEAD"]),
    isCleanCheckout(repoRoot),
  ]);
  if (!clean) throw new Error("Automatic proposal preparation requires a clean working tree");
  if (headCommit !== baseCommit) {
    throw new Error("Automatic proposal preparation requires HEAD to match the resolved proposal base commit");
  }

  const registryValidation = validateFeatureRegistryFile(repoRoot);
  if (!registryValidation.valid || registryValidation.registry === null) {
    const details = registryValidation.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("; ");
    throw new Error(`Automatic proposal preparation requires a valid curated feature registry: ${details}`);
  }

  const build = await buildIndexSnapshot(repoRoot, baseCommit, config);
  const selector = exactFeatureSelectorForPlan(registryValidation.registry, plan);
  if (selector === null) {
    return {
      mode: "automatic",
      targetCommit: baseCommit,
      snapshotDirectory: build.snapshotDirectory,
      selector: null,
      contextPack: null,
      skippedReason: "No single exact curated feature matched the approved proposal queue; the index was refreshed without generating a context pack.",
    };
  }

  const scopeItems = resolveContextScope(registryValidation.registry, selector);
  const pack = buildContextPack({
    repoRoot,
    graph: build.graph as ModuleGraph,
    scopeItems,
    provenance: {
      targetCommit: build.metadata.targetCommit,
      snapshotPath: build.snapshotDirectory,
      indexSchemaVersion: build.metadata.schemaVersion,
      snapshotConfigDigest: build.metadata.configDigest,
      selector,
      packKind: config.defaultContextPack,
      requestedMaxEstimatedTokens: config.maxEstimatedTokens,
    },
  });
  const artifactPaths = persistContextPack(build.snapshotDirectory, pack);
  const contextPack = createContextPackReference({
    repoRoot,
    contextPackPath: artifactPaths.jsonPath.slice(repoRoot.length + 1),
    snapshotDirectory: build.snapshotDirectory,
    snapshot: build.metadata,
  });

  return {
    mode: "automatic",
    targetCommit: baseCommit,
    snapshotDirectory: build.snapshotDirectory,
    selector,
    contextPack,
    skippedReason: null,
  };
}

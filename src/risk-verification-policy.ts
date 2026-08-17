import { type IndexedFeature, type FeatureRegistry } from "./indexing/types.js";
import { DEFAULT_VERIFICATION_POLICY, type TargetManifest, type VerificationPolicy } from "./target-manifest.js";
import type { RunPlanData } from "./run-plan.js";
import type { ContextPackReference } from "./run-proposal.js";

export type RiskClassificationReason = "feature-risk-tag" | "protected-path";

export interface RiskClassification {
  riskTags: string[];
  protectedPaths: string[];
  matchedFeatures: Array<{
    featureId: string;
    matchedPaths: string[];
    riskTags: string[];
  }>;
  reasons: RiskClassificationReason[];
}

export interface RiskAwareVerificationDecision {
  schemaVersion: 1;
  classification: RiskClassification;
  operatorRequiredChecks: string[];
  derivedRequiredChecks: string[];
  requiredChecks: string[];
  manualReviewRequired: boolean;
  manualReviewReasons: string[];
  policyApplied: boolean;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.trim() !== ""))].sort((left, right) => left.localeCompare(right));
}

function uniqueInOrder(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.trim() !== "" && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function sourcePath(reference: string): string {
  return reference.split("#", 1)[0] ?? reference;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * Matches an operator-declared protected path as a whole path, directory
 * prefix, or simple trailing `/**` prefix. It intentionally does not attempt
 * a broad glob language so policy matching remains explainable.
 */
export function protectedPathMatches(protectedPath: string, candidatePath: string): boolean {
  const protectedNormalized = normalizePath(protectedPath);
  const candidateNormalized = normalizePath(candidatePath);
  if (protectedNormalized === "") return false;
  const prefix = protectedNormalized.endsWith("/**") ? protectedNormalized.slice(0, -3).replace(/\/$/, "") : protectedNormalized;
  return candidateNormalized === prefix || candidateNormalized.startsWith(`${prefix}/`);
}

function featureScopePaths(feature: IndexedFeature): string[] {
  return uniqueSorted([
    ...feature.entryPoints.map(sourcePath),
    ...feature.primaryPaths.map(sourcePath),
    ...feature.tests.map(sourcePath),
  ]);
}

/**
 * Classifies only reviewed feature metadata from the approved queue. If a
 * queue item does not map to a curated feature, no inferred risk is invented.
 */
function featureMatchesContextSelector(feature: IndexedFeature, contextPack: ContextPackReference | undefined): boolean {
  if (!contextPack) return false;
  const { kind, value } = contextPack.selector;
  if (kind === "feature") return feature.id === value;
  if (kind === "flow") return feature.flows.includes(value);
  if (kind === "path") return featureScopePaths(feature).includes(sourcePath(value));
  return feature.entryPoints.some((entry) => entry === value || entry.endsWith(`#${value}`));
}

export function classifyProposalRisk(
  queue: RunPlanData["queue"],
  registry: FeatureRegistry | null,
  protectedPaths: readonly string[],
  contextPack?: ContextPackReference,
): RiskClassification {
  if (registry === null) return { riskTags: [], protectedPaths: [], matchedFeatures: [], reasons: [] };
  const requestedTitles = new Set(queue.map((candidate) => candidate.title));
  const requestedIds = new Set(queue.map((candidate) => candidate.source).filter((source) => source.startsWith("feature:")));
  const matchedFeatures = registry.features
    .filter((feature) => featureMatchesContextSelector(feature, contextPack) || requestedTitles.has(feature.name) || requestedTitles.has(feature.id) || requestedIds.has(`feature:${feature.id}`))
    .map((feature) => {
      const paths = featureScopePaths(feature);
      const matchedPaths = paths.filter((path) => protectedPaths.some((protectedPath) => protectedPathMatches(protectedPath, path)));
      return { featureId: feature.id, matchedPaths: uniqueSorted(matchedPaths), riskTags: uniqueSorted(feature.riskTags) };
    })
    .sort((left, right) => left.featureId.localeCompare(right.featureId));
  const riskTags = uniqueSorted(matchedFeatures.flatMap((feature) => feature.riskTags));
  const matchedProtectedPaths = uniqueSorted(matchedFeatures.flatMap((feature) => feature.matchedPaths));
  return {
    riskTags,
    protectedPaths: matchedProtectedPaths,
    matchedFeatures,
    reasons: [
      ...(riskTags.length > 0 ? ["feature-risk-tag" as const] : []),
      ...(matchedProtectedPaths.length > 0 ? ["protected-path" as const] : []),
    ],
  };
}

/**
 * Adds only explicitly operator-configured checks. Manifest required checks are
 * preserved first and remain authoritative; risk classification never invents
 * a command, test, or approval requirement on its own.
 */
export function deriveRiskAwareVerificationDecision(
  manifest: TargetManifest,
  queue: RunPlanData["queue"],
  registry: FeatureRegistry | null,
  contextPack?: ContextPackReference,
): RiskAwareVerificationDecision {
  const policy: VerificationPolicy = manifest.verificationPolicy ?? DEFAULT_VERIFICATION_POLICY;
  const classification = classifyProposalRisk(queue, registry, manifest.protectedPaths, contextPack);
  const riskChecks = classification.riskTags.flatMap((riskTag) => policy.riskTagChecks[riskTag] ?? []);
  const protectedChecks = classification.protectedPaths.length > 0 ? policy.protectedPathChecks : [];
  const operatorRequiredChecks = uniqueInOrder(manifest.requiredChecks);
  const derivedRequiredChecks = uniqueSorted([...riskChecks, ...protectedChecks]).filter((check) => !operatorRequiredChecks.includes(check));
  const manualRiskTags = classification.riskTags.filter((riskTag) => policy.manualReviewRiskTags.includes(riskTag));
  const manualReviewReasons = uniqueSorted([
    ...manualRiskTags.map((riskTag) => `Risk tag requires explicit review: ${riskTag}`),
    ...(classification.protectedPaths.length > 0 && policy.manualReviewProtectedPaths
      ? classification.protectedPaths.map((path) => `Protected path requires explicit review: ${path}`)
      : []),
  ]);
  return {
    schemaVersion: 1,
    classification,
    operatorRequiredChecks,
    derivedRequiredChecks,
    requiredChecks: [...operatorRequiredChecks, ...derivedRequiredChecks],
    manualReviewRequired: manifest.reviewPolicy.humanApprovalRequired || manualReviewReasons.length > 0,
    manualReviewReasons,
    policyApplied: manifest.verificationPolicy !== undefined,
  };
}

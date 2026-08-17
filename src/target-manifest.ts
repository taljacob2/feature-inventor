import { SUPPORTED_RISK_TAGS } from "./indexing/feature-registry.js";
import { type ContextPackKind, type IndexingConfig } from "./indexing/types.js";

export const TARGET_MANIFEST_FILENAME = "feature-inventor.target.json";

export interface VerificationPolicy {
  /** Additional required checks keyed by validated curated feature risk tags. */
  riskTagChecks: Record<string, string[]>;
  /** Additional required checks whenever approved scope references a protected path. */
  protectedPathChecks: string[];
  /** Risk tags that require explicit reviewer attention in the derived policy record. */
  manualReviewRiskTags: string[];
  /** Whether protected-path scope requires explicit reviewer attention. */
  manualReviewProtectedPaths: boolean;
}

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  riskTagChecks: {},
  protectedPathChecks: [],
  manualReviewRiskTags: [],
  manualReviewProtectedPaths: false,
};

export interface TargetManifest {
  schemaVersion: 1;
  repository: {
    url: string;
    defaultBranch: string;
  };
  goals: string[];
  requiredChecks: string[];
  protectedPaths: string[];
  reviewPolicy: {
    maxFilesChanged: number;
    humanApprovalRequired: boolean;
  };
  /** Optional risk-aware verification mappings. Existing manifests remain valid without it. */
  verificationPolicy?: VerificationPolicy;
  schedule: {
    mode: "manual";
  };
  /** Optional local indexing policy. Existing manifests remain valid without it. */
  indexing?: IndexingConfig;
}

export interface ParsedTargetManifest {
  manifest: TargetManifest;
  /** Unknown keys remain non-fatal for forward compatibility, but never disappear silently. */
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string`);
  return value;
}

function requireStringArray(value: unknown, path: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path} must be ${allowEmpty ? "an array" : "a non-empty array"} of non-empty strings`);
  }
  if (value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`${path} must be ${allowEmpty ? "an array" : "a non-empty array"} of non-empty strings`);
  }
  return [...value];
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
  return value;
}

function parseVerificationPolicy(value: unknown, warnings: string[]): VerificationPolicy {
  const policy = requireRecord(value, `${TARGET_MANIFEST_FILENAME}.verificationPolicy`);
  warnUnknownKeys(
    policy,
    ["riskTagChecks", "protectedPathChecks", "manualReviewRiskTags", "manualReviewProtectedPaths"],
    `${TARGET_MANIFEST_FILENAME}.verificationPolicy`,
    warnings,
  );
  const riskTagChecksRecord = requireRecord(policy.riskTagChecks, `${TARGET_MANIFEST_FILENAME}.verificationPolicy.riskTagChecks`);
  const riskTagChecks: Record<string, string[]> = {};
  for (const [riskTag, checks] of Object.entries(riskTagChecksRecord)) {
    if (!SUPPORTED_RISK_TAGS.has(riskTag)) throw new Error(`${TARGET_MANIFEST_FILENAME}.verificationPolicy.riskTagChecks contains unsupported risk tag ${riskTag}`);
    riskTagChecks[riskTag] = requireStringArray(checks, `${TARGET_MANIFEST_FILENAME}.verificationPolicy.riskTagChecks.${riskTag}`, true);
  }
  const manualReviewRiskTags = requireStringArray(
    policy.manualReviewRiskTags,
    `${TARGET_MANIFEST_FILENAME}.verificationPolicy.manualReviewRiskTags`,
    true,
  );
  for (const riskTag of manualReviewRiskTags) {
    if (!SUPPORTED_RISK_TAGS.has(riskTag)) throw new Error(`${TARGET_MANIFEST_FILENAME}.verificationPolicy.manualReviewRiskTags contains unsupported risk tag ${riskTag}`);
  }
  return {
    riskTagChecks,
    protectedPathChecks: requireStringArray(policy.protectedPathChecks, `${TARGET_MANIFEST_FILENAME}.verificationPolicy.protectedPathChecks`, true),
    manualReviewRiskTags,
    manualReviewProtectedPaths: requireBoolean(
      policy.manualReviewProtectedPaths,
      `${TARGET_MANIFEST_FILENAME}.verificationPolicy.manualReviewProtectedPaths`,
    ),
  };
}

function parseIndexingConfig(value: unknown, warnings: string[]): IndexingConfig {
  const indexing = requireRecord(value, `${TARGET_MANIFEST_FILENAME}.indexing`);
  warnUnknownKeys(
    indexing,
    ["enabled", "historyDays", "defaultContextPack", "maxEstimatedTokens", "includeGovernedArtifacts"],
    `${TARGET_MANIFEST_FILENAME}.indexing`,
    warnings,
  );
  const defaultContextPack = requireString(indexing.defaultContextPack, `${TARGET_MANIFEST_FILENAME}.indexing.defaultContextPack`);
  if (!["orientation", "change", "verification", "deep"].includes(defaultContextPack)) {
    throw new Error(`${TARGET_MANIFEST_FILENAME}.indexing.defaultContextPack must be orientation, change, verification, or deep`);
  }
  return {
    enabled: requireBoolean(indexing.enabled, `${TARGET_MANIFEST_FILENAME}.indexing.enabled`),
    historyDays: requirePositiveInteger(indexing.historyDays, `${TARGET_MANIFEST_FILENAME}.indexing.historyDays`),
    defaultContextPack: defaultContextPack as ContextPackKind,
    maxEstimatedTokens: requirePositiveInteger(indexing.maxEstimatedTokens, `${TARGET_MANIFEST_FILENAME}.indexing.maxEstimatedTokens`),
    includeGovernedArtifacts: requireBoolean(
      indexing.includeGovernedArtifacts,
      `${TARGET_MANIFEST_FILENAME}.indexing.includeGovernedArtifacts`,
    ),
  };
}

function warnUnknownKeys(record: Record<string, unknown>, allowed: string[], path: string, warnings: string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) warnings.push(`Unknown ${path}.${key} will be ignored by this version`);
  }
}

/**
 * Parses the operator-owned target contract. Safety-relevant known fields fail
 * closed when invalid; unknown fields emit warnings so configuration mistakes
 * are visible without blocking forward-compatible additions.
 */
export function parseTargetManifest(content: string): ParsedTargetManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${TARGET_MANIFEST_FILENAME}: ${reason}`);
  }

  const root = requireRecord(parsed, TARGET_MANIFEST_FILENAME);
  const warnings: string[] = [];
  warnUnknownKeys(
    root,
    ["schemaVersion", "repository", "goals", "requiredChecks", "protectedPaths", "reviewPolicy", "verificationPolicy", "schedule", "indexing"],
    TARGET_MANIFEST_FILENAME,
    warnings,
  );

  if (root.schemaVersion !== 1) throw new Error(`${TARGET_MANIFEST_FILENAME}.schemaVersion must be 1`);

  const repository = requireRecord(root.repository, `${TARGET_MANIFEST_FILENAME}.repository`);
  warnUnknownKeys(repository, ["url", "defaultBranch"], `${TARGET_MANIFEST_FILENAME}.repository`, warnings);

  const reviewPolicy = requireRecord(root.reviewPolicy, `${TARGET_MANIFEST_FILENAME}.reviewPolicy`);
  warnUnknownKeys(
    reviewPolicy,
    ["maxFilesChanged", "humanApprovalRequired"],
    `${TARGET_MANIFEST_FILENAME}.reviewPolicy`,
    warnings,
  );
  if (typeof reviewPolicy.humanApprovalRequired !== "boolean") {
    throw new Error(`${TARGET_MANIFEST_FILENAME}.reviewPolicy.humanApprovalRequired must be a boolean`);
  }

  const schedule = requireRecord(root.schedule, `${TARGET_MANIFEST_FILENAME}.schedule`);
  warnUnknownKeys(schedule, ["mode"], `${TARGET_MANIFEST_FILENAME}.schedule`, warnings);
  if (schedule.mode !== "manual") throw new Error(`${TARGET_MANIFEST_FILENAME}.schedule.mode must be "manual"`);
  const indexing = root.indexing === undefined ? undefined : parseIndexingConfig(root.indexing, warnings);
  const verificationPolicy = root.verificationPolicy === undefined ? undefined : parseVerificationPolicy(root.verificationPolicy, warnings);

  return {
    manifest: {
      schemaVersion: 1,
      repository: {
        url: requireString(repository.url, `${TARGET_MANIFEST_FILENAME}.repository.url`),
        defaultBranch: requireString(repository.defaultBranch, `${TARGET_MANIFEST_FILENAME}.repository.defaultBranch`),
      },
      goals: requireStringArray(root.goals, `${TARGET_MANIFEST_FILENAME}.goals`),
      requiredChecks: requireStringArray(root.requiredChecks, `${TARGET_MANIFEST_FILENAME}.requiredChecks`),
      protectedPaths: requireStringArray(root.protectedPaths, `${TARGET_MANIFEST_FILENAME}.protectedPaths`, true),
      reviewPolicy: {
        maxFilesChanged: requirePositiveInteger(
          reviewPolicy.maxFilesChanged,
          `${TARGET_MANIFEST_FILENAME}.reviewPolicy.maxFilesChanged`,
        ),
        humanApprovalRequired: reviewPolicy.humanApprovalRequired,
      },
      ...(verificationPolicy ? { verificationPolicy } : {}),
      schedule: { mode: "manual" },
      ...(indexing ? { indexing } : {}),
    },
    warnings,
  };
}

export function serializeTargetManifest(manifest: TargetManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

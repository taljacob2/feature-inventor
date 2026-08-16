export const TARGET_MANIFEST_FILENAME = "feature-inventor.target.json";

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
  schedule: {
    mode: "manual";
  };
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
    ["schemaVersion", "repository", "goals", "requiredChecks", "protectedPaths", "reviewPolicy", "schedule"],
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
      schedule: { mode: "manual" },
    },
    warnings,
  };
}

export function serializeTargetManifest(manifest: TargetManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

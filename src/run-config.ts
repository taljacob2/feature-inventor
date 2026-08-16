import {
  DEFAULT_RUN_POLICY,
  type RemotePushPolicy,
  type RunPolicy,
} from "./engine/contracts.js";

export const RUN_CONFIG_FILENAME = "feature-inventor.config.json";

export interface RunConfigFile {
  maxFeatures?: number;
  branchPrefix?: string;
  requireIsolatedWorktree?: boolean;
  requireIndependentVerification?: boolean;
  testCommands?: string[];
  remotePushPolicy?: RemotePushPolicy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(`${field} must be a non-empty array of non-empty strings`);
  }
  return [...value];
}

function optionalBranchPrefix(value: unknown): string | undefined {
  const prefix = optionalString(value, "branchPrefix");
  if (prefix === undefined) return undefined;
  if (
    prefix.startsWith("/") ||
    prefix.endsWith("/") ||
    prefix.includes("..") ||
    /[ ~^:?*\\[\\\\\t\n\r]/.test(prefix) ||
    prefix.includes("@{")
  ) {
    throw new Error("branchPrefix must be a safe Git branch-prefix fragment");
  }
  return prefix;
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalRemotePushPolicy(value: unknown): RemotePushPolicy | undefined {
  if (value === undefined) return undefined;
  if (value !== "forbidden" && value !== "explicit-only") {
    throw new Error('remotePushPolicy must be either "forbidden" or "explicit-only"');
  }
  return value;
}

/**
 * Parses a user-owned configuration file. Unknown fields are ignored so a
 * future runtime can add metadata without breaking an older CLI, while every
 * security-sensitive recognized field is validated strictly.
 */
export function parseRunConfig(content: string): RunPolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${RUN_CONFIG_FILENAME}: ${reason}`);
  }

  if (!isRecord(parsed)) throw new Error(`${RUN_CONFIG_FILENAME} must contain a JSON object`);

  return {
    maxFeatures: optionalPositiveInteger(parsed.maxFeatures, "maxFeatures") ?? DEFAULT_RUN_POLICY.maxFeatures,
    branchPrefix: optionalBranchPrefix(parsed.branchPrefix) ?? DEFAULT_RUN_POLICY.branchPrefix,
    requireIsolatedWorktree:
      optionalBoolean(parsed.requireIsolatedWorktree, "requireIsolatedWorktree") ??
      DEFAULT_RUN_POLICY.requireIsolatedWorktree,
    requireIndependentVerification:
      optionalBoolean(parsed.requireIndependentVerification, "requireIndependentVerification") ??
      DEFAULT_RUN_POLICY.requireIndependentVerification,
    testCommands: optionalStringArray(parsed.testCommands, "testCommands") ?? [...DEFAULT_RUN_POLICY.testCommands],
    remotePushPolicy: optionalRemotePushPolicy(parsed.remotePushPolicy) ?? DEFAULT_RUN_POLICY.remotePushPolicy,
  };
}

export function serializeRunConfig(policy: RunPolicy): string {
  return `${JSON.stringify(policy, null, 2)}\n`;
}

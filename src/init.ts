import { execFile as execFileCallback, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  TARGET_MANIFEST_FILENAME,
  parseTargetManifest,
  serializeTargetManifest,
  type TargetManifest,
} from "./target-manifest.js";

const execFile = promisify(execFileCallback);
const GENERATED_ARTIFACT_DIRECTORY = ".feature-inventor/";

export const DEFAULT_INIT_MAX_FILES_CHANGED = 10;
export const DEFAULT_INIT_INDEXING = {
  enabled: true,
  historyDays: 90,
  defaultContextPack: "orientation" as const,
  maxEstimatedTokens: 2500,
  includeGovernedArtifacts: true,
  autoPrepareOnPropose: false,
};

export interface RepositoryDefaults {
  repositoryUrl: string | null;
  defaultBranch: string | null;
}

export interface InitializeTargetInput {
  repoRoot: string;
  repositoryUrl: string;
  defaultBranch: string;
  goal: string;
  requiredCheck: string;
  maxFilesChanged?: number;
  indexingEnabled?: boolean;
  force?: boolean;
}

export interface InitializeTargetResult {
  manifestPath: string;
  manifest: TargetManifest;
  created: boolean;
  overwritten: boolean;
}

function requiredValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error(`${label} must be a non-empty string`);
  return trimmed;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

/** Creates an explicit, conservative first-run manifest that passes the same parser as every later edit. */
export function createInitialTargetManifest(input: Omit<InitializeTargetInput, "repoRoot" | "force">): TargetManifest {
  const manifest: TargetManifest = {
    schemaVersion: 1,
    repository: {
      url: requiredValue(input.repositoryUrl, "repository URL"),
      defaultBranch: requiredValue(input.defaultBranch, "default branch"),
    },
    goals: [requiredValue(input.goal, "goal")],
    requiredChecks: [requiredValue(input.requiredCheck, "required check")],
    protectedPaths: [],
    reviewPolicy: {
      maxFilesChanged: requirePositiveInteger(input.maxFilesChanged ?? DEFAULT_INIT_MAX_FILES_CHANGED, "max files changed"),
      humanApprovalRequired: true,
    },
    schedule: { mode: "manual" },
    indexing: {
      ...DEFAULT_INIT_INDEXING,
      enabled: input.indexingEnabled ?? DEFAULT_INIT_INDEXING.enabled,
    },
  };

  // Keep initialization and normal manifest loading on the same fail-closed contract.
  return parseTargetManifest(serializeTargetManifest(manifest)).manifest;
}

/**
 * Keeps generated local evidence out of Git status without modifying a target's
 * tracked .gitignore. Git worktrees use their resolved local exclude path.
 */
function ensureGeneratedArtifactsAreLocallyIgnored(repoRoot: string): void {
  let excludePath: string;
  try {
    const gitPath = execFileSync("git", ["-C", repoRoot, "rev-parse", "--git-path", "info/exclude"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (gitPath === "") return;
    excludePath = isAbsolute(gitPath) ? gitPath : resolve(repoRoot, gitPath);
  } catch {
    // Initialization remains useful outside a Git checkout; clean-checkout
    // enforcement simply becomes available once the operator uses Git.
    return;
  }

  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  const entries = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  if (entries.has(".feature-inventor") || entries.has(GENERATED_ARTIFACT_DIRECTORY)) return;
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  writeFileSync(excludePath, `${existing}${separator}# Local Feature Inventor generated artifacts\n${GENERATED_ARTIFACT_DIRECTORY}\n`, "utf8");
}

/** Writes one local target contract without silently replacing an existing operator-owned manifest. */
export function initializeTargetManifest(input: InitializeTargetInput): InitializeTargetResult {
  const manifestPath = join(input.repoRoot, TARGET_MANIFEST_FILENAME);
  const exists = existsSync(manifestPath);
  if (exists && input.force !== true) {
    throw new Error(`${TARGET_MANIFEST_FILENAME} already exists; inspect it first or rerun init with --force`);
  }

  const manifest = createInitialTargetManifest(input);
  writeFileSync(manifestPath, serializeTargetManifest(manifest), "utf8");
  ensureGeneratedArtifactsAreLocallyIgnored(input.repoRoot);
  return { manifestPath, manifest, created: !exists, overwritten: exists };
}

async function gitValue(repoRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFile("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
    const value = stdout.trim();
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

/** Detects helpful Git defaults without making Git a hidden initialization requirement. */
export async function detectRepositoryDefaults(repoRoot: string): Promise<RepositoryDefaults> {
  const repositoryUrl = await gitValue(repoRoot, ["config", "--get", "remote.origin.url"]);
  const symbolicRemoteHead = await gitValue(repoRoot, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const currentBranch = await gitValue(repoRoot, ["branch", "--show-current"]);
  const defaultBranch = symbolicRemoteHead?.replace(/^origin\//, "") ?? currentBranch;
  return { repositoryUrl, defaultBranch };
}

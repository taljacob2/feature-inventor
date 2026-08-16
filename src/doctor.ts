import type { ParsedTargetManifest } from "./target-manifest.js";

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  message: string;
}

export interface DoctorInput {
  repoRoot: string;
  gitRoot: string | null;
  originUrl: string | null;
  currentBranch: string | null;
  workspaceClean: boolean | null;
  manifest: ParsedTargetManifest | null;
  manifestError: string | null;
}

export interface DoctorData {
  ready: boolean;
  target: {
    repositoryUrl: string | null;
    defaultBranch: string | null;
    goals: string[];
  };
  checks: DoctorCheck[];
}

function normalizeRepositoryUrl(value: string): string {
  return value.trim().replace(/\/$/, "").replace(/\.git$/, "").toLowerCase();
}

/**
 * Computes preflight checks from already-collected environment facts. It does
 * not run commands or mutate a workspace, which keeps policy evaluation
 * deterministic and independently testable.
 */
export function buildDoctorData(input: DoctorInput): DoctorData {
  const checks: DoctorCheck[] = [];

  if (input.manifestError) {
    checks.push({ id: "target-manifest", status: "fail", message: input.manifestError });
  } else if (!input.manifest) {
    checks.push({
      id: "target-manifest",
      status: "fail",
      message: "feature-inventor.target.json is required; run `feature-inventor init` when it is available",
    });
  } else {
    checks.push({ id: "target-manifest", status: "pass", message: "Target manifest is valid" });
    for (const warning of input.manifest.warnings) {
      checks.push({ id: "target-manifest-warning", status: "warn", message: warning });
    }
  }

  if (input.gitRoot === null) {
    checks.push({ id: "git-root", status: "fail", message: "Current directory is not inside a Git repository" });
  } else if (input.gitRoot !== input.repoRoot) {
    checks.push({
      id: "git-root",
      status: "fail",
      message: `Run from the repository root (${input.gitRoot}), not a nested directory`,
    });
  } else {
    checks.push({ id: "git-root", status: "pass", message: "Current directory is the Git repository root" });
  }

  const manifest = input.manifest?.manifest;
  if (!manifest) {
    checks.push({ id: "repository-origin", status: "warn", message: "Origin could not be checked without a valid target manifest" });
  } else if (input.originUrl === null) {
    checks.push({ id: "repository-origin", status: "fail", message: "Git remote origin is required for a governed target" });
  } else if (normalizeRepositoryUrl(input.originUrl) !== normalizeRepositoryUrl(manifest.repository.url)) {
    checks.push({
      id: "repository-origin",
      status: "fail",
      message: `Origin ${input.originUrl} does not match manifest repository ${manifest.repository.url}`,
    });
  } else {
    checks.push({ id: "repository-origin", status: "pass", message: "Git origin matches the target manifest" });
  }

  if (manifest && input.currentBranch && input.currentBranch !== manifest.repository.defaultBranch) {
    checks.push({
      id: "base-branch",
      status: "warn",
      message: `Current branch is ${input.currentBranch}; future runs must pin ${manifest.repository.defaultBranch} to a commit before execution`,
    });
  } else if (manifest && input.currentBranch) {
    checks.push({ id: "base-branch", status: "pass", message: `Current branch is declared default branch ${input.currentBranch}` });
  } else {
    checks.push({ id: "base-branch", status: "warn", message: "Current branch could not be determined" });
  }

  if (input.workspaceClean === true) {
    checks.push({ id: "workspace", status: "pass", message: "Current workspace is clean" });
  } else if (input.workspaceClean === false) {
    checks.push({
      id: "workspace",
      status: "warn",
      message: "Current workspace has uncommitted changes; a future run must create an isolated workspace",
    });
  } else {
    checks.push({ id: "workspace", status: "warn", message: "Workspace cleanliness could not be determined" });
  }

  if (manifest) {
    checks.push({
      id: "required-checks",
      status: "pass",
      message: `${manifest.requiredChecks.length} required check command(s) declared; doctor does not execute them`,
    });
    checks.push({
      id: "review-policy",
      status: "pass",
      message: `Human approval is required; review candidates are limited to ${manifest.reviewPolicy.maxFilesChanged} changed files`,
    });
    checks.push({ id: "schedule", status: "pass", message: "Scheduling mode is manual; repeated execution is not implicit" });
  }

  return {
    ready: !checks.some((check) => check.status === "fail"),
    target: {
      repositoryUrl: manifest?.repository.url ?? null,
      defaultBranch: manifest?.repository.defaultBranch ?? null,
      goals: manifest?.goals ?? [],
    },
    checks,
  };
}

export function formatDoctor(data: DoctorData): string {
  const icon: Record<DoctorCheckStatus, string> = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  const lines = [
    `Feature Inventor doctor: ${data.ready ? "READY" : "NOT READY"}`,
    `Target: ${data.target.repositoryUrl ?? "(not configured)"}`,
  ];
  if (data.target.defaultBranch) lines.push(`Default branch: ${data.target.defaultBranch}`);
  if (data.target.goals.length > 0) lines.push(`Goals: ${data.target.goals.join("; ")}`);
  lines.push("", "Checks:");
  for (const check of data.checks) lines.push(`  ${icon[check.status]} ${check.id}: ${check.message}`);
  return lines.join("\n");
}

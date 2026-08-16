import { describe, expect, it } from "vitest";
import { buildDoctorData, formatDoctor } from "./doctor.js";
import type { ParsedTargetManifest } from "./target-manifest.js";

const MANIFEST: ParsedTargetManifest = {
  manifest: {
    schemaVersion: 1,
    repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
    goals: ["Improve reliability"],
    requiredChecks: ["npm test"],
    protectedPaths: [],
    reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: true },
    schedule: { mode: "manual" },
  },
  warnings: [],
};

describe("doctor", () => {
  it("reports a clean configured target as ready", () => {
    const data = buildDoctorData({
      repoRoot: "/work/project",
      gitRoot: "/work/project",
      originUrl: "https://github.com/example/project.git",
      currentBranch: "main",
      workspaceClean: true,
      manifest: MANIFEST,
      manifestError: null,
    });

    expect(data.ready).toBe(true);
    expect(data.checks.every((check) => check.status === "pass")).toBe(true);
    expect(formatDoctor(data)).toContain("Feature Inventor doctor: READY");
  });

  it("fails on a malformed manifest or mismatched repository origin", () => {
    const malformed = buildDoctorData({
      repoRoot: "/work/project",
      gitRoot: "/work/project",
      originUrl: "https://github.com/example/project.git",
      currentBranch: "main",
      workspaceClean: true,
      manifest: null,
      manifestError: "Invalid feature-inventor.target.json: Unexpected token",
    });
    expect(malformed.ready).toBe(false);
    expect(malformed.checks.find((check) => check.id === "target-manifest")?.status).toBe("fail");

    const mismatched = buildDoctorData({
      repoRoot: "/work/project",
      gitRoot: "/work/project",
      originUrl: "https://github.com/example/other.git",
      currentBranch: "main",
      workspaceClean: true,
      manifest: MANIFEST,
      manifestError: null,
    });
    expect(mismatched.ready).toBe(false);
    expect(mismatched.checks.find((check) => check.id === "repository-origin")?.status).toBe("fail");
  });

  it("keeps a dirty current workspace visible as a warning rather than blocking an isolated future run", () => {
    const data = buildDoctorData({
      repoRoot: "/work/project",
      gitRoot: "/work/project",
      originUrl: "https://github.com/example/project",
      currentBranch: "feature/test",
      workspaceClean: false,
      manifest: { ...MANIFEST, warnings: ["Unknown feature-inventor.target.json.extra will be ignored by this version"] },
      manifestError: null,
    });

    expect(data.ready).toBe(true);
    expect(data.checks.find((check) => check.id === "workspace")?.status).toBe("warn");
    expect(data.checks.find((check) => check.id === "base-branch")?.status).toBe("warn");
    expect(data.checks.find((check) => check.id === "target-manifest-warning")?.status).toBe("warn");
  });
});

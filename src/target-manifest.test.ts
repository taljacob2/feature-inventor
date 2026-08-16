import { describe, expect, it } from "vitest";
import { parseTargetManifest, serializeTargetManifest, type TargetManifest } from "./target-manifest.js";

const MANIFEST: TargetManifest = {
  schemaVersion: 1,
  repository: {
    url: "https://github.com/example/project.git",
    defaultBranch: "main",
  },
  goals: ["Improve release reliability"],
  requiredChecks: ["npm test", "npm run build"],
  protectedPaths: [".github/workflows/**"],
  reviewPolicy: {
    maxFilesChanged: 12,
    humanApprovalRequired: true,
  },
  schedule: { mode: "manual" },
};

describe("target manifest", () => {
  it("parses a complete operator-owned repository contract", () => {
    expect(parseTargetManifest(JSON.stringify(MANIFEST))).toEqual({ manifest: MANIFEST, warnings: [] });
  });

  it("warns on unknown fields without silently hiding them", () => {
    const parsed = parseTargetManifest(
      JSON.stringify({
        ...MANIFEST,
        unexpected: true,
        repository: { ...MANIFEST.repository, remotePushPolicy: "never" },
      }),
    );

    expect(parsed.manifest).toEqual(MANIFEST);
    expect(parsed.warnings).toEqual([
      "Unknown feature-inventor.target.json.unexpected will be ignored by this version",
      "Unknown feature-inventor.target.json.repository.remotePushPolicy will be ignored by this version",
    ]);
  });

  it("fails closed on missing goals, an invalid schema version, or an unsupported schedule", () => {
    expect(() => parseTargetManifest(JSON.stringify({ ...MANIFEST, goals: [] }))).toThrow("goals must be a non-empty array");
    expect(() => parseTargetManifest(JSON.stringify({ ...MANIFEST, schemaVersion: 2 }))).toThrow("schemaVersion must be 1");
    expect(() => parseTargetManifest(JSON.stringify({ ...MANIFEST, schedule: { mode: "daily" } }))).toThrow(
      'schedule.mode must be "manual"',
    );
  });

  it("serializes a manifest as reproducible formatted JSON", () => {
    expect(parseTargetManifest(serializeTargetManifest(MANIFEST))).toEqual({ manifest: MANIFEST, warnings: [] });
  });
});

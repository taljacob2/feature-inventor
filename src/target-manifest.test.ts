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

  it("accepts an optional explicit indexing policy and rejects invalid context settings", () => {
    const indexing = {
      enabled: true,
      historyDays: 90,
      defaultContextPack: "change" as const,
      maxEstimatedTokens: 4000,
      includeGovernedArtifacts: true,
    };
    expect(parseTargetManifest(JSON.stringify({ ...MANIFEST, indexing })).manifest.indexing).toEqual(indexing);
    expect(() => parseTargetManifest(JSON.stringify({ ...MANIFEST, indexing: { ...indexing, defaultContextPack: "all" } }))).toThrow(
      "indexing.defaultContextPack",
    );
    expect(() => parseTargetManifest(JSON.stringify({ ...MANIFEST, indexing: { ...indexing, historyDays: 0 } }))).toThrow(
      "indexing.historyDays must be a positive integer",
    );
  });

  it("accepts an explicit risk-aware verification policy and rejects unsupported risk tags", () => {
    const verificationPolicy = {
      riskTagChecks: { "lifecycle-state": ["npm run lifecycle"] },
      protectedPathChecks: ["npm run protected"],
      manualReviewRiskTags: ["external-runtime"],
      manualReviewProtectedPaths: true,
    };
    expect(parseTargetManifest(JSON.stringify({ ...MANIFEST, verificationPolicy })).manifest.verificationPolicy).toEqual(verificationPolicy);
    expect(() => parseTargetManifest(JSON.stringify({
      ...MANIFEST,
      verificationPolicy: { ...verificationPolicy, riskTagChecks: { unknown: ["npm test"] } },
    }))).toThrow("unsupported risk tag unknown");
    expect(() => parseTargetManifest(JSON.stringify({
      ...MANIFEST,
      verificationPolicy: { ...verificationPolicy, manualReviewRiskTags: ["unknown"] },
    }))).toThrow("unsupported risk tag unknown");
  });

  it("serializes a manifest as reproducible formatted JSON", () => {
    expect(parseTargetManifest(serializeTargetManifest(MANIFEST))).toEqual({ manifest: MANIFEST, warnings: [] });
  });
});

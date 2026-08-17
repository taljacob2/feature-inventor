import { describe, expect, it } from "vitest";
import { classifyProposalRisk, deriveRiskAwareVerificationDecision, protectedPathMatches } from "./risk-verification-policy.js";
import type { FeatureRegistry } from "./indexing/types.js";
import type { RunPlanData } from "./run-plan.js";
import type { ContextPackReference } from "./run-proposal.js";
import type { TargetManifest } from "./target-manifest.js";

const REGISTRY: FeatureRegistry = {
  version: 1,
  features: [
    {
      id: "governed-run",
      name: "Governed runtime execution",
      intent: "Safe runtime launch",
      entryPoints: ["src/cli.ts#runRuntime"],
      primaryPaths: ["src/core/governed-run-service.ts", "src/run-proposal.ts"],
      tests: ["src/governed-runs.test.ts"],
      flows: ["governed-run-lifecycle"],
      riskTags: ["external-runtime", "lifecycle-state"],
    },
  ],
  flows: [{ id: "governed-run-lifecycle", name: "Governed flow", startsAt: ["src/cli.ts#runRuntime"], steps: [{ source: "src/cli.ts#runRuntime", role: "entry" }] }],
};

const CONTEXT_PACK: ContextPackReference = {
  schemaVersion: 1,
  id: "context-0123456789abcdef",
  targetCommit: "abcdef1234567",
  jsonPath: ".feature-inventor/index/v1/abcdef1234567/context/context-0123456789abcdef.json",
  markdownPath: ".feature-inventor/index/v1/abcdef1234567/context/context-0123456789abcdef.md",
  contentHash: "a".repeat(64),
  indexSchemaVersion: 1,
  snapshotConfigDigest: `sha256:${"b".repeat(64)}`,
  selector: { kind: "feature", value: "governed-run" },
  packKind: "change",
  effectiveMaxEstimatedTokens: 4000,
  estimatedTokens: 1200,
};

const QUEUE = [{
  title: "An unrelated roadmap title",
  description: "No inferred registry match",
  source: "ROADMAP.md",
  impact: 5,
  confidence: 5,
  ease: 5,
  composite: 5,
  iceSource: "default" as const,
}];

function manifest(verificationPolicy?: TargetManifest["verificationPolicy"]): TargetManifest {
  return {
    schemaVersion: 1,
    repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
    goals: ["Ship safely"],
    requiredChecks: ["npm test", "npm run build"],
    protectedPaths: ["src/**", "infra/**"],
    reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: false },
    ...(verificationPolicy ? { verificationPolicy } : {}),
    schedule: { mode: "manual" },
  };
}

function plan(queue = QUEUE): RunPlanData {
  return {
    status: "planned",
    runtime: "manus",
    candidateSource: "Now",
    policy: {
      maxFeatures: 1,
      branchPrefix: "nightly",
      requireIsolatedWorktree: true,
      requireIndependentVerification: true,
      testCommands: ["npm test"],
      remotePushPolicy: "forbidden",
    },
    queue,
    notAttempted: [],
  };
}

describe("risk-aware verification policy", () => {
  it("matches only explicit reviewed context scope and protected-path evidence", () => {
    const decision = deriveRiskAwareVerificationDecision(
      manifest({
        riskTagChecks: { "external-runtime": ["npm run runtime-contract"], "lifecycle-state": ["npm run lifecycle"] },
        protectedPathChecks: ["npm run protected-review"],
        manualReviewRiskTags: ["external-runtime"],
        manualReviewProtectedPaths: true,
      }),
      plan().queue,
      REGISTRY,
      CONTEXT_PACK,
    );

    expect(decision.classification).toEqual({
      riskTags: ["external-runtime", "lifecycle-state"],
      protectedPaths: ["src/cli.ts", "src/core/governed-run-service.ts", "src/governed-runs.test.ts", "src/run-proposal.ts"],
      matchedFeatures: [{
        featureId: "governed-run",
        matchedPaths: ["src/cli.ts", "src/core/governed-run-service.ts", "src/governed-runs.test.ts", "src/run-proposal.ts"],
        riskTags: ["external-runtime", "lifecycle-state"],
      }],
      reasons: ["feature-risk-tag", "protected-path"],
    });
    expect(decision.operatorRequiredChecks).toEqual(["npm test", "npm run build"]);
    expect(decision.derivedRequiredChecks).toEqual(["npm run lifecycle", "npm run protected-review", "npm run runtime-contract"]);
    expect(decision.requiredChecks).toEqual(["npm test", "npm run build", "npm run lifecycle", "npm run protected-review", "npm run runtime-contract"]);
    expect(decision.manualReviewRequired).toBe(true);
    expect(decision.manualReviewReasons).toEqual([
      "Protected path requires explicit review: src/cli.ts",
      "Protected path requires explicit review: src/core/governed-run-service.ts",
      "Protected path requires explicit review: src/governed-runs.test.ts",
      "Protected path requires explicit review: src/run-proposal.ts",
      "Risk tag requires explicit review: external-runtime",
    ]);
  });

  it("does not infer feature risk from a partial or unrelated queue title", () => {
    const classification = classifyProposalRisk(plan().queue, REGISTRY, ["src/**"]);
    expect(classification).toEqual({ riskTags: [], protectedPaths: [], matchedFeatures: [], reasons: [] });
  });

  it("preserves the operator baseline when no optional verification policy exists", () => {
    const decision = deriveRiskAwareVerificationDecision(manifest(), plan().queue, REGISTRY, CONTEXT_PACK);
    expect(decision.policyApplied).toBe(false);
    expect(decision.operatorRequiredChecks).toEqual(["npm test", "npm run build"]);
    expect(decision.derivedRequiredChecks).toEqual([]);
    expect(decision.requiredChecks).toEqual(["npm test", "npm run build"]);
    expect(decision.manualReviewRequired).toBe(false);
  });

  it("uses explainable whole-path or directory-prefix protected path matching", () => {
    expect(protectedPathMatches("infra/**", "infra/deploy.ts")).toBe(true);
    expect(protectedPathMatches("src/run-proposal.ts", "src/run-proposal.ts")).toBe(true);
    expect(protectedPathMatches("src/run-proposal.ts", "src/run-proposal.test.ts")).toBe(false);
    expect(protectedPathMatches("infra/**", "src/infra/deploy.ts")).toBe(false);
  });
});

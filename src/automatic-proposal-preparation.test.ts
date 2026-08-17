import { describe, expect, it } from "vitest";
import { exactFeatureSelectorForPlan } from "./automatic-proposal-preparation.js";
import type { FeatureRegistry } from "./indexing/types.js";
import type { RunPlanData } from "./run-plan.js";

const REGISTRY: FeatureRegistry = {
  version: 1,
  features: [
    {
      id: "alpha",
      name: "Alpha feature",
      intent: "Alpha",
      entryPoints: ["src/alpha.ts#runAlpha"],
      primaryPaths: ["src/alpha.ts"],
      tests: ["src/alpha.test.ts"],
      flows: ["alpha-flow"],
      riskTags: ["lifecycle-state"],
    },
    {
      id: "beta",
      name: "Beta feature",
      intent: "Beta",
      entryPoints: ["src/beta.ts#runBeta"],
      primaryPaths: ["src/beta.ts"],
      tests: ["src/beta.test.ts"],
      flows: ["beta-flow"],
      riskTags: ["immutable-artifact"],
    },
  ],
  flows: [
    { id: "alpha-flow", name: "Alpha", startsAt: ["src/alpha.ts#runAlpha"], steps: [{ source: "src/alpha.ts#runAlpha", role: "entry" }] },
    { id: "beta-flow", name: "Beta", startsAt: ["src/beta.ts#runBeta"], steps: [{ source: "src/beta.ts#runBeta", role: "entry" }] },
  ],
};

function plan(queue: RunPlanData["queue"]): RunPlanData {
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

function candidate(title: string, source = "ROADMAP.md"): RunPlanData["queue"][number] {
  return { title, description: "", source, impact: 5, confidence: 5, ease: 5, iceSource: "default" };
}

describe("automatic proposal preparation selector", () => {
  it("selects one exact curated feature name or explicit feature source", () => {
    expect(exactFeatureSelectorForPlan(REGISTRY, plan([candidate("Alpha feature")]))).toEqual({ kind: "feature", value: "alpha" });
    expect(exactFeatureSelectorForPlan(REGISTRY, plan([candidate("Different title", "feature:beta")]))).toEqual({ kind: "feature", value: "beta" });
  });

  it("refuses fuzzy and ambiguous feature scope", () => {
    expect(exactFeatureSelectorForPlan(REGISTRY, plan([candidate("Alpha")]))).toBeNull();
    expect(exactFeatureSelectorForPlan(REGISTRY, plan([candidate("Alpha feature"), candidate("Beta feature")]))).toBeNull();
  });
});

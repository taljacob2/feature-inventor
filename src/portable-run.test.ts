import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import {
  collisionRateBetween,
  computeIceScore,
  iceTier,
  orderByIceTierThenMinimalCollision,
} from "./engine/prioritization.js";
import { parseRunConfig } from "./run-config.js";
import { buildRunPlan, candidateFromRoadmapItem, formatRunPlan } from "./run-plan.js";

describe("runtime-neutral prioritization", () => {
  it("computes ICE scores and half-point tiers deterministically", () => {
    expect(computeIceScore({ impact: 8, confidence: 7, ease: 6 })).toBe(7);
    expect(iceTier({ impact: 8, confidence: 7, ease: 6 })).toBe(7);
    expect(iceTier({ impact: 8, confidence: 8, ease: 7 })).toBe(7.5);
  });

  it("uses lowest collision within an ICE tier without mutating the caller's list", () => {
    const candidates = [
      { title: "A", impact: 9, confidence: 9, ease: 9 },
      { title: "B", impact: 8, confidence: 7, ease: 6 },
      { title: "C", impact: 7, confidence: 7, ease: 7 },
    ];
    const ordered = orderByIceTierThenMinimalCollision(candidates, [
      { featureA: "A", featureB: "B", collisionRate: 90 },
      { featureA: "A", featureB: "C", collisionRate: 10 },
    ]);

    expect(ordered.map((candidate) => candidate.title)).toEqual(["A", "C", "B"]);
    expect(candidates.map((candidate) => candidate.title)).toEqual(["A", "B", "C"]);
    expect(collisionRateBetween([], "A", "B")).toBe(0);
  });
});

describe("portable run configuration", () => {
  it("applies conservative defaults to omitted fields", () => {
    expect(parseRunConfig('{"maxFeatures": 2, "remotePushPolicy": "explicit-only"}')).toEqual({
      ...DEFAULT_RUN_POLICY,
      maxFeatures: 2,
      remotePushPolicy: "explicit-only",
    });
  });

  it("rejects invalid policy values rather than silently weakening safeguards", () => {
    expect(() => parseRunConfig('{"maxFeatures": 0}')).toThrow("maxFeatures must be a positive integer");
    expect(() => parseRunConfig('{"remotePushPolicy": "always"}')).toThrow("remotePushPolicy");
    expect(() => parseRunConfig('{"testCommands": []}')).toThrow("testCommands must be a non-empty array");
    expect(() => parseRunConfig('{"branchPrefix": "../unsafe"}')).toThrow("branchPrefix");
    expect(() => parseRunConfig('[]')).toThrow("must contain a JSON object");
  });
});

describe("portable run plan", () => {
  it("prefers open Now candidates and reports capped items as carried forward", () => {
    const roadmap = `# Roadmap

## Now

- [ ] Lower ICE — ICE 6/6/6
- [ ] Higher ICE — ICE 8/8/8

## Next

- [ ] Next candidate — ICE 9/9/9
`;
    const plan = buildRunPlan(roadmap, { ...DEFAULT_RUN_POLICY, maxFeatures: 1 });

    expect(plan.status).toBe("planned");
    expect(plan.runtime).toBe("manus");
    expect(plan.candidateSource).toBe("Now");
    expect(plan.queue.map((candidate) => candidate.title)).toEqual(["Higher ICE — ICE 8/8/8"]);
    expect(plan.notAttempted.map((candidate) => candidate.title)).toEqual(["Lower ICE — ICE 6/6/6"]);
    expect(formatRunPlan(plan)).toContain("No files, Git branches, or remote state have been changed.");
  });

  it("falls back to Next and labels pre-ICE roadmap items as neutral defaults", () => {
    const roadmap = `# Roadmap

## Now

## Next

- [ ] Legacy candidate — M/M — why it matters
`;
    const plan = buildRunPlan(roadmap, DEFAULT_RUN_POLICY);

    expect(plan.candidateSource).toBe("Next");
    expect(plan.queue).toHaveLength(1);
    expect(plan.queue[0]?.iceSource).toBe("default");
    expect(candidateFromRoadmapItem("Scored — ICE 7/8/9", "Now").iceSource).toBe("roadmap");
    expect(candidateFromRoadmapItem("Malformed — ICE 12/8/9", "Now").iceSource).toBe("default");
  });
});

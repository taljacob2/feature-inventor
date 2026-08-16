import { parseNextSection, parseNowSection } from "./roadmap.js";
import {
  computeIceScore,
  orderByIceTierThenMinimalCollision,
  type FeatureCollision,
} from "./engine/prioritization.js";
import type { FeatureCandidate, PlannedRun, RunPolicy, RuntimeKind } from "./engine/contracts.js";

export type CandidateSource = "Now" | "Next" | "none";
export type IceSource = "roadmap" | "default";

export interface PlannedCandidate extends FeatureCandidate {
  iceSource: IceSource;
}

export interface RunPlanData extends Omit<PlannedRun, "queue" | "notAttempted"> {
  candidateSource: CandidateSource;
  queue: PlannedCandidate[];
  notAttempted: PlannedCandidate[];
}

const ICE_PATTERN = /\bICE\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i;

/**
 * Converts an open roadmap item into a plan candidate. Existing roadmap items
 * are valuable operator input even when they predate ICE scoring; those older
 * entries retain an explicitly-labelled neutral score rather than being
 * silently discarded or presented as an agent estimate.
 */
export function candidateFromRoadmapItem(title: string, source: CandidateSource): PlannedCandidate {
  const iceMatch = title.match(ICE_PATTERN);
  const parsedScores = iceMatch ? [Number(iceMatch[1]), Number(iceMatch[2]), Number(iceMatch[3])] : null;
  const validScores =
    parsedScores !== null && parsedScores.every((score) => Number.isInteger(score) && score >= 1 && score <= 10);
  const [impact, confidence, ease] = validScores ? parsedScores : [5, 5, 5];

  return {
    title,
    description: `Existing ROADMAP.md ${source} candidate.`,
    source: "ROADMAP.md",
    impact,
    confidence,
    ease,
    iceSource: validScores ? "roadmap" : "default",
  };
}

/**
 * Builds an execution-free view of what a runtime-neutral executor would do.
 * This function performs no I/O, invokes no agent, and never changes Git
 * state. A runtime must separately add research candidates and collision
 * estimates before a real execution cycle begins.
 */
export function buildRunPlan(
  roadmap: string,
  policy: RunPolicy,
  options: { runtime?: RuntimeKind; collisionPairs?: readonly FeatureCollision[] } = {},
): RunPlanData {
  const now = parseNowSection(roadmap);
  const next = now.length === 0 ? parseNextSection(roadmap) : [];
  const candidateSource: CandidateSource = now.length > 0 ? "Now" : next.length > 0 ? "Next" : "none";
  const candidates = (candidateSource === "Now" ? now : next).map((title) =>
    candidateFromRoadmapItem(title, candidateSource),
  );
  const ordered = orderByIceTierThenMinimalCollision(candidates, options.collisionPairs ?? []);

  return {
    status: "planned",
    runtime: options.runtime ?? "manus",
    policy,
    candidateSource,
    queue: ordered.slice(0, policy.maxFeatures),
    notAttempted: ordered.slice(policy.maxFeatures),
  };
}

export function formatRunPlan(plan: RunPlanData): string {
  const lines = [
    "Feature Inventor — portable run plan",
    "",
    `Runtime: ${plan.runtime}`,
    `Candidate source: ${plan.candidateSource}`,
    `Max features: ${plan.policy.maxFeatures}`,
    `Workspace: ${plan.policy.requireIsolatedWorktree ? "isolated worktree required" : "not isolated"}`,
    `Independent verification: ${plan.policy.requireIndependentVerification ? "required" : "not required"}`,
    `Remote pushes: ${plan.policy.remotePushPolicy}`,
    `Checks: ${plan.policy.testCommands.join("; ")}`,
    "",
    "No files, Git branches, or remote state have been changed.",
    "",
    `Queued candidates (${plan.queue.length}):`,
  ];

  if (plan.queue.length === 0) {
    lines.push("  (none — ROADMAP.md has no open Now or Next items)");
  } else {
    for (const [index, candidate] of plan.queue.entries()) {
      lines.push(
        `  ${index + 1}. ${candidate.title} — ICE ${computeIceScore(candidate).toFixed(1)} ` +
          `(${candidate.iceSource === "roadmap" ? "from ROADMAP.md" : "neutral default"})`,
      );
    }
  }

  lines.push("", `Carried forward (${plan.notAttempted.length}):`);
  if (plan.notAttempted.length === 0) {
    lines.push("  (none)");
  } else {
    for (const candidate of plan.notAttempted) lines.push(`  - ${candidate.title}`);
  }

  return lines.join("\n");
}

import { describe, expect, it } from "vitest";
import { createRunId, createRunProposal, parseRunProposal, serializeRunProposal, type ContextPackReference } from "./run-proposal.js";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import type { TargetManifest } from "./target-manifest.js";

const MANIFEST: TargetManifest = {
  schemaVersion: 1,
  repository: { url: "https://github.com/example/project.git", defaultBranch: "main" },
  goals: ["Improve reliability"],
  requiredChecks: ["npm test"],
  protectedPaths: [],
  reviewPolicy: { maxFilesChanged: 12, humanApprovalRequired: true },
  schedule: { mode: "manual" },
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
  estimatedTokens: 2500,
};

const PLAN = {
  status: "planned" as const,
  runtime: "manus" as const,
  candidateSource: "Now" as const,
  policy: { ...DEFAULT_RUN_POLICY, testCommands: ["npm test"] },
  queue: [
    {
      title: "Improve doctor",
      description: "Add one focused check",
      source: "ROADMAP.md",
      impact: 8,
      confidence: 7,
      ease: 6,
      composite: 7,
      iceSource: "roadmap" as const,
    },
  ],
  notAttempted: [],
};

describe("run proposal", () => {
  it("creates a deterministic run identifier from the planning instant and target commit", () => {
    expect(createRunId(new Date("2026-08-17T12:34:56.000Z"), "abcdef1234567")).toBe("run-20260817t123456-abcdef1");
  });

  it("pins the target commit and hashes the full manifest and policy", () => {
    const proposal = createRunProposal({
      runId: "run-20260817-001",
      createdAt: "2026-08-17T12:00:00.000Z",
      baseCommit: "abcdef1234567",
      manifest: MANIFEST,
      plan: PLAN,
    });

    expect(proposal.target).toEqual({
      repositoryUrl: MANIFEST.repository.url,
      defaultBranch: "main",
      baseCommit: "abcdef1234567",
    });
    expect(proposal.manifestHash).toHaveLength(64);
    expect(proposal.policyHash).toHaveLength(64);
    expect(parseRunProposal(serializeRunProposal(proposal))).toEqual(proposal);
  });

  it("records a validated context-pack reference without changing the proposal schema version", () => {
    const proposal = createRunProposal({
      runId: "run-20260817-001",
      createdAt: "2026-08-17T12:00:00.000Z",
      baseCommit: "abcdef1234567",
      manifest: MANIFEST,
      plan: PLAN,
      contextPack: CONTEXT_PACK,
    });

    expect(proposal.contextPack).toEqual(CONTEXT_PACK);
    expect(proposal.contextPack).not.toBe(CONTEXT_PACK);
    expect(parseRunProposal(serializeRunProposal(proposal))).toEqual(proposal);
    expect(parseRunProposal(serializeRunProposal(createRunProposal({
      runId: "run-20260817-002",
      createdAt: "2026-08-17T12:00:00.000Z",
      baseCommit: "abcdef1234567",
      manifest: MANIFEST,
      plan: PLAN,
    }))).contextPack).toBeUndefined();
  });

  it("rejects context provenance that does not match the proposal target or immutable artifact path", () => {
    expect(() => createRunProposal({
      runId: "run-20260817-001",
      createdAt: "2026-08-17T12:00:00.000Z",
      baseCommit: "abcdef1234567",
      manifest: MANIFEST,
      plan: PLAN,
      contextPack: {
        ...CONTEXT_PACK,
        targetCommit: "1111111111111",
        jsonPath: ".feature-inventor/index/v1/1111111111111/context/context-0123456789abcdef.json",
        markdownPath: ".feature-inventor/index/v1/1111111111111/context/context-0123456789abcdef.md",
      },
    })).toThrow("targetCommit");
    expect(() => parseRunProposal(JSON.stringify({
      ...createRunProposal({
        runId: "run-20260817-001",
        createdAt: "2026-08-17T12:00:00.000Z",
        baseCommit: "abcdef1234567",
        manifest: MANIFEST,
        plan: PLAN,
        contextPack: CONTEXT_PACK,
      }),
      contextPack: { ...CONTEXT_PACK, jsonPath: "context.json" },
    }))).toThrow("jsonPath");
  });

  it("rejects invalid run IDs and unpinned targets", () => {
    expect(() =>
      createRunProposal({
        runId: "Bad Run",
        createdAt: "2026-08-17T12:00:00.000Z",
        baseCommit: "abcdef1234567",
        manifest: MANIFEST,
        plan: PLAN,
      }),
    ).toThrow("runId");
    expect(() =>
      createRunProposal({
        runId: "run-20260817-001",
        createdAt: "2026-08-17T12:00:00.000Z",
        baseCommit: "main",
        manifest: MANIFEST,
        plan: PLAN,
      }),
    ).toThrow("baseCommit");
  });
});

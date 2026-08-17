import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildIndexStatus,
  createIndexConfigDigest,
  getIndexStatus,
  indexSnapshotMetadataPath,
  parseIndexSnapshotMetadata,
} from "./index-status.js";
import { DEFAULT_INDEXING_CONFIG } from "./types.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function metadata(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    generatorVersion: "feature-inventor 0.1.0",
    targetCommit: COMMIT,
    generatedAt: "2026-08-17T00:00:00.000Z",
    configDigest: createIndexConfigDigest(DEFAULT_INDEXING_CONFIG),
    sources: {
      code: true,
      gitHistoryDays: 90,
      governedArtifacts: true,
      runtimeTelemetry: false,
      complete: true,
    },
    ...overrides,
  });
}

describe("index status", () => {
  const directories: string[] = [];

  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
  });

  it("derives a reproducible commit-pinned metadata path and parses its envelope", () => {
    expect(indexSnapshotMetadataPath("/repo", COMMIT)).toBe(`/repo/.feature-inventor/index/v1/${COMMIT}/metadata.json`);
    expect(parseIndexSnapshotMetadata(metadata()).targetCommit).toBe(COMMIT);
    expect(createIndexConfigDigest(DEFAULT_INDEXING_CONFIG)).toBe(createIndexConfigDigest({ ...DEFAULT_INDEXING_CONFIG }));
  });

  it("reports a fresh snapshot only when commit, policy, workspace, and coverage agree", () => {
    const status = buildIndexStatus({
      config: DEFAULT_INDEXING_CONFIG,
      targetCommit: COMMIT,
      workspaceClean: true,
      snapshotPath: "/repo/metadata.json",
      metadataContent: metadata(),
    });
    expect(status.state).toBe("fresh");
    expect(status.warnings).toEqual([]);
  });

  it("distinguishes stale policy, dirty worktree, and incomplete source coverage", () => {
    const stale = buildIndexStatus({
      config: { ...DEFAULT_INDEXING_CONFIG, historyDays: 30 },
      targetCommit: COMMIT,
      workspaceClean: true,
      snapshotPath: "/repo/metadata.json",
      metadataContent: metadata(),
    });
    expect(stale.state).toBe("stale");
    expect(stale.warnings.join(" ")).toContain("policy");

    const staleCommit = buildIndexStatus({
      config: DEFAULT_INDEXING_CONFIG,
      targetCommit: COMMIT,
      workspaceClean: true,
      snapshotPath: "/repo/metadata.json",
      metadataContent: metadata({ targetCommit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" }),
    });
    expect(staleCommit.state).toBe("stale");
    expect(staleCommit.warnings.join(" ")).toContain("does not match current commit");

    const dirty = buildIndexStatus({
      config: DEFAULT_INDEXING_CONFIG,
      targetCommit: COMMIT,
      workspaceClean: false,
      snapshotPath: "/repo/metadata.json",
      metadataContent: metadata(),
    });
    expect(dirty.state).toBe("dirty");

    const incomplete = buildIndexStatus({
      config: DEFAULT_INDEXING_CONFIG,
      targetCommit: COMMIT,
      workspaceClean: true,
      snapshotPath: "/repo/metadata.json",
      metadataContent: metadata({
        sources: { code: true, gitHistoryDays: 90, governedArtifacts: true, runtimeTelemetry: false, complete: false },
      }),
    });
    expect(incomplete.state).toBe("incomplete");
    expect(incomplete.warnings.join(" ")).toContain("incomplete source coverage");
  });

  it("discovers a prior-commit snapshot and marks it stale instead of hiding it as uninitialized", () => {
    const directory = mkdtempSync(join(tmpdir(), "feature-inventor-index-status-"));
    directories.push(directory);
    const priorCommit = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const metadataPath = indexSnapshotMetadataPath(directory, priorCommit);
    mkdirSync(dirname(metadataPath), { recursive: true });
    writeFileSync(metadataPath, metadata({ targetCommit: priorCommit }), "utf8");

    const status = getIndexStatus(directory, DEFAULT_INDEXING_CONFIG, COMMIT, true);
    expect(status.state).toBe("stale");
    expect(status.snapshotPath).toBe(metadataPath);
  });

  it("does not treat a missing snapshot as an error or source of repository facts", () => {
    const status = buildIndexStatus({
      config: DEFAULT_INDEXING_CONFIG,
      targetCommit: COMMIT,
      workspaceClean: true,
      snapshotPath: "/repo/metadata.json",
      metadataContent: null,
    });
    expect(status.state).toBe("not-initialized");
    expect(status.snapshot).toBeNull();
    expect(status.warnings.join(" ")).toContain("curated index");
  });
});

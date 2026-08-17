import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContextPackReference } from "./context-pack-provenance.js";
import type { ContextPack, IndexSnapshotMetadata } from "./indexing/types.js";

const COMMIT = "abcdef1234567";
const DIGEST = `sha256:${"b".repeat(64)}`;

function snapshot(): IndexSnapshotMetadata {
  return {
    schemaVersion: 1,
    generatorVersion: "feature-inventor test",
    targetCommit: COMMIT,
    generatedAt: "2026-08-17T00:00:00.000Z",
    configDigest: DIGEST,
    sources: { code: true, gitHistoryDays: 90, governedArtifacts: false, runtimeTelemetry: false, complete: true },
  };
}

function pack(snapshotPath: string): ContextPack {
  return {
    id: "context-0123456789abcdef",
    provenance: {
      targetCommit: COMMIT,
      snapshotPath,
      indexSchemaVersion: 1,
      snapshotConfigDigest: DIGEST,
      selector: { kind: "feature", value: "governed-run" },
      packKind: "change",
      requestedMaxEstimatedTokens: 4000,
      effectiveMaxEstimatedTokens: 4000,
    },
    fixedOverheadEstimatedTokens: 320,
    estimatedTokens: 650,
    selected: [],
    overflow: [],
    readingRules: ["Read linked sources."],
  };
}

describe("context-pack proposal provenance", () => {
  const directories: string[] = [];

  function createFixture(): { repoRoot: string; snapshotDirectory: string; jsonRelativePath: string } {
    const repoRoot = mkdtempSync(join(tmpdir(), "feature-inventor-context-provenance-"));
    directories.push(repoRoot);
    const snapshotDirectory = join(repoRoot, ".feature-inventor", "index", "v1", COMMIT);
    const contextDirectory = join(snapshotDirectory, "context");
    mkdirSync(contextDirectory, { recursive: true });
    const item = pack(snapshotDirectory);
    const jsonRelativePath = `.feature-inventor/index/v1/${COMMIT}/context/${item.id}.json`;
    writeFileSync(join(repoRoot, jsonRelativePath), `${JSON.stringify(item, null, 2)}\n`, "utf8");
    writeFileSync(join(contextDirectory, `${item.id}.md`), "# Context Pack\n", "utf8");
    return { repoRoot, snapshotDirectory, jsonRelativePath };
  }

  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
  });

  it("creates a repository-relative, content-hashed proposal reference from a matching persisted pack", () => {
    const fixture = createFixture();
    const reference = createContextPackReference({
      repoRoot: fixture.repoRoot,
      contextPackPath: fixture.jsonRelativePath,
      snapshotDirectory: fixture.snapshotDirectory,
      snapshot: snapshot(),
    });

    expect(reference).toMatchObject({
      id: "context-0123456789abcdef",
      targetCommit: COMMIT,
      jsonPath: fixture.jsonRelativePath,
      markdownPath: `.feature-inventor/index/v1/${COMMIT}/context/context-0123456789abcdef.md`,
      snapshotConfigDigest: DIGEST,
      estimatedTokens: 650,
    });
    expect(reference.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an absolute path, a different snapshot directory, or a pack that does not match the current snapshot", () => {
    const fixture = createFixture();
    expect(() => createContextPackReference({
      repoRoot: fixture.repoRoot,
      contextPackPath: join(fixture.repoRoot, fixture.jsonRelativePath),
      snapshotDirectory: fixture.snapshotDirectory,
      snapshot: snapshot(),
    })).toThrow("repository-relative");
    expect(() => createContextPackReference({
      repoRoot: fixture.repoRoot,
      contextPackPath: fixture.jsonRelativePath,
      snapshotDirectory: join(fixture.repoRoot, "other-snapshot"),
      snapshot: snapshot(),
    })).toThrow("current snapshot's context directory");

    const jsonPath = join(fixture.repoRoot, fixture.jsonRelativePath);
    const changed = pack(fixture.snapshotDirectory);
    changed.provenance.targetCommit = "1111111111111";
    writeFileSync(jsonPath, `${JSON.stringify(changed, null, 2)}\n`, "utf8");
    expect(() => createContextPackReference({
      repoRoot: fixture.repoRoot,
      contextPackPath: fixture.jsonRelativePath,
      snapshotDirectory: fixture.snapshotDirectory,
      snapshot: snapshot(),
    })).toThrow("target commit");
  });
});

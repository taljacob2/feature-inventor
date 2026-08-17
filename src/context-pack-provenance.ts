import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { readContextPack } from "./indexing/context-pack.js";
import type { IndexSnapshotMetadata } from "./indexing/types.js";
import type { ContextPackReference } from "./run-proposal.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toRepositoryPath(repoRoot: string, absolutePath: string): string {
  const result = relative(repoRoot, absolutePath).split("\\").join("/");
  if (result === "" || result.startsWith("../") || result === "..") throw new Error("Context pack path must remain inside the repository");
  return result;
}

function assertContextPackShape(pack: ReturnType<typeof readContextPack>): void {
  if (!/^context-[0-9a-f]{16}$/.test(pack.id)) throw new Error("Persisted context pack has an invalid ID");
  if (!/^[0-9a-f]{7,64}$/i.test(pack.provenance.targetCommit)) throw new Error("Persisted context pack has an invalid target commit");
  if (pack.provenance.indexSchemaVersion !== 1) throw new Error("Persisted context pack has an unsupported index schema version");
  if (!/^sha256:[0-9a-f]{64}$/.test(pack.provenance.snapshotConfigDigest)) throw new Error("Persisted context pack has an invalid snapshot config digest");
  if (!["feature", "flow", "path", "command"].includes(pack.provenance.selector.kind) || pack.provenance.selector.value.trim() === "") {
    throw new Error("Persisted context pack has an invalid explicit selector");
  }
  if (!["orientation", "change", "verification", "deep"].includes(pack.provenance.packKind)) {
    throw new Error("Persisted context pack has an invalid pack kind");
  }
  if (!Number.isInteger(pack.provenance.effectiveMaxEstimatedTokens) || !Number.isInteger(pack.estimatedTokens) || pack.estimatedTokens > pack.provenance.effectiveMaxEstimatedTokens) {
    throw new Error("Persisted context pack has invalid token accounting");
  }
}

export interface CreateContextPackReferenceInput {
  repoRoot: string;
  contextPackPath: string;
  snapshotDirectory: string;
  snapshot: IndexSnapshotMetadata;
}

/**
 * Freezes a verified local context pack into a proposal-safe reference. The
 * stored digest covers the persisted JSON pack; the reference does not make the
 * pack verification evidence or alter run execution semantics.
 */
export function createContextPackReference(input: CreateContextPackReferenceInput): ContextPackReference {
  if (isAbsolute(input.contextPackPath)) throw new Error("--context-pack must be a repository-relative JSON artifact path");
  const repoRoot = resolve(input.repoRoot);
  const snapshotDirectory = resolve(input.snapshotDirectory);
  const expectedContextDirectory = join(snapshotDirectory, "context");
  const jsonPath = resolve(repoRoot, input.contextPackPath);
  if (dirname(jsonPath) !== expectedContextDirectory) {
    throw new Error("Context pack must be stored under the current snapshot's context directory");
  }
  if (!existsSync(jsonPath)) throw new Error(`Context pack JSON artifact does not exist: ${input.contextPackPath}`);
  const content = readFileSync(jsonPath, "utf8");
  const pack = readContextPack(jsonPath);
  assertContextPackShape(pack);
  if (pack.provenance.targetCommit !== input.snapshot.targetCommit) {
    throw new Error("Context pack target commit does not match the current index snapshot");
  }
  if (pack.provenance.snapshotConfigDigest !== input.snapshot.configDigest) {
    throw new Error("Context pack config digest does not match the current index snapshot");
  }
  if (resolve(pack.provenance.snapshotPath) !== snapshotDirectory) {
    throw new Error("Context pack snapshot path does not match the current index snapshot");
  }
  if (jsonPath !== join(expectedContextDirectory, `${pack.id}.json`)) {
    throw new Error("Context pack JSON filename does not match its recorded pack ID");
  }
  const markdownPath = join(expectedContextDirectory, `${pack.id}.md`);
  if (!existsSync(markdownPath)) throw new Error("Context pack Markdown artifact is missing");
  return {
    schemaVersion: 1,
    id: pack.id,
    targetCommit: pack.provenance.targetCommit,
    jsonPath: toRepositoryPath(repoRoot, jsonPath),
    markdownPath: toRepositoryPath(repoRoot, markdownPath),
    contentHash: sha256(content),
    indexSchemaVersion: pack.provenance.indexSchemaVersion,
    snapshotConfigDigest: pack.provenance.snapshotConfigDigest,
    selector: { ...pack.provenance.selector },
    packKind: pack.provenance.packKind,
    effectiveMaxEstimatedTokens: pack.provenance.effectiveMaxEstimatedTokens,
    estimatedTokens: pack.estimatedTokens,
  };
}

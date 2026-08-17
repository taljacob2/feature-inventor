import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFeatureRegistry, parseSourceAnchor, validateFeatureRegistry } from "./feature-registry.js";

const VALID_REGISTRY = `
version: 1
features:
  - id: sample-feature
    name: Sample feature
    intent: Demonstrate a source-linked feature declaration.
    entryPoints:
      - src/entry.ts#runFeature
    primaryPaths:
      - src/service.ts#performWork
    tests:
      - src/service.test.ts
    flows:
      - sample-flow
    riskTags:
      - lifecycle-state
flows:
  - id: sample-flow
    name: Sample flow
    startsAt:
      - src/entry.ts#runFeature
    steps:
      - source: src/entry.ts#runFeature
        role: command-dispatch
      - source: src/service.ts#performWork
        role: implementation
`;

describe("feature registry", () => {
  const directories: string[] = [];

  function createFixture(): string {
    const directory = mkdtempSync(join(tmpdir(), "feature-inventor-index-registry-"));
    directories.push(directory);
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "src", "entry.ts"), "export function runFeature(): void {}\n", "utf8");
    writeFileSync(join(directory, "src", "service.ts"), "export function performWork(): void {}\n", "utf8");
    writeFileSync(join(directory, "src", "service.test.ts"), "export {};\n", "utf8");
    return directory;
  }

  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
  });

  it("parses and validates a source-linked feature and flow registry", () => {
    const registry = parseFeatureRegistry(VALID_REGISTRY);
    expect(registry.features[0]?.id).toBe("sample-feature");
    expect(registry.flows[0]?.steps).toHaveLength(2);

    const validation = validateFeatureRegistry(createFixture(), VALID_REGISTRY);
    expect(validation.valid).toBe(true);
    expect(validation.diagnostics).toEqual([]);
  });

  it("allows an explicit empty test list when a repository has no automated test anchors", () => {
    const testlessRegistry = VALID_REGISTRY.replace("    tests:\n      - src/service.test.ts", "    tests: []");

    const validation = validateFeatureRegistry(createFixture(), testlessRegistry);

    expect(validation.valid).toBe(true);
    expect(validation.registry?.features[0]?.tests).toEqual([]);
  });

  it("continues to require the tests field even when its list may be empty", () => {
    expect(() => parseFeatureRegistry(VALID_REGISTRY.replace("    tests:\n      - src/service.test.ts\n", ""))).toThrow(
      "features[0].tests must be an array",
    );
  });

  it("reports missing symbol anchors and unknown feature flow references", () => {
    const invalid = VALID_REGISTRY
      .replace("src/service.ts#performWork", "src/service.ts#missingWork")
      .replace("      - sample-flow\n    riskTags", "      - missing-flow\n    riskTags");

    const validation = validateFeatureRegistry(createFixture(), invalid);
    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "Referenced exported symbol does not exist: src/service.ts#missingWork",
        "Feature sample-feature references unknown flow missing-flow",
      ]),
    );
  });

  it("rejects unsupported fields and malformed source references rather than ignoring them", () => {
    expect(() => parseFeatureRegistry(VALID_REGISTRY.replace("version: 1", "version: 1\nunknown: true"))).toThrow("unknown is not supported");
    expect(() => parseSourceAnchor("../outside.ts#run")).toThrow("safe relative path");
    expect(() => parseSourceAnchor("src/entry.ts#not-a-symbol")).toThrow("invalid symbol anchor");
  });
});

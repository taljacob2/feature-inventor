import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDocsValidate } from "../cli.js";

const REGISTRY = `
version: 1
features:
  - id: sample
    name: Sample
    intent: Validate one declared capability.
    entryPoints:
      - src/entry.ts#runSample
    primaryPaths:
      - src/entry.ts#runSample
    tests:
      - src/entry.test.ts
    flows:
      - sample-flow
    riskTags:
      - lifecycle-state
flows:
  - id: sample-flow
    name: Sample flow
    startsAt:
      - src/entry.ts#runSample
    steps:
      - source: src/entry.ts#runSample
        role: command-dispatch
`;

describe("docs validate command", () => {
  let directory: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let priorExitCode: string | number | null | undefined;

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = priorExitCode ?? undefined;
  });

  it("reports the committed index as valid in JSON without generating an index snapshot", () => {
    directory = mkdtempSync(join(tmpdir(), "feature-inventor-docs-command-"));
    mkdirSync(join(directory, "docs", "indexing"), { recursive: true });
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "INDEX.md"), "# Index\n", "utf8");
    writeFileSync(join(directory, "docs", "indexing", "features.yml"), REGISTRY, "utf8");
    writeFileSync(join(directory, "src", "entry.ts"), "export function runSample(): void {}\n", "utf8");
    writeFileSync(join(directory, "src", "entry.test.ts"), "export {};\n", "utf8");
    priorExitCode = process.exitCode;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runDocsValidate(directory, { json: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      valid: true,
      rootIndexPresent: true,
      diagnostics: [],
    });
  });
});

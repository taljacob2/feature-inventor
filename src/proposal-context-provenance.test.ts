import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runIndexContext, runPropose } from "./cli.js";
import { buildIndexSnapshot } from "./indexing/index-builder.js";
import { DEFAULT_INDEXING_CONFIG } from "./indexing/types.js";
import { parseRunProposal } from "./run-proposal.js";

const REGISTRY = `
version: 1
features:
  - id: sample
    name: Sample
    intent: Exercise proposal context provenance.
    entryPoints:
      - src/entry.ts#run
    primaryPaths:
      - src/entry.ts
      - src/service.ts
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
      - src/entry.ts#run
    steps:
      - source: src/entry.ts#run
        role: command-dispatch
`;

function manifest(autoPrepareOnPropose = false): string {
  return JSON.stringify({
  schemaVersion: 1,
  repository: { url: "https://github.com/example/context-provenance.git", defaultBranch: "master" },
  goals: ["Exercise provenance"],
  requiredChecks: ["npm test"],
  protectedPaths: ["src/**"],
  reviewPolicy: { maxFilesChanged: 10, humanApprovalRequired: true },
  verificationPolicy: {
    riskTagChecks: { "lifecycle-state": ["npm run lifecycle"] },
    protectedPathChecks: ["npm run protected"],
    manualReviewRiskTags: ["lifecycle-state"],
    manualReviewProtectedPaths: true,
  },
  schedule: { mode: "manual" },
  indexing: { ...DEFAULT_INDEXING_CONFIG, autoPrepareOnPropose },
}, null, 2);
}

describe("proposal context-pack provenance", () => {
  const directories: string[] = [];

  function createFixture(autoPrepareOnPropose = false, roadmapTitle = "Exercise provenance"): { directory: string; commit: string } {
    const directory = mkdtempSync(join(tmpdir(), "feature-inventor-proposal-context-"));
    directories.push(directory);
    execFileSync("git", ["init", "-b", "master"], { cwd: directory, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory });
    mkdirSync(join(directory, "docs", "indexing"), { recursive: true });
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, ".gitignore"), ".feature-inventor/\n", "utf8");
    writeFileSync(join(directory, "INDEX.md"), "# Fixture\n", "utf8");
    writeFileSync(join(directory, "ROADMAP.md"), `# Roadmap\n\n## Now\n- [ ] ${roadmapTitle}\n`, "utf8");
    writeFileSync(join(directory, "feature-inventor.target.json"), manifest(autoPrepareOnPropose), "utf8");
    writeFileSync(join(directory, "docs", "indexing", "features.yml"), REGISTRY, "utf8");
    writeFileSync(join(directory, "src", "entry.ts"), 'import { service } from "./service.js";\nexport function run(): string { return service(); }\n', "utf8");
    writeFileSync(join(directory, "src", "service.ts"), 'export function service(): string { return "ok"; }\n', "utf8");
    writeFileSync(join(directory, "src", "entry.test.ts"), 'import { run } from "./entry.js";\nexport {};\n', "utf8");
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: directory });
    return { directory, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim() };
  }

  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("automatically refreshes a clean index and attaches a context pack for one exact curated feature", async () => {
    const { directory, commit } = createFixture(true, "Sample");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPropose(directory, { json: true });
    const proposalData = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    const proposal = parseRunProposal(readFileSync(proposalData.proposalPath, "utf8"));

    expect(proposalData.automaticPreparation).toMatchObject({
      mode: "automatic",
      targetCommit: commit,
      selector: { kind: "feature", value: "sample" },
      skippedReason: null,
    });
    expect(proposal.contextPack).toMatchObject({ targetCommit: commit, selector: { kind: "feature", value: "sample" } });
    expect(proposal.riskVerification).toMatchObject({
      policyApplied: true,
      classification: { riskTags: ["lifecycle-state"] },
      requiredChecks: ["npm test", "npm run lifecycle", "npm run protected"],
    });
    expect(existsSync(join(proposalData.automaticPreparation.snapshotDirectory, "metadata.json"))).toBe(true);
  });

  it("refreshes the index without guessing a context scope when no exact curated feature matches", async () => {
    const { directory } = createFixture(true, "A roadmap title that does not match a feature");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPropose(directory, { json: true });
    const proposalData = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    const proposal = parseRunProposal(readFileSync(proposalData.proposalPath, "utf8"));

    expect(proposalData.automaticPreparation).toMatchObject({ selector: null, contextPack: null });
    expect(proposalData.automaticPreparation.skippedReason).toContain("No single exact curated feature");
    expect(proposal.contextPack).toBeUndefined();
  });

  it("fails closed rather than building automatic context from a dirty checkout", async () => {
    const { directory } = createFixture(true, "Sample");
    writeFileSync(join(directory, "uncommitted.txt"), "dirty\n", "utf8");

    await expect(runPropose(directory, { json: true })).rejects.toThrow("requires a clean working tree");
  });

  it("allows explicit proposal creation to opt out of manifest-enabled automatic preparation", async () => {
    const { directory } = createFixture(true, "Sample");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPropose(directory, { json: true, skipAutomaticPreparation: true });
    const proposalData = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    const proposal = parseRunProposal(readFileSync(proposalData.proposalPath, "utf8"));

    expect(proposalData.automaticPreparation).toBeNull();
    expect(proposal.contextPack).toBeUndefined();
  });

  it("records a fresh persisted context pack as informational immutable proposal provenance", async () => {
    const { directory, commit } = createFixture();
    await buildIndexSnapshot(directory, commit, DEFAULT_INDEXING_CONFIG);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runIndexContext(directory, ["--feature", "sample", "--max-tokens", "500", "--json"]);
    const contextData = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    await runPropose(directory, { json: true, contextPackPath: contextData.artifactPaths.jsonPath.replace(`${directory}/`, "") });
    const proposalData = JSON.parse(String(logSpy.mock.calls[1]?.[0]));
    const proposal = parseRunProposal(readFileSync(proposalData.proposalPath, "utf8"));

    expect(proposal.contextPack).toMatchObject({
      id: contextData.pack.id,
      targetCommit: commit,
      jsonPath: contextData.artifactPaths.jsonPath.replace(`${directory}/`, ""),
      snapshotConfigDigest: contextData.pack.provenance.snapshotConfigDigest,
      estimatedTokens: contextData.pack.estimatedTokens,
    });
    expect(proposal.contextPack?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proposal.riskVerification).toMatchObject({
      policyApplied: true,
      derivedRequiredChecks: ["npm run lifecycle", "npm run protected"],
      requiredChecks: ["npm test", "npm run lifecycle", "npm run protected"],
      manualReviewRequired: true,
      classification: { riskTags: ["lifecycle-state"] },
    });
    expect(existsSync(proposalData.journalPath)).toBe(true);
  });
});

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialTargetManifest, initializeTargetManifest } from "../init.js";
import { parseTargetManifest } from "../target-manifest.js";
import { runCli } from "../cli.js";
import { formatInitResult, parseInitCommandOptions, runInitCommand, type InitPrompt } from "./init.js";

const directories: string[] = [];

function createTemporaryRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "feature-inventor-init-"));
  directories.push(directory);
  return directory;
}

function promptWith(values: string[]): InitPrompt {
  const answers = [...values];
  return {
    ask: async () => answers.shift() ?? "",
    close: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("initialization core", () => {
  it("creates an explicit conservative manifest validated by the ordinary parser", () => {
    const manifest = createInitialTargetManifest({
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Make setup clearer",
      requiredCheck: "npm test",
    });

    expect(manifest.reviewPolicy.humanApprovalRequired).toBe(true);
    expect(manifest.schedule.mode).toBe("manual");
    expect(manifest.indexing?.enabled).toBe(true);
    expect(parseTargetManifest(JSON.stringify(manifest)).manifest).toEqual(manifest);
  });

  it("creates an empty roadmap scaffold and preserves later operator edits", () => {
    const root = createTemporaryRepository();
    const initial = initializeTargetManifest({
      repoRoot: root,
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Initial goal",
      requiredCheck: "npm test",
    });

    expect(initial.roadmapCreated).toBe(true);
    expect(readFileSync(initial.roadmapPath, "utf8")).toContain("## Now");
    writeFileSync(initial.roadmapPath, "# Operator roadmap\n\n## Now\n\n- [ ] Preserve this candidate\n", "utf8");

    const refreshed = initializeTargetManifest({
      repoRoot: root,
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Replacement goal",
      requiredCheck: "npm run build",
      force: true,
    });

    expect(refreshed.roadmapCreated).toBe(false);
    expect(readFileSync(refreshed.roadmapPath, "utf8")).toContain("Preserve this candidate");
  });

  it("locally ignores generated Feature Inventor artifacts without changing a tracked ignore file", () => {
    const root = createTemporaryRepository();
    execFileSync("git", ["init", "--quiet"], { cwd: root });

    initializeTargetManifest({
      repoRoot: root,
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Initial goal",
      requiredCheck: "npm test",
    });
    initializeTargetManifest({
      repoRoot: root,
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Replacement goal",
      requiredCheck: "npm run build",
      force: true,
    });

    const excludePath = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8" }).trim();
    const exclude = readFileSync(join(root, excludePath), "utf8");
    expect(exclude.match(/^\.feature-inventor\/$/gm)).toHaveLength(1);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });

  it("does not overwrite an operator-owned manifest without --force", () => {
    const root = createTemporaryRepository();
    initializeTargetManifest({
      repoRoot: root,
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Initial goal",
      requiredCheck: "npm test",
    });

    expect(() => initializeTargetManifest({
      repoRoot: root,
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Replacement goal",
      requiredCheck: "npm run build",
    })).toThrow("already exists");

    const result = initializeTargetManifest({
      repoRoot: root,
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Replacement goal",
      requiredCheck: "npm run build",
      force: true,
    });
    expect(result.overwritten).toBe(true);
    expect(readFileSync(result.manifestPath, "utf8")).toContain("Replacement goal");
  });
});

describe("init command contract", () => {
  it("parses the fully scriptable grammar and rejects unknown options", () => {
    expect(parseInitCommandOptions([
      "--repository", "https://github.com/example/demo.git",
      "--default-branch", "main",
      "--goal", "Improve onboarding",
      "--check", "npm test",
      "--max-files", "8",
      "--no-indexing",
      "--force",
      "--json",
    ])).toEqual({
      repositoryUrl: "https://github.com/example/demo.git",
      defaultBranch: "main",
      goal: "Improve onboarding",
      requiredCheck: "npm test",
      maxFilesChanged: 8,
      indexingEnabled: false,
      force: true,
      json: true,
    });
    expect(() => parseInitCommandOptions(["--unknown"])).toThrow("Unknown init option");
  });

  it("guides a caller through missing values while retaining explicit provided values", async () => {
    const root = createTemporaryRepository();
    const prompt = promptWith(["https://github.com/example/demo.git", "main", "Improve setup", "npm test"]);
    const result = await runInitCommand(root, { force: false, json: false }, false, () => prompt);

    expect(result.mode).toBe("guided");
    expect(existsSync(join(root, "feature-inventor.target.json"))).toBe(true);
    expect(existsSync(join(root, "ROADMAP.md"))).toBe(true);
    expect(formatInitResult(result)).toContain("Created operator roadmap");
    expect(formatInitResult(result)).toContain("No runtime, proposal, source change, or schedule has been created.");
  });

  it("requires all policy-defining values in non-interactive mode", async () => {
    const root = createTemporaryRepository();
    await expect(runInitCommand(root, { force: false, json: false }, true)).rejects.toThrow("--repository is required");
    expect(existsSync(join(root, "feature-inventor.target.json"))).toBe(false);
  });

  it("routes a non-interactive public CLI invocation without prompts and emits clean JSON", async () => {
    const root = createTemporaryRepository();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli([
      "init",
      "--non-interactive",
      "--format", "json",
      "--repository", "https://github.com/example/demo.git",
      "--default-branch", "main",
      "--goal", "Improve setup",
      "--check", "npm test",
    ], root);

    const output = JSON.parse(String(log.mock.calls[0]![0])) as { mode: string; manifestPath: string; roadmapPath: string; roadmapCreated: boolean };
    expect(output.mode).toBe("non-interactive");
    expect(output.manifestPath).toBe(join(root, "feature-inventor.target.json"));
    expect(output.roadmapPath).toBe(join(root, "ROADMAP.md"));
    expect(output.roadmapCreated).toBe(true);
  });

  it("refuses JSON-guided setup to preserve a clean machine-readable stream", async () => {
    const root = createTemporaryRepository();
    await expect(runCli(["init", "--format", "json"], root)).rejects.toThrow("requires --non-interactive");
  });
});

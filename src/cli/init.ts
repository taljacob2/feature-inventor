import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { detectRepositoryDefaults, initializeTargetManifest, type InitializeTargetInput, type InitializeTargetResult } from "../init.js";

export interface InitCommandOptions {
  repositoryUrl?: string;
  defaultBranch?: string;
  goal?: string;
  requiredCheck?: string;
  maxFilesChanged?: number;
  indexingEnabled?: boolean;
  force: boolean;
  json: boolean;
}

export interface InitPrompt {
  ask(message: string, defaultValue?: string): Promise<string>;
  close(): void;
}

export interface InitCommandResult extends InitializeTargetResult {
  mode: "guided" | "non-interactive";
}

function requireOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive integer`);
  return parsed;
}

/** Parses a portable init grammar. All values can be supplied without a terminal. */
export function parseInitCommandOptions(args: string[]): InitCommandOptions {
  const result: InitCommandOptions = { force: false, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--repository") {
      if (result.repositoryUrl !== undefined) throw new Error("init accepts --repository at most once");
      result.repositoryUrl = requireOptionValue(args, index, "init --repository");
      index += 1;
      continue;
    }
    if (arg === "--default-branch") {
      if (result.defaultBranch !== undefined) throw new Error("init accepts --default-branch at most once");
      result.defaultBranch = requireOptionValue(args, index, "init --default-branch");
      index += 1;
      continue;
    }
    if (arg === "--goal") {
      if (result.goal !== undefined) throw new Error("init accepts --goal at most once");
      result.goal = requireOptionValue(args, index, "init --goal");
      index += 1;
      continue;
    }
    if (arg === "--check") {
      if (result.requiredCheck !== undefined) throw new Error("init accepts --check at most once");
      result.requiredCheck = requireOptionValue(args, index, "init --check");
      index += 1;
      continue;
    }
    if (arg === "--max-files") {
      if (result.maxFilesChanged !== undefined) throw new Error("init accepts --max-files at most once");
      result.maxFilesChanged = parsePositiveInteger(requireOptionValue(args, index, "init --max-files"), "init --max-files");
      index += 1;
      continue;
    }
    if (arg === "--no-indexing") {
      if (result.indexingEnabled === false) throw new Error("init accepts --no-indexing at most once");
      result.indexingEnabled = false;
      continue;
    }
    if (arg === "--force") {
      if (result.force) throw new Error("init accepts --force at most once");
      result.force = true;
      continue;
    }
    if (arg === "--json") {
      if (result.json) throw new Error("init accepts --json at most once");
      result.json = true;
      continue;
    }
    throw new Error(`Unknown init option: ${arg}`);
  }
  return result;
}

function requiredOption(value: string | undefined, option: string): string {
  if (value?.trim()) return value.trim();
  throw new Error(`${option} is required with --non-interactive; run feature-inventor init from an interactive terminal for guided setup`);
}

function createReadlinePrompt(): InitPrompt {
  const readline = createInterface({ input, output });
  return {
    async ask(message: string, defaultValue?: string): Promise<string> {
      const suffix = defaultValue ? ` [${defaultValue}]` : "";
      const answer = (await readline.question(`${message}${suffix}: `)).trim();
      return answer || defaultValue || "";
    },
    close(): void {
      readline.close();
    },
  };
}

async function guidedInput(repoRoot: string, options: InitCommandOptions, prompt: InitPrompt): Promise<Omit<InitializeTargetInput, "repoRoot" | "force">> {
  const defaults = await detectRepositoryDefaults(repoRoot);
  return {
    repositoryUrl: options.repositoryUrl ?? await prompt.ask("Repository URL (used to validate Git origin)", defaults.repositoryUrl ?? undefined),
    defaultBranch: options.defaultBranch ?? await prompt.ask("Default branch (proposals pin this branch to a commit)", defaults.defaultBranch ?? undefined),
    goal: options.goal ?? await prompt.ask("First improvement goal (operator-owned)"),
    requiredCheck: options.requiredCheck ?? await prompt.ask("Required validation command (run after a change)"),
    ...(options.maxFilesChanged === undefined ? {} : { maxFilesChanged: options.maxFilesChanged }),
    ...(options.indexingEnabled === undefined ? {} : { indexingEnabled: options.indexingEnabled }),
  };
}

/** Runs explicit guided setup or an equivalent automation-safe non-interactive path. */
export async function runInitCommand(
  repoRoot: string,
  options: InitCommandOptions,
  nonInteractive: boolean,
  promptFactory: () => InitPrompt = createReadlinePrompt,
): Promise<InitCommandResult> {
  if (nonInteractive) {
    const result = initializeTargetManifest({
      repoRoot,
      repositoryUrl: requiredOption(options.repositoryUrl, "--repository"),
      defaultBranch: requiredOption(options.defaultBranch, "--default-branch"),
      goal: requiredOption(options.goal, "--goal"),
      requiredCheck: requiredOption(options.requiredCheck, "--check"),
      ...(options.maxFilesChanged === undefined ? {} : { maxFilesChanged: options.maxFilesChanged }),
      ...(options.indexingEnabled === undefined ? {} : { indexingEnabled: options.indexingEnabled }),
      force: options.force,
    });
    return { ...result, mode: "non-interactive" };
  }

  const prompt = promptFactory();
  try {
    const values = await guidedInput(repoRoot, options, prompt);
    const result = initializeTargetManifest({ repoRoot, ...values, force: options.force });
    return { ...result, mode: "guided" };
  } finally {
    prompt.close();
  }
}

export function formatInitResult(result: InitCommandResult): string {
  const action = result.overwritten ? "Updated" : "Created";
  return [
    `${action} local target contract: ${result.manifestPath}`,
    `Setup mode: ${result.mode}`,
    `${result.roadmapCreated ? "Created" : "Preserved"} operator roadmap: ${result.roadmapPath}`,
    "Configuration is saved. No runtime, proposal, source change, or schedule has been created.",
    "Next safe steps:",
    "  feature-inventor doctor",
    "  add one reviewed candidate under ROADMAP.md > Now or Next",
    "  feature-inventor overview",
    "  feature-inventor plan",
    "Operator review remains required before any governed execution.",
  ].join("\n");
}

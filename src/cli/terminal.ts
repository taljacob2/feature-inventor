import { resolve } from "node:path";

export type OutputFormat = "human" | "json" | "plain";
export type ColorMode = "auto" | "always" | "never";
export type MotionMode = "auto" | "reduce" | "off";

export interface TerminalCapabilities {
  isInteractive: boolean;
  supportsColor: boolean;
  supportsUnicode: boolean;
  motionReduced: boolean;
  columns: number | null;
}

export interface GlobalCliOptions {
  format: OutputFormat;
  color: ColorMode;
  motion: MotionMode;
  nonInteractive: boolean;
  cwd: string | null;
}

export interface ParsedGlobalCliArguments {
  command: string | undefined;
  commandArgs: string[];
  options: GlobalCliOptions;
}

export const DEFAULT_GLOBAL_CLI_OPTIONS: GlobalCliOptions = {
  format: "human",
  color: "auto",
  motion: "auto",
  nonInteractive: false,
  cwd: null,
};

function requireOptionValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseEnum<T extends string>(value: string, flag: string, values: readonly T[]): T {
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new Error(`${flag} must be ${values.join(", ")}`);
}

/**
 * Parses presentation and repository-location options before command-specific
 * parsers run. These options are intentionally removed from command arguments
 * so legacy command grammars remain compatible.
 */
export function parseGlobalCliArguments(args: string[]): ParsedGlobalCliArguments {
  const options: GlobalCliOptions = { ...DEFAULT_GLOBAL_CLI_OPTIONS };
  const remaining: string[] = [];
  let command: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--format") {
      if (options.format === "json") throw new Error("--format cannot be combined with --json");
      if (options.format !== "human") throw new Error("--format accepts at most one explicit value");
      options.format = parseEnum(requireOptionValue(args, index, "--format"), "--format", ["human", "json", "plain"] as const);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      if (options.format !== "human") throw new Error("--json cannot be combined with --format");
      options.format = "json";
      continue;
    }
    if (arg === "--color") {
      if (options.color !== "auto") throw new Error("--color accepts at most one explicit value");
      options.color = parseEnum(requireOptionValue(args, index, "--color"), "--color", ["auto", "always", "never"] as const);
      index += 1;
      continue;
    }
    if (arg === "--motion") {
      if (options.motion !== "auto") throw new Error("--motion accepts at most one explicit value");
      options.motion = parseEnum(requireOptionValue(args, index, "--motion"), "--motion", ["auto", "reduce", "off"] as const);
      index += 1;
      continue;
    }
    if (arg === "--non-interactive") {
      if (options.nonInteractive) throw new Error("--non-interactive accepts at most once");
      options.nonInteractive = true;
      continue;
    }
    if (arg === "--cwd") {
      if (options.cwd !== null) throw new Error("--cwd accepts at most one path");
      options.cwd = resolve(requireOptionValue(args, index, "--cwd"));
      index += 1;
      continue;
    }
    if (command === undefined && !arg.startsWith("-")) {
      command = arg;
      continue;
    }
    remaining.push(arg);
  }

  return { command, commandArgs: remaining, options };
}

/** Detects capabilities without assuming a particular shell or operating system. */
export function detectTerminalCapabilities(
  environment: NodeJS.ProcessEnv = process.env,
  stdout: Pick<NodeJS.WriteStream, "isTTY" | "columns"> = process.stdout,
): TerminalCapabilities {
  const isInteractive = Boolean(stdout.isTTY) && environment.CI !== "true";
  const forcedNoColor = environment.NO_COLOR !== undefined || environment.TERM === "dumb";
  const locale = `${environment.LC_ALL ?? ""} ${environment.LC_CTYPE ?? ""} ${environment.LANG ?? ""}`.toLowerCase();
  const supportsUnicode = !/^(c|posix)(\.|$)/.test(locale) && environment.TERM !== "dumb";
  const motionReduced = environment.FEATURE_INVENTOR_REDUCE_MOTION === "1";
  return {
    isInteractive,
    supportsColor: isInteractive && !forcedNoColor,
    supportsUnicode,
    motionReduced,
    columns: typeof stdout.columns === "number" && stdout.columns > 0 ? stdout.columns : null,
  };
}

export function resolvePresentation(options: GlobalCliOptions, capabilities: TerminalCapabilities): {
  format: OutputFormat;
  colorEnabled: boolean;
  motionEnabled: boolean;
  unicodeEnabled: boolean;
} {
  return {
    format: options.format,
    colorEnabled: options.format === "human" && (options.color === "always" || (options.color === "auto" && capabilities.supportsColor)),
    motionEnabled: options.format === "human" && options.motion === "auto" && !capabilities.motionReduced,
    unicodeEnabled: options.format !== "plain" && capabilities.supportsUnicode,
  };
}

/** Returns command-specific args with the existing JSON shorthand restored when supported. */
export function withLegacyJsonArgument(commandArgs: string[], options: GlobalCliOptions): string[] {
  return options.format === "json" ? [...commandArgs, "--json"] : commandArgs;
}

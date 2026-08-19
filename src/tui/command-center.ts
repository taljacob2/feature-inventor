import { COMMAND_NAMES } from "../cli/command-spec.js";
import type { TuiMutationAction } from "./types.js";

const MAX_COMMAND_LENGTH = 4_096;
const MAX_TOKEN_COUNT = 64;
const MAX_TOKEN_LENGTH = 2_048;

const READ_ONLY_TOP_LEVEL_COMMANDS = new Set([
  "overview",
  "status",
  "doctor",
  "plan",
  "journal",
  "recap",
  "help",
  "completion",
]);

const READ_ONLY_INDEX_SUBCOMMANDS = new Set(["status", "report", "heatmap"]);
const READ_ONLY_DOCS_SUBCOMMANDS = new Set(["validate"]);

export type TuiPaletteGroup = "Start here" | "Plan safely" | "Govern a run" | "Advanced";

export interface TuiPaletteCommand {
  id: string;
  group: TuiPaletteGroup;
  label: string;
  description: string;
  commandInput?: string;
  destination?: "runs";
}

/**
 * Ordered visible actions for the command palette. Templates make required
 * values obvious; selecting one opens the focused command editor rather than
 * executing a partially specified lifecycle command.
 */
export const TUI_COMMAND_CATALOG: readonly TuiPaletteCommand[] = [
  {
    id: "overview",
    group: "Start here",
    label: "Repository overview",
    description: "See repository health, current work, and the next safe action.",
    commandInput: "overview",
  },
  {
    id: "doctor",
    group: "Start here",
    label: "Check prerequisites",
    description: "Run a read-only repository, manifest, Git, and policy health check.",
    commandInput: "doctor",
  },
  {
    id: "runs",
    group: "Start here",
    label: "Review governed runs",
    description: "Browse approval state, lifecycle status, and append-only evidence.",
    destination: "runs",
  },
  {
    id: "plan",
    group: "Plan safely",
    label: "Inspect planned improvements",
    description: "Read the approved roadmap queue without starting work.",
    commandInput: "plan",
  },
  {
    id: "index-build",
    group: "Plan safely",
    label: "Build repository index",
    description: "Create a commit-pinned local index before proposing a change.",
    commandInput: "index build",
  },
  {
    id: "propose",
    group: "Plan safely",
    label: "Create a governed proposal",
    description: "Pin one planned change to a commit and policy snapshot. No runtime starts.",
    commandInput: "propose",
  },
  {
    id: "approve",
    group: "Govern a run",
    label: "Record human approval",
    description: "Bind a reviewer decision and rationale to an immutable proposal.",
    commandInput: "approve RUN_ID --reviewer NAME --note \"Reviewed scope and checks.\"",
  },
  {
    id: "run",
    group: "Govern a run",
    label: "Launch an approved run",
    description: "Start one proposal through a selected runtime after its approval gate passes.",
    commandInput: "run --runtime manus --run RUN_ID",
  },
  {
    id: "watch",
    group: "Govern a run",
    label: "Watch or recover a run",
    description: "Observe one runtime lifecycle or recover durable evidence.",
    commandInput: "watch --run RUN_ID",
  },
  {
    id: "verify",
    group: "Govern a run",
    label: "Verify, review, and finalize",
    description: "Record checks, inspect evidence, and complete a reviewed lifecycle.",
    commandInput: "verify --run RUN_ID --check \"npm test\"",
  },
  {
    id: "stop",
    group: "Govern a run",
    label: "Request a stop",
    description: "Request a graceful stop; use --cancel only when cancellation is intended.",
    commandInput: "stop",
  },
  {
    id: "raw-command",
    group: "Advanced",
    label: "Enter any Feature Inventor command",
    description: "Use the complete supported command surface with safe argv parsing and policy checks.",
    commandInput: "",
  },
  {
    id: "schedule",
    group: "Advanced",
    label: "Create a scheduler handoff",
    description: "Write a proposal-pinned handoff without starting a scheduler.",
    commandInput: "schedule handoff --run RUN_ID --runtime manus",
  },
  {
    id: "cli-help",
    group: "Advanced",
    label: "Browse CLI help",
    description: "Print the authoritative grouped command interface and examples.",
    commandInput: "help",
  },
] as const;

export interface TuiParsedCommand {
  command: string[];
  requiresConfirmation: boolean;
  confirmationPhrase: string;
  label: string;
  description: string;
}

function commandLabel(command: readonly string[]): string {
  const [primary, secondary] = command;
  return secondary && !secondary.startsWith("-") ? `${primary} ${secondary}` : (primary ?? "");
}

function isReadOnlyCommand(command: readonly string[]): boolean {
  const [primary, secondary] = command;
  if (READ_ONLY_TOP_LEVEL_COMMANDS.has(primary ?? "")) return true;
  if (primary === "index") return READ_ONLY_INDEX_SUBCOMMANDS.has(secondary ?? "");
  if (primary === "docs") return READ_ONLY_DOCS_SUBCOMMANDS.has(secondary ?? "");
  return false;
}

function hasDisallowedToken(command: readonly string[]): boolean {
  return command.some((token) => (
    token === "--cwd"
    || token.startsWith("--cwd=")
    || token === "|"
    || token === ";"
    || token === "&&"
    || token === "||"
    || token === ">"
    || token === ">>"
    || token === "<"
  ));
}

/**
 * Splits an entered command into an argv vector without executing a shell.
 * Single and double quotes preserve spaces; backslash escapes one character.
 */
export function parseTuiCommandInput(input: string): string[] {
  if (input.length === 0) throw new Error("Enter a Feature Inventor command.");
  if (input.length > MAX_COMMAND_LENGTH) throw new Error(`Command is too long; maximum length is ${MAX_COMMAND_LENGTH} characters.`);

  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  const push = (): void => {
    if (current.length === 0) return;
    if (current.length > MAX_TOKEN_LENGTH) throw new Error(`Command token is too long; maximum length is ${MAX_TOKEN_LENGTH} characters.`);
    tokens.push(current);
    current = "";
    if (tokens.length > MAX_TOKEN_COUNT) throw new Error(`Command has too many arguments; maximum count is ${MAX_TOKEN_COUNT}.`);
  };

  for (const character of input) {
    if (character < " " || character === "\u007f") throw new Error("Command contains an unsupported control character.");
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      push();
      continue;
    }
    current += character;
  }

  if (escaping) throw new Error("Command cannot end with an escape character.");
  if (quote) throw new Error("Command contains an unterminated quoted value.");
  push();
  if (tokens.length === 0) throw new Error("Enter a Feature Inventor command.");
  return tokens;
}

/**
 * Validates a user-entered argv vector for the TUI. It accepts Feature
 * Inventor commands only and deliberately never invokes a shell.
 */
export function parseTuiCommand(commandInput: string): TuiParsedCommand {
  const command = parseTuiCommandInput(commandInput);
  const primary = command[0];
  if (primary === "tui") throw new Error("Nested TUI sessions are not supported. Use the current workspace or press Q to exit.");
  if (!COMMAND_NAMES.includes(primary as (typeof COMMAND_NAMES)[number])) {
    throw new Error(`Unsupported Feature Inventor command: ${primary}. Use the palette to discover supported actions.`);
  }
  if (hasDisallowedToken(command)) {
    throw new Error("The TUI does not accept shell operators or --cwd. It always runs in the current target repository.");
  }

  const label = commandLabel(command);
  const requiresConfirmation = !isReadOnlyCommand(command);
  return {
    command,
    requiresConfirmation,
    confirmationPhrase: `EXECUTE ${label.toUpperCase()}`,
    label: `Run feature-inventor ${label}`,
    description: requiresConfirmation
      ? "This command may create evidence, start or stop work, or change local lifecycle state. Existing CLI policy checks still apply."
      : "This command uses the existing Feature Inventor CLI in read-only inspection mode.",
  };
}

export function filterTuiCommandCatalog(query: string): TuiPaletteCommand[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...TUI_COMMAND_CATALOG];
  return TUI_COMMAND_CATALOG.filter((command) => [command.label, command.description, command.group, command.commandInput ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(normalized));
}

export function toTuiCommandAction(parsed: TuiParsedCommand): TuiMutationAction {
  return {
    id: `command:${parsed.command.join(" ")}`,
    label: parsed.label,
    description: parsed.description,
    confirmationPhrase: parsed.confirmationPhrase,
    command: [...parsed.command],
  };
}

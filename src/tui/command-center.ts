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

export const TUI_COMMAND_EXAMPLES = [
  "run --runtime manus --run RUN_ID",
  "stop",
  "approve RUN_ID --reviewer NAME --note \"Reviewed scope and checks.\"",
  "verify --run RUN_ID --check \"npm test\"",
  "review --run RUN_ID",
  "finalize --run RUN_ID",
  "recover --run RUN_ID",
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
 * Validates a user-entered argv vector for the TUI command center. It accepts
 * Feature Inventor commands only and deliberately never invokes a shell.
 */
export function parseTuiCommand(commandInput: string): TuiParsedCommand {
  const command = parseTuiCommandInput(commandInput);
  const primary = command[0];
  if (primary === "tui") throw new Error("Nested TUI sessions are not supported. Use the current dashboard or press Q to exit.");
  if (!COMMAND_NAMES.includes(primary as (typeof COMMAND_NAMES)[number])) {
    throw new Error(`Unsupported Feature Inventor command: ${primary}. Use H for supported examples.`);
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

export function toTuiCommandAction(parsed: TuiParsedCommand): TuiMutationAction {
  return {
    id: `command:${parsed.command.join(" ")}`,
    label: parsed.label,
    description: parsed.description,
    confirmationPhrase: parsed.confirmationPhrase,
    command: [...parsed.command],
  };
}

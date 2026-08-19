import { filterTuiCommandCatalog, parseTuiCommand, toTuiCommandAction } from "./command-center.js";
import { renderTuiFrame } from "./render.js";
import { type TuiLaunchOptions, type TuiMutationAction, type TuiState, type TuiWorkflow } from "./types.js";

type Key = { name?: string; ctrl?: boolean; sequence?: string };
export type TuiRawKeypress = { input: string | undefined; key: Key };

function dimensions(): { columns: number; rows: number } {
  return {
    columns: process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80,
    rows: process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : 24,
  };
}

function createState(options: TuiLaunchOptions): TuiState {
  const size = dimensions();
  return {
    view: "home",
    workflow: null,
    selectedRunIndex: 0,
    selectedPaletteIndex: 0,
    snapshot: options.dataSource.readSnapshot(),
    detail: null,
    confirmation: null,
    paletteQuery: "",
    commandInput: "",
    notice: null,
    columns: size.columns,
    rows: size.rows,
    colorEnabled: options.colorEnabled,
    unicodeEnabled: options.unicodeEnabled,
  };
}

function selectedRunId(state: TuiState): string | null {
  return state.snapshot.status.governedRuns[state.selectedRunIndex]?.runId ?? null;
}

function clampRunSelection(state: TuiState): void {
  const count = state.snapshot.status.governedRuns.length;
  state.selectedRunIndex = count === 0 ? 0 : Math.min(Math.max(0, state.selectedRunIndex), count - 1);
}

function clampPaletteSelection(state: TuiState): void {
  const count = filterTuiCommandCatalog(state.paletteQuery).length;
  state.selectedPaletteIndex = count === 0 ? 0 : Math.min(Math.max(0, state.selectedPaletteIndex), count - 1);
}

function updateDimensions(state: TuiState): void {
  const size = dimensions();
  state.columns = size.columns;
  state.rows = size.rows;
}

function refresh(state: TuiState, options: TuiLaunchOptions): void {
  state.snapshot = options.dataSource.readSnapshot();
  clampRunSelection(state);
  if (state.view === "detail" && selectedRunId(state)) state.detail = options.dataSource.readRunDetail(selectedRunId(state)!);
  state.notice = `Refreshed ${state.snapshot.refreshedAt}`;
}

function openHome(state: TuiState): void {
  state.view = "home";
  state.workflow = null;
  state.detail = null;
  state.confirmation = null;
  state.notice = null;
}

function openWorkflow(state: TuiState, workflow: TuiWorkflow): void {
  state.view = "workflow";
  state.workflow = workflow;
  state.notice = null;
}

function openPalette(state: TuiState, query = ""): void {
  state.view = "palette";
  state.paletteQuery = query;
  state.selectedPaletteIndex = 0;
  state.notice = null;
}

function openCommandEditor(state: TuiState, commandInput = ""): void {
  state.view = "command";
  state.commandInput = commandInput;
  state.notice = null;
}

function render(state: TuiState): void {
  process.stdout.write(`\u001B[2J\u001B[H${renderTuiFrame(state)}`);
}

function enterAlternateScreen(): void {
  process.stdout.write("\u001B[?1049h\u001B[?25l\u001B[2J\u001B[H");
}

function exitAlternateScreen(): void {
  process.stdout.write("\u001B[?25h\u001B[?1049l");
}

/**
 * Treat only one printable character as text input. Control and composition
 * input is deliberately ignored by the command and confirmation editors.
 */
export function isPrintableKeypressInput(input: unknown): input is string {
  return typeof input === "string" && input.length === 1 && input >= " " && input !== "\u007f";
}

export function isEnterKeypress(input: unknown, key: Key = {}): boolean {
  return key.name === "return" || key.name === "enter" || input === "\r" || input === "\n" || key.sequence === "\r" || key.sequence === "\n";
}

function toInputString(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString("utf8");
  return "";
}

/**
 * Decodes raw stdin exactly once instead of relying on terminal-specific
 * readline keypress events. This keeps Enter, arrows, escape, backspace,
 * Ctrl+C, and ordinary text deterministic across PowerShell and Unix TTYs.
 */
export function decodeTuiRawInput(chunk: unknown): TuiRawKeypress[] {
  const source = toInputString(chunk);
  const events: TuiRawKeypress[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    const remainder = source.slice(index);

    if (remainder.startsWith("\u001b[A")) {
      events.push({ input: undefined, key: { name: "up", sequence: "\u001b[A" } });
      index += 2;
      continue;
    }
    if (remainder.startsWith("\u001b[B")) {
      events.push({ input: undefined, key: { name: "down", sequence: "\u001b[B" } });
      index += 2;
      continue;
    }
    if (remainder.startsWith("\u001b[3~")) {
      events.push({ input: undefined, key: { name: "delete", sequence: "\u001b[3~" } });
      index += 3;
      continue;
    }
    if (character === "\r") {
      if (source[index + 1] === "\n") index += 1;
      events.push({ input: "\r", key: { name: "return", sequence: "\r" } });
      continue;
    }
    if (character === "\n") {
      events.push({ input: "\n", key: { name: "enter", sequence: "\n" } });
      continue;
    }
    if (character === "\u0003") {
      events.push({ input: undefined, key: { name: "c", ctrl: true, sequence: "\u0003" } });
      continue;
    }
    if (character === "\u007f" || character === "\b") {
      events.push({ input: undefined, key: { name: "backspace", sequence: character } });
      continue;
    }
    if (character === "\u001b") {
      events.push({ input: undefined, key: { name: "escape", sequence: "\u001b" } });
      continue;
    }

    events.push({ input: character, key: { name: character, sequence: character } });
  }

  return events;
}

/**
 * Starts the optional interactive workspace. The controller owns terminal
 * input and rendering only; all repository work remains in the established
 * command implementation supplied by the caller.
 */
export async function launchTui(options: TuiLaunchOptions): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("tui requires an interactive terminal; use `feature-inventor overview` for a scriptable summary");
  }

  const state = createState(options);
  const stdin = process.stdin;
  let active = true;
  let handling = false;
  let resolveExit: (() => void) | null = null;

  const cleanup = (): void => {
    stdin.off("data", onData);
    process.stdout.off("resize", onResize);
    if (stdin.isRaw) stdin.setRawMode(false);
    stdin.pause();
    exitAlternateScreen();
  };

  const finish = (): void => {
    if (!active) return;
    active = false;
    cleanup();
    resolveExit?.();
  };

  const onResize = (): void => {
    if (!active) return;
    updateDimensions(state);
    render(state);
  };

  const executeAction = async (action: TuiMutationAction): Promise<void> => {
    state.confirmation = null;
    state.commandInput = "";
    state.view = "home";
    state.workflow = null;
    state.notice = `Running: feature-inventor ${action.command.join(" ")}`;
    render(state);

    stdin.off("data", onData);
    process.stdout.off("resize", onResize);
    if (stdin.isRaw) stdin.setRawMode(false);
    stdin.pause();
    exitAlternateScreen();
    try {
      await options.executeCommand(action.command);
      state.notice = `Completed: feature-inventor ${action.command.join(" ")}. Review terminal scrollback for command output.`;
    } catch (error) {
      state.notice = `Command failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (!active) return;
      enterAlternateScreen();
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
      process.stdout.on("resize", onResize);
      refresh(state, options);
      render(state);
    }
  };

  const previewCommand = async (): Promise<void> => {
    try {
      const parsed = parseTuiCommand(state.commandInput);
      const action = toTuiCommandAction(parsed);
      if (parsed.requiresConfirmation) {
        state.confirmation = { action, typedValue: "" };
        state.view = "confirm";
        state.notice = `Preview: feature-inventor ${action.command.join(" ")}`;
      } else {
        await executeAction(action);
      }
    } catch (error) {
      state.notice = error instanceof Error ? error.message : String(error);
    }
  };

  const executeConfirmation = async (): Promise<void> => {
    const confirmation = state.confirmation;
    if (!confirmation || confirmation.typedValue !== confirmation.action.confirmationPhrase) return;
    await executeAction(confirmation.action);
  };

  const openSelectedPaletteCommand = (): void => {
    const command = filterTuiCommandCatalog(state.paletteQuery)[state.selectedPaletteIndex];
    if (!command) return;
    if (command.destination === "runs") {
      state.view = "runs";
      state.notice = null;
      clampRunSelection(state);
      return;
    }
    openCommandEditor(state, command.commandInput ?? "");
  };

  const openSelectedRunAction = (action: "approve" | "run" | "stop"): void => {
    const runId = selectedRunId(state);
    if (action === "stop") {
      openCommandEditor(state, "stop");
      return;
    }
    if (!runId) {
      openPalette(state, action);
      state.notice = "Choose a command template, then provide the required run identifier.";
      return;
    }
    if (action === "approve") {
      openCommandEditor(state, `approve ${runId} --reviewer NAME --note "Reviewed scope and checks."`);
      return;
    }
    openCommandEditor(state, `run --runtime manus --run ${runId}`);
  };

  const advanceWorkflow = (step: string): void => {
    if (state.workflow === "plan") {
      if (step === "1") openCommandEditor(state, "plan");
      else if (step === "2") openCommandEditor(state, "index build");
      else if (step === "3") openCommandEditor(state, "propose");
      return;
    }
    if (state.workflow === "govern") {
      if (step === "1") {
        state.view = "runs";
        clampRunSelection(state);
      } else if (step === "2") openSelectedRunAction("approve");
      else if (step === "3") openSelectedRunAction("run");
      else if (step === "4") openCommandEditor(state, "verify --run RUN_ID --check \"npm test\"");
    }
  };

  const handleKeypress = async (input: string | undefined, key: Key): Promise<void> => {
    if (key.ctrl && key.name === "c") {
      finish();
      return;
    }
    if (key.name === "q" && state.view !== "command" && state.view !== "confirm") {
      finish();
      return;
    }

    if (state.view === "palette") {
      if (key.name === "escape") openHome(state);
      else if (key.name === "backspace" || key.name === "delete") {
        state.paletteQuery = state.paletteQuery.slice(0, -1);
        clampPaletteSelection(state);
      } else if (key.name === "up") {
        state.selectedPaletteIndex -= 1;
        clampPaletteSelection(state);
      } else if (key.name === "down") {
        state.selectedPaletteIndex += 1;
        clampPaletteSelection(state);
      } else if (isEnterKeypress(input, key)) {
        openSelectedPaletteCommand();
      } else if (isPrintableKeypressInput(input)) {
        state.paletteQuery += input;
        clampPaletteSelection(state);
      }
      render(state);
      return;
    }

    if (state.view === "command") {
      if (key.name === "escape") openPalette(state);
      else if (key.name === "backspace" || key.name === "delete") state.commandInput = state.commandInput.slice(0, -1);
      else if (isEnterKeypress(input, key)) {
        await previewCommand();
        return;
      } else if (isPrintableKeypressInput(input)) state.commandInput += input;
      render(state);
      return;
    }

    if (state.view === "confirm") {
      if (key.name === "escape") {
        state.confirmation = null;
        openPalette(state);
        state.notice = "Command cancelled.";
      } else if (key.name === "backspace" || key.name === "delete") {
        if (state.confirmation) state.confirmation.typedValue = state.confirmation.typedValue.slice(0, -1);
      } else if (isEnterKeypress(input, key)) {
        await executeConfirmation();
        return;
      } else if (isPrintableKeypressInput(input) && state.confirmation) {
        state.confirmation.typedValue += input;
      }
      render(state);
      return;
    }

    if (key.name === "/" || input === "/") {
      openPalette(state);
    } else if (key.name === "?" || input === "?") {
      state.view = "help";
    } else if (key.name === "u") {
      refresh(state, options);
    } else if (key.name === "d" || key.name === "escape") {
      openHome(state);
    } else if (key.name === "1" && state.view === "home") {
      openWorkflow(state, "plan");
    } else if (key.name === "2" && state.view === "home") {
      openWorkflow(state, "govern");
    } else if (key.name === "3" && state.view === "home") {
      state.view = "runs";
      clampRunSelection(state);
    } else if (state.view === "workflow" && ["1", "2", "3", "4"].includes(key.name ?? "")) {
      advanceWorkflow(key.name!);
    } else if (key.name === "r") {
      state.view = "runs";
      clampRunSelection(state);
    } else if (key.name === "a") {
      openSelectedRunAction("approve");
    } else if (key.name === "g") {
      openSelectedRunAction("run");
    } else if (key.name === "s") {
      openSelectedRunAction("stop");
    } else if (key.name === "up" && state.view === "runs") {
      state.selectedRunIndex -= 1;
      clampRunSelection(state);
    } else if (key.name === "down" && state.view === "runs") {
      state.selectedRunIndex += 1;
      clampRunSelection(state);
    } else if (isEnterKeypress(input, key) && state.view === "runs") {
      const runId = selectedRunId(state);
      if (runId) {
        state.detail = options.dataSource.readRunDetail(runId);
        state.view = "detail";
      }
    }
    render(state);
  };

  const onData = (chunk: unknown): void => {
    if (handling || !active) return;
    const events = decodeTuiRawInput(chunk);
    if (events.length === 0) return;
    handling = true;
    void (async () => {
      try {
        for (const event of events) {
          if (!active) break;
          await handleKeypress(event.input, event.key);
        }
      } finally {
        handling = false;
      }
    })();
  };

  enterAlternateScreen();
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", onData);
  process.stdout.on("resize", onResize);
  render(state);

  await new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
}

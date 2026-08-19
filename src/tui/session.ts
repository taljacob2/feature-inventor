import { emitKeypressEvents } from "node:readline";
import { filterTuiCommandCatalog, parseTuiCommand, toTuiCommandAction } from "./command-center.js";
import { renderTuiFrame } from "./render.js";
import { type TuiLaunchOptions, type TuiMutationAction, type TuiState, type TuiWorkflow } from "./types.js";

type Key = { name?: string; ctrl?: boolean; sequence?: string };

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
 * Node keypress events can omit their text payload on Windows for control,
 * composition, and terminal-specific events. Treat only one printable string
 * as text input; every other payload is intentionally a harmless no-op.
 */
export function isPrintableKeypressInput(input: unknown): input is string {
  return typeof input === "string" && input.length === 1 && input >= " " && input !== "\u007f";
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
    stdin.off("keypress", onKeypress);
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

    stdin.off("keypress", onKeypress);
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
      emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("keypress", onKeypress);
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
      openCommandEditor(state, `approve ${runId} --reviewer NAME --note \"Reviewed scope and checks.\"`);
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

  const onKeypress = (input: string | undefined, key: Key = {}): void => {
    if (handling || !active) return;
    handling = true;
    void (async () => {
      try {
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
          } else if (key.name === "return" || key.name === "enter") {
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
          else if (key.name === "return" || key.name === "enter") {
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
          } else if (key.name === "return" || key.name === "enter") {
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
        } else if ((key.name === "return" || key.name === "enter") && state.view === "runs") {
          const runId = selectedRunId(state);
          if (runId) {
            state.detail = options.dataSource.readRunDetail(runId);
            state.view = "detail";
          }
        }
        render(state);
      } finally {
        handling = false;
      }
    })();
  };

  enterAlternateScreen();
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on("keypress", onKeypress);
  process.stdout.on("resize", onResize);
  render(state);

  await new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
}

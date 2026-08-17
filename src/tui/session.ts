import { emitKeypressEvents } from "node:readline";
import { renderTuiFrame } from "./render.js";
import { TUI_MUTATION_ACTIONS, type TuiLaunchOptions, type TuiState } from "./types.js";

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
    view: "dashboard",
    selectedRunIndex: 0,
    snapshot: options.dataSource.readSnapshot(),
    detail: null,
    confirmation: null,
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

function updateDimensions(state: TuiState): void {
  const size = dimensions();
  state.columns = size.columns;
  state.rows = size.rows;
}

function refresh(state: TuiState, options: TuiLaunchOptions): void {
  state.snapshot = options.dataSource.readSnapshot();
  clampRunSelection(state);
  state.detail = state.view === "detail" && selectedRunId(state) ? options.dataSource.readRunDetail(selectedRunId(state)!) : null;
  state.notice = `Refreshed ${state.snapshot.refreshedAt}`;
}

function beginConfirmation(state: TuiState, actionId: "index-build" | "propose"): void {
  const action = TUI_MUTATION_ACTIONS.find((candidate) => candidate.id === actionId);
  if (!action) return;
  state.confirmation = { action, typedValue: "" };
  state.view = "confirm";
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

function isPrintable(input: string): boolean {
  return input.length === 1 && input >= " " && input !== "\u007f";
}

/**
 * Starts an optional interactive presentation layer. The controller owns only
 * terminal input and rendering; repository operations are supplied by the
 * caller so established CLI command contracts remain the sole action path.
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

  const executeConfirmation = async (): Promise<void> => {
    const confirmation = state.confirmation;
    if (!confirmation || confirmation.typedValue !== confirmation.action.confirmationPhrase) return;
    state.confirmation = null;
    state.view = "dashboard";
    state.notice = `Running: feature-inventor ${confirmation.action.command.join(" ")}`;
    render(state);

    stdin.off("keypress", onKeypress);
    process.stdout.off("resize", onResize);
    if (stdin.isRaw) stdin.setRawMode(false);
    stdin.pause();
    exitAlternateScreen();
    try {
      await options.executeCommand(confirmation.action.command);
      state.notice = `Completed: feature-inventor ${confirmation.action.command.join(" ")}. Review terminal scrollback for command output.`;
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

  const onKeypress = (input: string, key: Key): void => {
    if (handling || !active) return;
    handling = true;
    void (async () => {
      try {
        if (key.ctrl && key.name === "c") {
          finish();
          return;
        }
        if (key.name === "q" && state.view !== "confirm") {
          finish();
          return;
        }
        if (state.view === "confirm") {
          if (key.name === "escape") {
            state.confirmation = null;
            state.view = "dashboard";
            state.notice = "Action cancelled.";
          } else if (key.name === "backspace" || key.name === "delete") {
            if (state.confirmation) state.confirmation.typedValue = state.confirmation.typedValue.slice(0, -1);
          } else if (key.name === "return" || key.name === "enter") {
            await executeConfirmation();
            return;
          } else if (isPrintable(input) && state.confirmation) {
            state.confirmation.typedValue += input;
          }
          render(state);
          return;
        }

        if (key.name === "d") {
          state.view = "dashboard";
          state.detail = null;
        } else if (key.name === "r") {
          state.view = "runs";
          clampRunSelection(state);
        } else if (key.name === "h" || input === "?") {
          state.view = "help";
        } else if (key.name === "u") {
          refresh(state, options);
        } else if (key.name === "b") {
          beginConfirmation(state, "index-build");
        } else if (key.name === "p") {
          beginConfirmation(state, "propose");
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
        } else if (key.name === "escape") {
          if (state.view === "detail") state.view = "runs";
          else if (state.view !== "dashboard") state.view = "dashboard";
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

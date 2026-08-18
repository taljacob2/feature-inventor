import type { GovernedRunStatus } from "../cli.js";
import type { TuiState } from "./types.js";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  inverse: "\u001B[7m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
} as const;

function style(text: string, codes: readonly string[], enabled: boolean): string {
  return enabled ? `${codes.join("")}${text}${ANSI.reset}` : text;
}

function truncate(text: string, width: number, unicodeEnabled: boolean): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return unicodeEnabled ? "…" : ".";
  const marker = unicodeEnabled ? "…" : "...";
  if (width <= marker.length) return marker.slice(0, width);
  return `${text.slice(0, width - marker.length)}${marker}`;
}

function padded(text: string, width: number, unicodeEnabled: boolean): string {
  return truncate(text, width, unicodeEnabled).padEnd(width, " ");
}

function divider(width: number, unicodeEnabled: boolean): string {
  return (unicodeEnabled ? "─" : "-").repeat(Math.max(1, width));
}

function approvalLabel(run: GovernedRunStatus): string {
  const reviewer = run.approval.reviewer ? ` by ${run.approval.reviewer}` : "";
  return `${run.approval.state}${reviewer}`;
}

function approvalStyle(run: GovernedRunStatus, enabled: boolean): string {
  const label = approvalLabel(run);
  if (run.approval.state === "approved" || run.approval.state === "not-required") return style(label, [ANSI.green], enabled);
  if (run.approval.state === "pending") return style(label, [ANSI.yellow], enabled);
  return style(label, [ANSI.red], enabled);
}

function runStatusLine(run: GovernedRunStatus, width: number, unicodeEnabled: boolean, colorEnabled: boolean, selected: boolean): string {
  const status = `${run.runId}  ${run.status}  approval:${approvalLabel(run)}`;
  const marker = selected ? (unicodeEnabled ? "›" : ">") : " ";
  const rendered = `${marker} ${padded(status, Math.max(1, width - 2), unicodeEnabled)}`;
  return selected ? style(rendered, [ANSI.inverse], colorEnabled) : rendered;
}

function dashboardLines(state: TuiState): string[] {
  const { status } = state.snapshot;
  const width = state.columns;
  const lines = [
    style("DASHBOARD", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    divider(width, state.unicodeEnabled),
    style("NOW", [ANSI.bold], state.colorEnabled),
  ];

  const currentItems = status.nowItems.length > 0 ? status.nowItems : status.nextPreview;
  if (currentItems.length === 0) lines.push(style("No queued roadmap candidates.", [ANSI.dim], state.colorEnabled));
  else currentItems.slice(0, 5).forEach((item) => lines.push(`  ${state.unicodeEnabled ? "•" : "-"} ${truncate(item, Math.max(1, width - 4), state.unicodeEnabled)}`));

  lines.push("", style("GOVERNED RUNS", [ANSI.bold], state.colorEnabled));
  if (status.governedRuns.length === 0) {
    lines.push(style("No governed runs have been recorded.", [ANSI.dim], state.colorEnabled));
  } else {
    status.governedRuns.slice(0, 4).forEach((run) => {
      lines.push(`  ${truncate(run.runId, 30, state.unicodeEnabled)}  ${run.status}  ${approvalStyle(run, state.colorEnabled)}`);
    });
  }

  lines.push("", style("SAFE ACTIONS", [ANSI.bold], state.colorEnabled));
  lines.push("  [C] Commands   [G] Run selected   [A] Approve selected   [S] Stop   [R] Runs");
  lines.push("  [U] Refresh    [B] Build index    [P] Propose");
  lines.push(style("C opens the governed command center. Lifecycle-changing commands require typed confirmation.", [ANSI.dim], state.colorEnabled));
  return lines;
}

function runsLines(state: TuiState): string[] {
  const runs = state.snapshot.status.governedRuns;
  const width = state.columns;
  const lines = [
    style("GOVERNED RUNS", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    divider(width, state.unicodeEnabled),
  ];
  if (runs.length === 0) {
    lines.push(style("No governed runs have been recorded.", [ANSI.dim], state.colorEnabled));
  } else {
    runs.forEach((run, index) => lines.push(runStatusLine(run, width, state.unicodeEnabled, state.colorEnabled, index === state.selectedRunIndex)));
    lines.push("");
    lines.push(style("Use Up/Down to select, Enter for details, Esc to return.", [ANSI.dim], state.colorEnabled));
  }
  return lines;
}

function detailLines(state: TuiState): string[] {
  const width = state.columns;
  const detail = state.detail;
  if (!detail) return [style("RUN DETAIL", [ANSI.bold, ANSI.cyan], state.colorEnabled), divider(width, state.unicodeEnabled), "No run selected."];
  const { run, events } = detail;
  const lines = [
    style(`RUN DETAIL  ${run.runId}`, [ANSI.bold, ANSI.cyan], state.colorEnabled),
    divider(width, state.unicodeEnabled),
    `Status: ${run.status}`,
    `Approval: ${approvalStyle(run, state.colorEnabled)}`,
    `Review readiness: ${run.reviewReadiness ?? "not created"}`,
    `Scheduled runtime: ${run.scheduledRuntime ?? "none"}`,
    "",
    style("APPEND-ONLY EVENTS", [ANSI.bold], state.colorEnabled),
  ];
  if (events.length === 0) lines.push(style("No journal events available.", [ANSI.dim], state.colorEnabled));
  else events.slice(-Math.max(1, state.rows - 13)).forEach((event) => lines.push(truncate(`  ${event.timestamp}  ${event.type}`, width, state.unicodeEnabled)));
  lines.push("", style("Esc returns to the run list. The TUI never edits journal evidence.", [ANSI.dim], state.colorEnabled));
  return lines;
}

function commandLines(state: TuiState): string[] {
  const width = state.columns;
  return [
    style("GOVERNED COMMAND CENTER", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    divider(width, state.unicodeEnabled),
    "Enter a supported Feature Inventor command without the `feature-inventor` prefix.",
    "Examples: run --runtime manus --run RUN_ID | stop | approve RUN_ID --reviewer NAME --note \"Reviewed scope.\"",
    "Shortcuts: G pre-fills Manus run for the selected run, A pre-fills approval, and S pre-fills stop.",
    "",
    `> ${state.commandInput}`,
    "",
    style("Enter previews the exact command. Lifecycle-changing commands require a typed EXECUTE phrase.", [ANSI.bold], state.colorEnabled),
    style("No shell syntax and no --cwd override are accepted. Existing CLI approvals and policy checks are never bypassed.", [ANSI.dim], state.colorEnabled),
    style("Esc returns to the dashboard. H shows keyboard help.", [ANSI.dim], state.colorEnabled),
  ];
}

function helpLines(state: TuiState): string[] {
  const width = state.columns;
  return [
    style("KEYBOARD HELP", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    divider(width, state.unicodeEnabled),
    "D  Dashboard",
    "C  Command center for supported Feature Inventor commands",
    "G  Pre-fill Manus run for the selected governed run",
    "A  Pre-fill approval for the selected governed run",
    "S  Pre-fill stop request",
    "R  Governed runs",
    "Up/Down  Select a run",
    "Enter  Open selected run detail",
    "U  Refresh read-only repository state",
    "B  Build the local index after typing BUILD INDEX",
    "P  Create a proposal after typing CREATE PROPOSAL",
    "Q or Ctrl+C  Exit the TUI",
    "",
    style("The command center can launch the full supported CLI lifecycle, including run and stop, after command preview and required typed confirmation.", [ANSI.bold], state.colorEnabled),
    style("It passes argv directly to Feature Inventor. It does not invoke a shell or bypass existing governance checks.", [ANSI.dim], state.colorEnabled),
  ];
}

function confirmationLines(state: TuiState): string[] {
  const confirmation = state.confirmation;
  if (!confirmation) return [];
  const width = state.columns;
  const action = confirmation.action;
  const complete = confirmation.typedValue === action.confirmationPhrase;
  return [
    style("CONFIRM COMMAND", [ANSI.bold, ANSI.yellow], state.colorEnabled),
    divider(width, state.unicodeEnabled),
    style(action.label, [ANSI.bold], state.colorEnabled),
    action.description,
    "",
    `Type ${style(action.confirmationPhrase, [ANSI.bold], state.colorEnabled)} and press Enter to continue:`,
    `> ${confirmation.typedValue}`,
    complete ? style("Confirmation phrase matches. Enter will return to the normal CLI command.", [ANSI.green], state.colorEnabled) : style("Esc cancels. Existing CLI policy checks still apply after confirmation.", [ANSI.dim], state.colorEnabled),
  ];
}

function compactLines(state: TuiState): string[] {
  return [
    style("Feature Inventor TUI", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    `Terminal is ${state.columns}x${state.rows}; resize to at least 80x24 for the full dashboard.`,
    "Use feature-inventor overview for a non-interactive summary.",
    "Press Q to exit.",
  ];
}

export function renderTuiFrame(state: TuiState): string {
  const lines = state.columns < 80 || state.rows < 24
    ? compactLines(state)
    : state.view === "runs"
      ? runsLines(state)
      : state.view === "detail"
        ? detailLines(state)
        : state.view === "help"
          ? helpLines(state)
          : state.view === "command"
            ? commandLines(state)
            : state.view === "confirm"
            ? confirmationLines(state)
            : dashboardLines(state);

  const header = style(
    padded("Feature Inventor  |  D dashboard  C commands  R runs  H help  U refresh  Q quit", state.columns, state.unicodeEnabled),
    [ANSI.bold],
    state.colorEnabled,
  );
  const footer = state.notice ? style(truncate(state.notice, state.columns, state.unicodeEnabled), [ANSI.yellow], state.colorEnabled) : style("Command center launches CLI argv directly; lifecycle-changing commands require typed confirmation.", [ANSI.dim], state.colorEnabled);
  const availableLines = Math.max(1, state.rows - 3);
  const visible = lines.slice(0, availableLines).map((line) => truncate(line, state.columns, state.unicodeEnabled));
  return `${header}\n${divider(state.columns, state.unicodeEnabled)}\n${visible.join("\n")}\n${footer}`;
}

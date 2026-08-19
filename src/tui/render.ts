import type { GovernedRunStatus } from "../cli.js";
import { filterTuiCommandCatalog } from "./command-center.js";
import type { TuiState, TuiWorkflow } from "./types.js";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  inverse: "\u001B[7m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  magenta: "\u001B[35m",
  blue: "\u001B[34m",
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

function divider(width: number, unicodeEnabled: boolean, muted = false): string {
  const character = unicodeEnabled ? "─" : "-";
  return muted ? character.repeat(Math.max(1, width)).replace(/./g, "·") : character.repeat(Math.max(1, width));
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

function section(title: string, state: TuiState): string {
  return style(title.toUpperCase(), [ANSI.bold, ANSI.cyan], state.colorEnabled);
}

function card(number: string, title: string, detail: string, state: TuiState, color: readonly string[] = [ANSI.blue]): string[] {
  const width = state.columns;
  return [
    style(` ${number} `, [ANSI.bold, ...color], state.colorEnabled) + style(`  ${title}`, [ANSI.bold], state.colorEnabled),
    style(`     ${truncate(detail, Math.max(1, width - 5), state.unicodeEnabled)}`, [ANSI.dim], state.colorEnabled),
  ];
}

function nextStep(state: TuiState): { title: string; detail: string } {
  const pending = state.snapshot.status.governedRuns.find((run) => run.approval.state === "pending");
  if (pending) {
    return {
      title: "Review a pending approval",
      detail: `${pending.runId} is ready for reviewer attention before it can run.`,
    };
  }
  const active = state.snapshot.status.governedRuns.find((run) => run.status === "active");
  if (active) {
    return {
      title: "Check active work",
      detail: `${active.runId} is active. Open Runs to inspect durable evidence or request a stop.`,
    };
  }
  const candidate = state.snapshot.status.nowItems[0] ?? state.snapshot.status.nextPreview[0];
  if (candidate) {
    return {
      title: "Plan your next improvement",
      detail: candidate,
    };
  }
  return {
    title: "Start with a repository check",
    detail: "Run a health check to understand this target before proposing work.",
  };
}

function homeLines(state: TuiState): string[] {
  const { status } = state.snapshot;
  const next = nextStep(state);
  const runCount = status.governedRuns.length;
  const pending = status.governedRuns.filter((run) => run.approval.state === "pending").length;
  const planned = status.nowItems.length + status.nextPreview.length;
  const lines = [
    style("FEATURE INVENTOR", [ANSI.bold, ANSI.magenta], state.colorEnabled),
    style("Governed improvement, at a human pace.", [ANSI.dim], state.colorEnabled),
    "",
    section("Start here", state),
    ...card("1", "Plan an improvement", "Understand the queue, build context, and create a proposal.", state, [ANSI.blue]),
    "",
    ...card("2", "Govern a run", "Review evidence, approve work, launch a runtime, and complete the lifecycle.", state, [ANSI.green]),
    "",
    ...card("3", "Review governed runs", "See current status, approval state, and durable journal evidence.", state, [ANSI.yellow]),
    "",
    ...card("/", "Find any command", "Search the complete command surface when you know what you need.", state, [ANSI.magenta]),
    "",
    section("Next safe step", state),
    style(next.title, [ANSI.bold], state.colorEnabled),
    truncate(next.detail, state.columns, state.unicodeEnabled),
    "",
    style(`${planned} planned  ·  ${runCount} governed run${runCount === 1 ? "" : "s"}  ·  ${pending} awaiting review`, [ANSI.dim], state.colorEnabled),
  ];
  return lines;
}

function workflowTitle(workflow: TuiWorkflow): string {
  return workflow === "plan" ? "PLAN AN IMPROVEMENT" : "GOVERN A RUN";
}

function workflowLines(state: TuiState): string[] {
  const workflow = state.workflow ?? "plan";
  const lines = [
    style(workflowTitle(workflow), [ANSI.bold, ANSI.cyan], state.colorEnabled),
    style(workflow === "plan" ? "Move from understanding to an immutable proposal. Nothing starts a runtime until you choose to run it." : "Move one reviewed proposal through its evidence-backed lifecycle.", [ANSI.dim], state.colorEnabled),
    "",
  ];
  if (workflow === "plan") {
    lines.push(
      ...card("1", "Inspect the queue", "Read what has already been approved for consideration.", state),
      "",
      ...card("2", "Build context", "Create a fresh local index so decisions are based on the current commit.", state),
      "",
      ...card("3", "Create a proposal", "Freeze scope, policy, and verification expectations. No runtime starts.", state),
    );
  } else {
    lines.push(
      ...card("1", "Review a run", "Inspect approval status and durable journal evidence.", state),
      "",
      ...card("2", "Record approval", "Bind a reviewer identity and rationale before protected work can launch.", state),
      "",
      ...card("3", "Launch and observe", "Start an approved runtime, then watch or recover its lifecycle.", state),
      "",
      ...card("4", "Verify and complete", "Record checks, review evidence, and finalize only when requirements pass.", state),
      "",
      ...card("S", "Request a stop", "Ask active work to stop gracefully. Cancellation is a separate deliberate choice.", state, [ANSI.yellow]),
    );
  }
  lines.push("", style("Enter the number for the next step. / opens every command. Esc returns home.", [ANSI.dim], state.colorEnabled));
  return lines;
}

function runStatusLine(run: GovernedRunStatus, width: number, unicodeEnabled: boolean, colorEnabled: boolean, selected: boolean): string {
  const marker = selected ? (unicodeEnabled ? "›" : ">") : " ";
  const status = `${run.runId}  ${run.status}  ${approvalLabel(run)}`;
  const rendered = `${marker} ${padded(status, Math.max(1, width - 2), unicodeEnabled)}`;
  return selected ? style(rendered, [ANSI.inverse], colorEnabled) : rendered;
}

function runsLines(state: TuiState): string[] {
  const runs = state.snapshot.status.governedRuns;
  const lines = [
    style("GOVERNED RUNS", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    style("A focused list of lifecycle state and reviewer readiness.", [ANSI.dim], state.colorEnabled),
    "",
  ];
  if (runs.length === 0) {
    lines.push(style("No governed runs yet. Start in Plan an improvement to create a proposal.", [ANSI.dim], state.colorEnabled));
  } else {
    runs.forEach((run, index) => lines.push(runStatusLine(run, state.columns, state.unicodeEnabled, state.colorEnabled, index === state.selectedRunIndex)));
    lines.push("", style("Up/Down selects · Enter opens evidence · A approves · G launches · S requests stop", [ANSI.dim], state.colorEnabled));
  }
  return lines;
}

function detailLines(state: TuiState): string[] {
  const detail = state.detail;
  if (!detail) return [style("RUN DETAIL", [ANSI.bold, ANSI.cyan], state.colorEnabled), "No run selected."];
  const { run, events } = detail;
  const lines = [
    style("RUN DETAIL", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    style(run.runId, [ANSI.bold], state.colorEnabled),
    "",
    `Lifecycle: ${run.status}`,
    `Approval: ${approvalStyle(run, state.colorEnabled)}`,
    `Review readiness: ${run.reviewReadiness ?? "not created"}`,
    `Scheduled runtime: ${run.scheduledRuntime ?? "none"}`,
    "",
    section("Recent evidence", state),
  ];
  if (events.length === 0) lines.push(style("No journal events are available.", [ANSI.dim], state.colorEnabled));
  else events.slice(-Math.max(1, state.rows - 15)).forEach((event) => lines.push(truncate(`  ${event.timestamp}  ${event.type}`, state.columns, state.unicodeEnabled)));
  lines.push("", style("A approves · G launches · S requests stop · Esc returns to runs", [ANSI.dim], state.colorEnabled));
  return lines;
}

function paletteLines(state: TuiState): string[] {
  const commands = filterTuiCommandCatalog(state.paletteQuery);
  const lines = [
    style("COMMAND PALETTE", [ANSI.bold, ANSI.magenta], state.colorEnabled),
    style("Find a path, then press Enter. The exact command remains visible before it runs.", [ANSI.dim], state.colorEnabled),
    "",
    `Search  ${style(state.paletteQuery || "Type to filter commands", [state.paletteQuery ? ANSI.bold : ANSI.dim], state.colorEnabled)}`,
    divider(state.columns, state.unicodeEnabled),
  ];
  if (commands.length === 0) {
    lines.push(style("No command matches. Keep typing, clear the search, or press Esc to return home.", [ANSI.dim], state.colorEnabled));
    return lines;
  }
  let previousGroup: string | null = null;
  commands.slice(0, Math.max(1, state.rows - 9)).forEach((command, index) => {
    if (command.group !== previousGroup) {
      previousGroup = command.group;
      lines.push("", section(command.group, state));
    }
    const marker = index === state.selectedPaletteIndex ? (state.unicodeEnabled ? "›" : ">") : " ";
    const label = `${marker} ${command.label}`;
    lines.push(index === state.selectedPaletteIndex ? style(label, [ANSI.inverse], state.colorEnabled) : label);
    lines.push(style(`    ${truncate(command.description, Math.max(1, state.columns - 4), state.unicodeEnabled)}`, [ANSI.dim], state.colorEnabled));
  });
  lines.push("", style("Up/Down selects · Enter continues · Esc returns home · Type to filter", [ANSI.dim], state.colorEnabled));
  return lines;
}

function commandLines(state: TuiState): string[] {
  return [
    style("COMMAND EDITOR", [ANSI.bold, ANSI.magenta], state.colorEnabled),
    style("Complete the selected command, then preview it before it runs.", [ANSI.dim], state.colorEnabled),
    "",
    `> ${state.commandInput}`,
    "",
    style("Use quoted values for spaces. The editor passes argv directly to Feature Inventor, never a shell.", [ANSI.dim], state.colorEnabled),
    style("Existing approval, evidence, runtime, and repository policy checks still apply.", [ANSI.dim], state.colorEnabled),
    style("Enter previews · Esc returns to the palette", [ANSI.dim], state.colorEnabled),
  ];
}

function helpLines(state: TuiState): string[] {
  return [
    style("KEYBOARD GUIDE", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    "",
    "1  Plan an improvement",
    "2  Govern a run",
    "3  Review governed runs",
    "/  Search every command",
    "A  Prepare approval for the selected run",
    "G  Prepare a Manus launch for the selected run",
    "S  Prepare a stop request",
    "U  Refresh repository state",
    "?  Show this guide",
    "Q or Ctrl+C  Exit",
    "",
    style("The home screen stays quiet on purpose. Use the palette whenever you need the complete advanced command surface.", [ANSI.dim], state.colorEnabled),
  ];
}

function confirmationLines(state: TuiState): string[] {
  const confirmation = state.confirmation;
  if (!confirmation) return [];
  const action = confirmation.action;
  const complete = confirmation.typedValue === action.confirmationPhrase;
  return [
    style("READY TO EXECUTE", [ANSI.bold, ANSI.yellow], state.colorEnabled),
    style(action.label, [ANSI.bold], state.colorEnabled),
    "",
    action.description,
    "",
    `Type ${style(action.confirmationPhrase, [ANSI.bold], state.colorEnabled)} to continue`,
    `> ${confirmation.typedValue}`,
    "",
    complete
      ? style("Confirmation matches. Press Enter to hand the command to the governed CLI.", [ANSI.green], state.colorEnabled)
      : style("Esc cancels. The normal proposal, approval, evidence, and runtime gates remain in force.", [ANSI.dim], state.colorEnabled),
  ];
}

function compactLines(state: TuiState): string[] {
  return [
    style("Feature Inventor", [ANSI.bold, ANSI.cyan], state.colorEnabled),
    `Terminal is ${state.columns}x${state.rows}. Resize to at least 80x24 for the guided workspace.`,
    "Use feature-inventor overview for a scriptable summary.",
    "Press Q to exit.",
  ];
}

function viewTitle(view: TuiState["view"]): string {
  switch (view) {
    case "home": return "Home";
    case "workflow": return "Workflow";
    case "runs": return "Runs";
    case "detail": return "Evidence";
    case "palette": return "Commands";
    case "command": return "Edit command";
    case "confirm": return "Confirm";
    case "help": return "Help";
  }
}

export function renderTuiFrame(state: TuiState): string {
  const lines = state.columns < 80 || state.rows < 24
    ? compactLines(state)
    : state.view === "workflow"
      ? workflowLines(state)
      : state.view === "runs"
        ? runsLines(state)
        : state.view === "detail"
          ? detailLines(state)
          : state.view === "palette"
            ? paletteLines(state)
            : state.view === "command"
              ? commandLines(state)
              : state.view === "confirm"
                ? confirmationLines(state)
                : state.view === "help"
                  ? helpLines(state)
                  : homeLines(state);

  const header = style(
    padded(`Feature Inventor  /  ${viewTitle(state.view)}                                      ? Help   / Commands   Q Exit`, state.columns, state.unicodeEnabled),
    [ANSI.bold],
    state.colorEnabled,
  );
  const footer = state.notice
    ? style(truncate(state.notice, state.columns, state.unicodeEnabled), [ANSI.yellow], state.colorEnabled)
    : style("Guided when you need it. Powerful when you are ready.", [ANSI.dim], state.colorEnabled);
  const availableLines = Math.max(1, state.rows - 3);
  const visible = lines.slice(0, availableLines).map((line) => truncate(line, state.columns, state.unicodeEnabled));
  return `${header}\n${divider(state.columns, state.unicodeEnabled)}\n${visible.join("\n")}\n${footer}`;
}

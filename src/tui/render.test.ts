import { describe, expect, it } from "vitest";
import type { GovernedRunStatus, StatusData } from "../cli.js";
import { renderTuiFrame } from "./render.js";
import type { TuiState } from "./types.js";

const RUN: GovernedRunStatus = {
  runId: "run-20260817-001",
  status: "active",
  eventCount: 2,
  latestEvent: {
    schemaVersion: 1,
    runId: "run-20260817-001",
    timestamp: "2026-08-17T00:00:01.000Z",
    type: "approval-recorded",
    payload: { reviewer: "maintainer", approvalDigest: "a".repeat(64) },
  },
  startedAt: "2026-08-17T00:00:00.000Z",
  finalizedAt: null,
  approval: { state: "approved", reviewer: "maintainer", approvedAt: "2026-08-17T00:00:01.000Z" },
  reviewReadiness: "pending",
  scheduledRuntime: "manus",
};

const STATUS: StatusData = {
  nowItems: ["Improve review ergonomics"],
  nextPreview: [],
  backlogCounts: { now: 1, next: 0, later: 0, horizon: 0 },
  recentShipped: [],
  recentAttempts: [],
  calibration: { total: 0, shipped: 0, abandoned: 0, successRate: null },
  stopRequestedAt: null,
  lastRun: null,
  daemonHealth: { status: "not-configured", lastCycleAt: null, recentCycles: [] },
  governedRuns: [RUN],
};

function state(overrides: Partial<TuiState> = {}): TuiState {
  return {
    view: "home",
    workflow: null,
    selectedRunIndex: 0,
    selectedPaletteIndex: 0,
    snapshot: { status: STATUS, refreshedAt: "2026-08-17T00:00:00.000Z" },
    detail: null,
    confirmation: null,
    paletteQuery: "",
    commandInput: "",
    notice: null,
    columns: 100,
    rows: 30,
    colorEnabled: false,
    unicodeEnabled: false,
    ...overrides,
  };
}

describe("full-screen TUI renderer", () => {
  it("renders a calm progressive home with one next-safe-step and visible newcomer paths", () => {
    const frame = renderTuiFrame(state());
    expect(frame).toContain("Governed improvement, at a human pace.");
    expect(frame).toContain("Plan an improvement");
    expect(frame).toContain("Govern a run");
    expect(frame).toContain("Review governed runs");
    expect(frame).toContain("Find any command");
    expect(frame).toContain("Check active work");
    expect(frame).not.toContain("APPEND-ONLY EVENTS");
    expect(frame).not.toContain("\u001B[31m");
  });

  it("renders focused workflow and evidence views without exposing unrelated command density", () => {
    const workflow = renderTuiFrame(state({ view: "workflow", workflow: "plan" }));
    expect(workflow).toContain("PLAN AN IMPROVEMENT");
    expect(workflow).toContain("Inspect the queue");
    expect(workflow).toContain("Build context");
    expect(workflow).toContain("Create a proposal");

    const detail = renderTuiFrame(state({
      view: "detail",
      detail: { run: RUN, events: [RUN.latestEvent] },
    }));
    expect(detail).toContain("RECENT EVIDENCE");
    expect(detail).toContain("approval-recorded");
    expect(detail).toContain("A approves");
  });

  it("renders grouped searchable command discovery and a focused command editor", () => {
    const palette = renderTuiFrame(state({ view: "palette", paletteQuery: "run" }));
    expect(palette).toContain("COMMAND PALETTE");
    expect(palette).toContain("Launch an approved run");
    expect(palette).toContain("Watch or recover a run");
    expect(palette).toContain("Request a stop");

    const editor = renderTuiFrame(state({ view: "command", commandInput: "run --runtime manus --run RUN_ID" }));
    expect(editor).toContain("COMMAND EDITOR");
    expect(editor).toContain("run --runtime manus --run RUN_ID");
    expect(editor).toContain("never a shell");
  });

  it("renders confirmation and compact fallback states with keyboard recovery guidance", () => {
    const confirm = renderTuiFrame(state({
      view: "confirm",
      confirmation: {
        action: { id: "propose", label: "Create governed proposal", description: "No runtime starts.", confirmationPhrase: "CREATE PROPOSAL", command: ["propose"] },
        typedValue: "CREATE",
      },
    }));
    expect(confirm).toContain("READY TO EXECUTE");
    expect(confirm).toContain("CREATE PROPOSAL");
    expect(confirm).toContain("Esc cancels");

    const compact = renderTuiFrame(state({ columns: 60, rows: 20 }));
    expect(compact).toContain("Resize to at least 80x24");
    expect(compact).toContain("feature-inventor overview");
  });
});

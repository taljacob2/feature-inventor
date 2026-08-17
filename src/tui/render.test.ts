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
    view: "dashboard",
    selectedRunIndex: 0,
    snapshot: { status: STATUS, refreshedAt: "2026-08-17T00:00:00.000Z" },
    detail: null,
    confirmation: null,
    notice: null,
    columns: 100,
    rows: 30,
    colorEnabled: false,
    unicodeEnabled: false,
    ...overrides,
  };
}

describe("full-screen TUI renderer", () => {
  it("renders a governed dashboard from the shared overview contract without color escape sequences", () => {
    const frame = renderTuiFrame(state());
    expect(frame).toContain("Feature Inventor");
    expect(frame).toContain("Improve review ergonomics");
    expect(frame).toContain("run-20260817-001");
    expect(frame).toContain("approved by maintainer");
    expect(frame).toContain("Build and propose require typed confirmation.");
    expect(frame).not.toContain("\u001B[31m");
  });

  it("renders selected governed runs and append-only run details without editing evidence", () => {
    const runs = renderTuiFrame(state({ view: "runs" }));
    expect(runs).toContain("> run-20260817-001");
    expect(runs).toContain("Use Up/Down to select");

    const detail = renderTuiFrame(state({
      view: "detail",
      detail: { run: RUN, events: [RUN.latestEvent] },
    }));
    expect(detail).toContain("APPEND-ONLY EVENTS");
    expect(detail).toContain("approval-recorded");
    expect(detail).toContain("never edits journal evidence");
  });

  it("renders the exact typed phrase for local mutation confirmation and a compact fallback for small terminals", () => {
    const confirm = renderTuiFrame(state({
      view: "confirm",
      confirmation: {
        action: { id: "propose", label: "Create governed proposal", description: "No runtime starts.", confirmationPhrase: "CREATE PROPOSAL", command: ["propose"] },
        typedValue: "CREATE",
      },
    }));
    expect(confirm).toContain("CONFIRM LOCAL ACTION");
    expect(confirm).toContain("CREATE PROPOSAL");
    expect(confirm).toContain("Esc cancels");

    const compact = renderTuiFrame(state({ columns: 60, rows: 20 }));
    expect(compact).toContain("resize to at least 80x24");
    expect(compact).toContain("feature-inventor overview");
  });
});

import type { GovernedRunStatus, StatusData } from "../cli.js";
import type { RunJournalEvent } from "../run-journal.js";

export type TuiView = "dashboard" | "runs" | "detail" | "help" | "confirm";

export interface TuiRunDetail {
  run: GovernedRunStatus;
  events: RunJournalEvent[];
}

export interface TuiSnapshot {
  status: StatusData;
  refreshedAt: string;
}

export interface TuiDataSource {
  readSnapshot(): TuiSnapshot;
  readRunDetail(runId: string): TuiRunDetail | null;
}

export interface TuiMutationAction {
  id: "index-build" | "propose";
  label: string;
  description: string;
  confirmationPhrase: string;
  command: string[];
}

export interface TuiConfirmation {
  action: TuiMutationAction;
  typedValue: string;
}

export interface TuiState {
  view: TuiView;
  selectedRunIndex: number;
  snapshot: TuiSnapshot;
  detail: TuiRunDetail | null;
  confirmation: TuiConfirmation | null;
  notice: string | null;
  columns: number;
  rows: number;
  colorEnabled: boolean;
  unicodeEnabled: boolean;
}

export interface TuiLaunchOptions {
  repoRoot: string;
  dataSource: TuiDataSource;
  colorEnabled: boolean;
  unicodeEnabled: boolean;
  motionEnabled: boolean;
  executeCommand(command: string[]): Promise<void>;
}

export const TUI_MUTATION_ACTIONS: readonly TuiMutationAction[] = [
  {
    id: "index-build",
    label: "Build repository index",
    description: "Create local, commit-pinned index artifacts from a clean checkout. No runtime starts.",
    confirmationPhrase: "BUILD INDEX",
    command: ["index", "build"],
  },
  {
    id: "propose",
    label: "Create governed proposal",
    description: "Create an immutable proposal and journal. No runtime starts.",
    confirmationPhrase: "CREATE PROPOSAL",
    command: ["propose"],
  },
] as const;

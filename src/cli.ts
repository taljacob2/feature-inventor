#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  parseBacklogCounts,
  parseChangelogEntries,
  parseNextSection,
  parseNowSection,
  type BacklogCounts,
} from "./roadmap.js";
import { parseFeatureLogEntries, type FeatureLogEntry } from "./feature-log.js";
import { computeCalibrationStats, type CalibrationStats } from "./calibration.js";
import { computeAutonomyScore } from "./autonomy.js";
import { RUN_SUMMARY_FILENAME, parseRunSummary, type RunSummary } from "./run-summary.js";
import { DEFAULT_RUN_POLICY } from "./engine/contracts.js";
import { RUN_CONFIG_FILENAME, parseRunConfig } from "./run-config.js";
import { buildRunPlan, formatRunPlan, type RunPlanData } from "./run-plan.js";
import { createManusRunTask, type ManusAgentProfile } from "./manus-runtime.js";
import {
  SCHEDULE_HANDOFF_FILENAME,
  assertScheduleHandoffMatchesProposal,
  createScheduleHandoff,
  parseScheduleHandoff,
  serializeScheduleHandoff,
  type ScheduledRuntime,
} from "./schedule-handoff.js";
import { runClaudeCodeProposal } from "./claude-runtime.js";
import { buildDoctorData, formatDoctor } from "./doctor.js";
import { TARGET_MANIFEST_FILENAME, parseTargetManifest } from "./target-manifest.js";
import {
  RUN_PROPOSAL_FILENAME,
  RUNS_DIRECTORY,
  createRunId,
  createRunProposal,
  parseRunProposal,
  serializeRunProposal,
} from "./run-proposal.js";
import { assertProposalMatchesEnvironment } from "./proposal-execution.js";
import {
  getManusTaskSnapshot,
  journalAlreadyContainsSourceEvent,
  journalEventFromManusSnapshot,
  type ManusTaskSnapshot,
} from "./manus-monitor.js";
import {
  RUNTIME_RESULT_FILENAME,
  assertRuntimeResultMatchesProposal,
  deriveVerificationEvidence,
  parseRuntimeResult,
  parseRuntimeResultFile,
  serializeRuntimeResult,
} from "./runtime-result.js";
import {
  REVIEW_PACKET_FILENAME,
  TASK_OUTCOME_FILENAME,
  VERIFICATION_EVIDENCE_FILENAME,
  appendVerificationEvidence,
  createReviewPacket,
  createTaskOutcome,
  parseReviewPacket,
  parseTaskOutcome,
  parseVerificationEvidence,
  serializeReviewPacket,
  serializeTaskOutcome,
} from "./review-packet.js";
import {
  RUN_JOURNAL_FILENAME,
  appendRunJournalEvents,
  assertLegalRunTransition,
  createRunJournalEvent,
  parseRunJournalEvents,
  summarizeRunJournal,
  type RunJournalSummary,
} from "./run-journal.js";
import { STOP_FLAG_FILENAME, parseStopFlag, serializeStopFlag } from "./stop-flag.js";
import {
  RECAP_STATE_FILENAME,
  buildRecap,
  formatRecap,
  parseRecapState,
  serializeRecapState,
} from "./recap.js";
import {
  DAEMON_LOG_FILENAME,
  appendDaemonLogEntries,
  extractSessionId,
  filterStaleNightlySessions,
  isRunDue,
  parseDaemonLogEntries,
  parseIntervalToMs,
  summarizeDaemonHealth,
  type ClaudeAgentSummary,
  type DaemonHealth,
  type DaemonLogEntry,
} from "./daemon.js";

const execFileAsync = promisify(execFile);

function readRequiredFile(repoRoot: string, filename: string): string {
  try {
    return readFileSync(join(repoRoot, filename), "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not read ${filename} (${reason})`);
    process.exit(1);
  }
}

/**
 * feature-log.jsonl is optional: it doesn't exist until the nightly loop has
 * completed at least one Implement phase, so its absence is not an error
 * the way a missing ROADMAP.md/CHANGELOG.md is.
 */
function readOptionalFile(repoRoot: string, filename: string): string | null {
  try {
    return readFileSync(join(repoRoot, filename), "utf8");
  } catch {
    return null;
  }
}

/** How many Next-section titles to preview when the Now section is empty. */
const NEXT_PREVIEW_LIMIT = 3;

export interface GovernedRunStatus extends RunJournalSummary {
  reviewReadiness: "pending" | "blocked" | "ready-to-finalize" | null;
  scheduledRuntime: ScheduledRuntime | null;
}

export interface StatusData {
  nowItems: string[];
  /**
   * Top titles from ROADMAP.md's Next section, populated only when nowItems
   * is empty — a preview so a check-in right after clearing the backlog
   * still shows something concrete instead of an uninformative placeholder.
   */
  nextPreview: string[];
  backlogCounts: BacklogCounts;
  recentShipped: string[];
  recentAttempts: FeatureLogEntry[];
  /** Computed from the full feature-log.jsonl history, not just recentAttempts. */
  calibration: CalibrationStats;
  /** ISO 8601 timestamp if a `feature-inventor stop` request is pending, else null. */
  stopRequestedAt: string | null;
  /** Where the most recent run left off, or null if no run has completed yet. */
  lastRun: RunSummary | null;
  /** Durable daemon cycle outcomes plus derived liveness/staleness. */
  daemonHealth: DaemonHealth;
  /** Recent proposal and execution state derived from append-only run journals. */
  governedRuns: GovernedRunStatus[];
}

/** Returns the newest journal summaries without mutating run artifacts. */
export function getGovernedRunSummaries(repoRoot: string): GovernedRunStatus[] {
  const runsRoot = join(repoRoot, RUNS_DIRECTORY);
  if (!existsSync(runsRoot)) return [];
  try {
    return readdirSync(runsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const content = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, entry.name, RUN_JOURNAL_FILENAME));
        const reviewContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, entry.name, REVIEW_PACKET_FILENAME));
        const handoffContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, entry.name, SCHEDULE_HANDOFF_FILENAME));
        let reviewReadiness: GovernedRunStatus["reviewReadiness"] = null;
        let scheduledRuntime: GovernedRunStatus["scheduledRuntime"] = null;
        if (reviewContent !== null) {
          try {
            reviewReadiness = parseReviewPacket(reviewContent).readiness;
          } catch {
            reviewReadiness = null;
          }
        }
        if (handoffContent !== null) {
          try {
            const proposal = loadProposalForRun(repoRoot, entry.name);
            const handoff = parseScheduleHandoff(handoffContent);
            assertScheduleHandoffMatchesProposal(handoff, proposal);
            scheduledRuntime = handoff.runtime;
          } catch {
            scheduledRuntime = null;
          }
        }
        return { ...summarizeRunJournal(entry.name, content ? parseRunJournalEvents(content) : []), reviewReadiness, scheduledRuntime };
      })
      .filter((summary) => summary.eventCount > 0)
      .sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
  } catch {
    return [];
  }
}

/**
 * Reads ROADMAP.md, CHANGELOG.md, and (optionally) feature-log.jsonl from
 * repoRoot and returns the same parsed data `printStatus` renders as text —
 * the single source of truth for both the human-readable and `--json`
 * output modes, so they can never drift apart.
 */
export function getStatusData(repoRoot: string): StatusData {
  const roadmap = readRequiredFile(repoRoot, "ROADMAP.md");
  const changelog = readRequiredFile(repoRoot, "CHANGELOG.md");

  const nowItems = parseNowSection(roadmap);
  const nextPreview = nowItems.length === 0 ? parseNextSection(roadmap).slice(0, NEXT_PREVIEW_LIMIT) : [];
  const backlogCounts = parseBacklogCounts(roadmap);
  const recentShipped = parseChangelogEntries(changelog, 5);

  const featureLogContent = readOptionalFile(repoRoot, "feature-log.jsonl");
  const allAttempts = featureLogContent ? parseFeatureLogEntries(featureLogContent) : [];
  const recentAttempts = allAttempts.slice(-5).reverse();
  const calibration = computeCalibrationStats(allAttempts);

  const stopFlagContent = readOptionalFile(repoRoot, STOP_FLAG_FILENAME);
  let stopRequestedAt: string | null = null;
  if (stopFlagContent !== null) {
    const parsed = parseStopFlag(stopFlagContent);
    stopRequestedAt = parsed ? parsed.requestedAt : "(unknown time)";
  }

  const runSummaryContent = readOptionalFile(repoRoot, RUN_SUMMARY_FILENAME);
  const lastRun = runSummaryContent ? parseRunSummary(runSummaryContent) : null;

  const daemonLogContent = readOptionalFile(repoRoot, DAEMON_LOG_FILENAME);
  const daemonHealth = summarizeDaemonHealth(daemonLogContent ? parseDaemonLogEntries(daemonLogContent) : []);
  const governedRuns = getGovernedRunSummaries(repoRoot).slice(0, 5);

  return {
    nowItems,
    nextPreview,
    backlogCounts,
    recentShipped,
    recentAttempts,
    calibration,
    stopRequestedAt,
    lastRun,
    daemonHealth,
    governedRuns,
  };
}

/**
 * Returns a read-only portable execution plan. If no configuration file exists,
 * the conservative default policy is used; this command never creates a file,
 * worktree, branch, commit, or remote change.
 */
export function getRunPlanData(repoRoot: string): RunPlanData {
  const roadmap = readRequiredFile(repoRoot, "ROADMAP.md");
  const configContent = readOptionalFile(repoRoot, RUN_CONFIG_FILENAME);
  const policy = configContent
    ? parseRunConfig(configContent)
    : { ...DEFAULT_RUN_POLICY, testCommands: [...DEFAULT_RUN_POLICY.testCommands] };
  return buildRunPlan(roadmap, policy, { runtime: "manus" });
}

export function printRunPlan(repoRoot: string, options: { json?: boolean } = {}): void {
  const data = getRunPlanData(repoRoot);
  console.log(options.json ? JSON.stringify(data, null, 2) : formatRunPlan(data));
}

async function readGitValue(repoRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
    const value = stdout.trim();
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

/** Runs non-mutating target and workspace preflight checks before a governed run. */
export async function runDoctor(repoRoot: string, options: { json?: boolean } = {}): Promise<void> {
  const manifestContent = readOptionalFile(repoRoot, TARGET_MANIFEST_FILENAME);
  let manifest = null;
  let manifestError: string | null = null;
  if (manifestContent === null) {
    manifestError = `${TARGET_MANIFEST_FILENAME} is required; run \`feature-inventor init\` when it is available`;
  } else {
    try {
      manifest = parseTargetManifest(manifestContent);
    } catch (err) {
      manifestError = err instanceof Error ? err.message : String(err);
    }
  }

  const [gitRoot, originUrl, currentBranch, porcelain] = await Promise.all([
    readGitValue(repoRoot, ["rev-parse", "--show-toplevel"]),
    readGitValue(repoRoot, ["remote", "get-url", "origin"]),
    readGitValue(repoRoot, ["branch", "--show-current"]),
    readGitValue(repoRoot, ["status", "--porcelain"]),
  ]);
  const data = buildDoctorData({
    repoRoot,
    gitRoot,
    originUrl,
    currentBranch,
    workspaceClean: porcelain === null ? null : porcelain === "",
    manifest,
    manifestError,
  });
  console.log(options.json ? JSON.stringify(data, null, 2) : formatDoctor(data));
  if (!data.ready) process.exitCode = 1;
}

/** Saves a commit-pinned proposal and its initial journal event without launching an execution runtime. */
export async function runPropose(repoRoot: string, options: { json?: boolean } = {}): Promise<void> {
  const manifestContent = readOptionalFile(repoRoot, TARGET_MANIFEST_FILENAME);
  if (manifestContent === null) throw new Error(`${TARGET_MANIFEST_FILENAME} is required before proposing a run`);
  const { manifest, warnings } = parseTargetManifest(manifestContent);
  const baseCommit = await readGitValue(repoRoot, ["rev-parse", "--verify", `${manifest.repository.defaultBranch}^{commit}`]);
  if (baseCommit === null) {
    throw new Error(`Could not resolve configured default branch ${manifest.repository.defaultBranch} to a commit`);
  }

  const createdAt = new Date().toISOString();
  const runId = createRunId(new Date(createdAt), baseCommit);
  const runDirectory = join(repoRoot, RUNS_DIRECTORY, runId);
  if (existsSync(runDirectory)) throw new Error(`Run proposal already exists: ${runId}`);

  const proposal = createRunProposal({
    runId,
    createdAt,
    baseCommit,
    manifest,
    plan: getRunPlanData(repoRoot),
  });
  const proposalPath = join(runDirectory, RUN_PROPOSAL_FILENAME);
  const journalPath = join(runDirectory, RUN_JOURNAL_FILENAME);
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(proposalPath, serializeRunProposal(proposal), "utf8");
  writeFileSync(
    journalPath,
    appendRunJournalEvents(
      "",
      [
        createRunJournalEvent(runId, "planned", createdAt, {
          baseCommit,
          proposalPath: join(RUNS_DIRECTORY, runId, RUN_PROPOSAL_FILENAME),
        }),
      ],
    ),
    "utf8",
  );

  const data = { runId, proposalPath, journalPath, proposal, warnings };
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`Created governed run proposal: ${runId}`);
  console.log(`Base commit: ${baseCommit}`);
  console.log(`Proposal: ${proposalPath}`);
  console.log(`Journal: ${journalPath}`);
  if (warnings.length > 0) console.log(`Manifest warnings: ${warnings.join("; ")}`);
  console.log("No agent was started and no repository change was made.");
}

/**
 * Writes a reviewable scheduler handoff for one already-approved proposal.
 * This command intentionally schedules and executes nothing by itself.
 */
export function runSchedule(repoRoot: string, args: string[]): void {
  if (args[0] !== "handoff") {
    throw new Error("Usage: feature-inventor schedule handoff RUN_ID --runtime claude|manus [--json]");
  }
  const runId = args[1];
  if (!runId || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(runId)) {
    throw new Error("schedule handoff requires RUN_ID from `feature-inventor propose`");
  }
  const runtimeValue = optionValue(args, "--runtime");
  if (runtimeValue !== "claude" && runtimeValue !== "manus") {
    throw new Error("schedule handoff requires --runtime claude or --runtime manus");
  }
  const proposal = loadProposalForRun(repoRoot, runId);
  const runDirectory = join(repoRoot, RUNS_DIRECTORY, runId);
  const handoffPath = join(runDirectory, SCHEDULE_HANDOFF_FILENAME);
  const existingHandoff = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, SCHEDULE_HANDOFF_FILENAME));
  if (existingHandoff !== null) {
    const handoff = parseScheduleHandoff(existingHandoff);
    assertScheduleHandoffMatchesProposal(handoff, proposal);
    if (handoff.runtime !== runtimeValue) throw new Error(`Run ${runId} already has a handoff for ${handoff.runtime}`);
    const data = { runId, handoffPath, handoff, created: false };
    console.log(args.includes("--json") ? JSON.stringify(data, null, 2) : `Existing ${handoff.runtime} handoff: ${handoffPath}`);
    return;
  }
  const { content: journalContent, events } = loadJournalForRun(repoRoot, runId);
  const handoff = createScheduleHandoff(proposal, runtimeValue, new Date().toISOString());
  const event = createRunJournalEvent(runId, "schedule-handoff-created", handoff.createdAt, {
    runtime: handoff.runtime,
    handoffPath: join(RUNS_DIRECTORY, runId, SCHEDULE_HANDOFF_FILENAME),
    command: handoff.command,
  });
  assertLegalRunTransition(events, event);
  writeFileSync(handoffPath, serializeScheduleHandoff(handoff), "utf8");
  writeFileSync(journalPathForRun(repoRoot, runId), appendRunJournalEvents(journalContent, [event]), "utf8");
  const data = { runId, handoffPath, handoff, created: true };
  console.log(
    args.includes("--json")
      ? JSON.stringify(data, null, 2)
      : `Created ${handoff.runtime} schedule handoff: ${handoffPath}\nNo scheduler was started. An external scheduler may invoke exactly: ${handoff.command}`,
  );
}

function parseRunIdArgument(command: string, args: string[]): string {
  const runId = args.find((arg) => !arg.startsWith("--"));
  if (!runId || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(runId)) {
    throw new Error(`Usage: feature-inventor ${command} RUN_ID [--json]`);
  }
  return runId;
}

/** Prints one durable run journal without modifying recap state or the journal itself. */
export function runJournal(repoRoot: string, args: string[]): void {
  const runId = parseRunIdArgument("journal", args);
  const content = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME));
  if (content === null) throw new Error(`No journal found for ${runId}`);
  const events = parseRunJournalEvents(content);
  const summary = summarizeRunJournal(runId, events);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ summary, events }, null, 2));
    return;
  }
  console.log(`Run journal: ${runId}`);
  console.log(`Status: ${summary.status}; ${summary.eventCount} event(s)`);
  for (const event of events) console.log(`  ${event.timestamp} ${event.type}`);
}

function taskIdFromJournal(events: ReturnType<typeof parseRunJournalEvents>): string | null {
  for (const event of [...events].reverse()) {
    const taskId = event.payload.taskId;
    if (typeof taskId === "string" && taskId.trim() !== "") return taskId;
  }
  return null;
}

function formatManusSnapshot(snapshot: ManusTaskSnapshot): string {
  const lines = [`Manus task: ${snapshot.taskId}`, `Status: ${snapshot.status}`];
  if (snapshot.brief) lines.push(`Brief: ${snapshot.brief}`);
  if (snapshot.description) lines.push(`Detail: ${snapshot.description}`);
  if (snapshot.status === "waiting") {
    lines.push(`Waiting for: ${snapshot.waitingForEventType ?? "operator input"}`);
    if (snapshot.waitingDescription) lines.push(`Waiting detail: ${snapshot.waitingDescription}`);
    lines.push("No action was confirmed. Resolve the request in the task interface, then run watch again.");
  }
  if (snapshot.error) lines.push(`Error: ${snapshot.error}`);
  return lines.join("\n");
}

/**
 * Polls one recorded task and appends at most one new journal event. The
 * recovery form intentionally has the same passive behavior: it is safe after
 * a CLI crash because duplicate source events are not written twice.
 */
export async function runWatch(repoRoot: string, args: string[], mode: "watch" | "recover" = "watch"): Promise<void> {
  const runId = parseRunIdArgument(mode, args);
  const journalPath = join(repoRoot, RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME);
  const journalContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME));
  if (journalContent === null) throw new Error(`No journal found for ${runId}`);
  const events = parseRunJournalEvents(journalContent);
  const taskId = taskIdFromJournal(events);
  if (taskId === null) throw new Error(`Run ${runId} has no recorded Manus task; launch it with \`feature-inventor manus run --run ${runId}\``);

  const snapshot = await getManusTaskSnapshot(process.env.MANUS_API_KEY ?? "", taskId);
  const candidate = journalEventFromManusSnapshot(runId, snapshot);
  let appended = false;
  if (candidate !== null && !journalAlreadyContainsSourceEvent(events, snapshot.sourceEventId)) {
    assertLegalRunTransition(events, candidate);
    writeFileSync(journalPath, appendRunJournalEvents(journalContent, [candidate]), "utf8");
    appended = true;
  }

  const data = { runId, mode, snapshot, journalEventAppended: appended };
  if (args.includes("--json")) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(formatManusSnapshot(snapshot));
  console.log(appended ? `Recorded ${candidate?.type} in ${journalPath}` : "No new journal event was recorded.");
}

function getRunArtifactPaths(repoRoot: string, runId: string) {
  const runDirectory = join(repoRoot, RUNS_DIRECTORY, runId);
  return {
    proposalPath: join(runDirectory, RUN_PROPOSAL_FILENAME),
    journalPath: join(runDirectory, RUN_JOURNAL_FILENAME),
    outcomePath: join(runDirectory, TASK_OUTCOME_FILENAME),
    verificationPath: join(runDirectory, VERIFICATION_EVIDENCE_FILENAME),
    reviewPath: join(runDirectory, REVIEW_PACKET_FILENAME),
    runtimeResultPath: join(runDirectory, RUNTIME_RESULT_FILENAME),
  };
}

function loadProposalForRun(repoRoot: string, runId: string) {
  const content = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUN_PROPOSAL_FILENAME));
  if (content === null) throw new Error(`No proposal found for ${runId}`);
  const proposal = parseRunProposal(content);
  if (proposal.runId !== runId) throw new Error(`Proposal run ID ${proposal.runId} does not match requested run ${runId}`);
  return proposal;
}

function loadJournalForRun(repoRoot: string, runId: string) {
  const content = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME));
  if (content === null) throw new Error(`No journal found for ${runId}`);
  return { content, events: parseRunJournalEvents(content) };
}

/** Captures the latest passive external task outcome into a durable local artifact. */
export async function runCapture(repoRoot: string, args: string[]): Promise<void> {
  const runId = parseRunIdArgument("capture", args);
  const { journalPath, outcomePath, runtimeResultPath } = getRunArtifactPaths(repoRoot, runId);
  const proposal = loadProposalForRun(repoRoot, runId);
  const { content: journalContent, events } = loadJournalForRun(repoRoot, runId);
  const taskId = taskIdFromJournal(events);
  if (taskId === null) throw new Error(`Run ${runId} has no recorded Manus task to capture`);
  const snapshot = await getManusTaskSnapshot(process.env.MANUS_API_KEY ?? "", taskId);
  const candidate = journalEventFromManusSnapshot(runId, snapshot);
  let journalEventAppended = false;
  if (candidate !== null && !journalAlreadyContainsSourceEvent(events, snapshot.sourceEventId)) {
    assertLegalRunTransition(events, candidate);
    writeFileSync(journalPath, appendRunJournalEvents(journalContent, [candidate]), "utf8");
    journalEventAppended = true;
  }
  const outcome = createTaskOutcome({
    runId,
    taskId,
    capturedAt: new Date().toISOString(),
    taskStatus: snapshot.status,
    statusEventId: snapshot.sourceEventId,
    observedAt: snapshot.observedAt,
    brief: snapshot.brief,
    description: snapshot.description,
    assistantReport: snapshot.assistantReport,
    error: snapshot.error,
  });
  writeFileSync(outcomePath, serializeTaskOutcome(outcome), "utf8");
  let runtimeResultError: string | null = null;
  let runtimeResultCaptured = false;
  if (snapshot.structuredOutput !== null) {
    if (!snapshot.structuredOutput.success) {
      runtimeResultError = snapshot.structuredOutput.error ?? "Task structured-output extraction was not successful";
    } else {
      try {
        const runtimeResult = parseRuntimeResult(snapshot.structuredOutput.value);
        assertRuntimeResultMatchesProposal(runtimeResult, proposal);
        writeFileSync(runtimeResultPath, serializeRuntimeResult(runtimeResult), "utf8");
        runtimeResultCaptured = true;
      } catch (err) {
        runtimeResultError = err instanceof Error ? err.message : String(err);
      }
    }
  }
  const data = { runId, outcomePath, outcome, runtimeResultPath, runtimeResultCaptured, runtimeResultError, journalEventAppended };
  console.log(args.includes("--json") ? JSON.stringify(data, null, 2) : `Captured ${snapshot.status} task outcome: ${outcomePath}`);
}

/** Records operator-supplied evidence for one check already required by the proposal. */
export function runVerify(repoRoot: string, args: string[]): void {
  const runId = parseRunIdArgument("verify", args);
  const proposal = loadProposalForRun(repoRoot, runId);
  const check = optionValue(args, "--check");
  const evidence = optionValue(args, "--evidence");
  const passed = args.includes("--passed");
  const failed = args.includes("--failed");
  if (!check || !evidence || passed === failed) {
    throw new Error("Usage: feature-inventor verify RUN_ID --check COMMAND --passed|--failed --evidence TEXT");
  }
  if (!proposal.requiredChecks.includes(check)) throw new Error(`Check is not required by proposal: ${check}`);
  const verificationPath = join(repoRoot, RUNS_DIRECTORY, runId, VERIFICATION_EVIDENCE_FILENAME);
  const existing = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, VERIFICATION_EVIDENCE_FILENAME)) ?? "";
  const item = { check, outcome: passed ? ("passed" as const) : ("failed" as const), recordedAt: new Date().toISOString(), evidence };
  writeFileSync(verificationPath, appendVerificationEvidence(existing, item), "utf8");
  console.log(args.includes("--json") ? JSON.stringify({ runId, verificationPath, item }, null, 2) : `Recorded ${item.outcome} evidence for ${check}`);
}

/** Builds a review packet from captured outcome and append-only verification evidence. */
export function runReview(repoRoot: string, args: string[]): void {
  const runId = parseRunIdArgument("review", args);
  const proposal = loadProposalForRun(repoRoot, runId);
  const { outcomePath, verificationPath, reviewPath, runtimeResultPath } = getRunArtifactPaths(repoRoot, runId);
  const outcomeContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, TASK_OUTCOME_FILENAME));
  const verificationContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, VERIFICATION_EVIDENCE_FILENAME));
  const runtimeResultContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUNTIME_RESULT_FILENAME));
  const taskOutcome = outcomeContent === null ? null : parseTaskOutcome(outcomeContent);
  if (taskOutcome !== null && taskOutcome.runId !== runId) throw new Error(`Task outcome run ID does not match ${runId}`);
  const manualVerification = verificationContent === null ? [] : parseVerificationEvidence(verificationContent);
  const runtimeVerification =
    runtimeResultContent === null
      ? []
      : (() => {
          const runtimeResult = parseRuntimeResultFile(runtimeResultContent);
          assertRuntimeResultMatchesProposal(runtimeResult, proposal);
          return deriveVerificationEvidence(runtimeResult, proposal, new Date().toISOString());
        })();
  const packet = createReviewPacket(
    proposal,
    new Date().toISOString(),
    taskOutcome,
    [...runtimeVerification, ...manualVerification],
    runtimeResultContent !== null,
  );
  writeFileSync(reviewPath, serializeReviewPacket(packet), "utf8");
  const data = { runId, reviewPath, packet, outcomePath, verificationPath, runtimeResultPath, runtimeEvidenceCount: runtimeVerification.length };
  console.log(args.includes("--json") ? JSON.stringify(data, null, 2) : `Created ${packet.readiness} review packet: ${reviewPath}`);
}

/** Finalizes only a ready review packet and only after an explicit local confirmation flag. */
export function runFinalize(repoRoot: string, args: string[]): void {
  const runId = parseRunIdArgument("finalize", args);
  if (!args.includes("--confirm")) throw new Error("Finalization is local-only but requires explicit --confirm after reviewing the packet");
  const { content: journalContent, events } = loadJournalForRun(repoRoot, runId);
  const reviewContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, REVIEW_PACKET_FILENAME));
  if (reviewContent === null) throw new Error(`No review packet found for ${runId}; run \`feature-inventor review ${runId}\` first`);
  const proposal = loadProposalForRun(repoRoot, runId);
  const runtimeResultContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUNTIME_RESULT_FILENAME));
  if (runtimeResultContent === null) throw new Error(`No runtime result found for ${runId}; capture the completed task result before finalizing`);
  const runtimeResult = parseRuntimeResultFile(runtimeResultContent);
  assertRuntimeResultMatchesProposal(runtimeResult, proposal);
  const packet = parseReviewPacket(reviewContent);
  if (
    packet.runId !== runId ||
    packet.readiness !== "ready-to-finalize" ||
    packet.runtimeResultCaptured !== true ||
    packet.proposal.baseCommit !== proposal.target.baseCommit ||
    packet.proposal.manifestHash !== proposal.manifestHash ||
    packet.proposal.policyHash !== proposal.policyHash
  ) {
    throw new Error("Review packet is not ready for this exact proposal; capture a stopped outcome and passing evidence for every required check");
  }
  const reviewEvent = createRunJournalEvent(runId, "review-packet-created", packet.createdAt, {
    reviewPath: join(RUNS_DIRECTORY, runId, REVIEW_PACKET_FILENAME),
    readiness: packet.readiness,
  });
  const finalizedEvent = createRunJournalEvent(runId, "run-finalized", new Date().toISOString(), {
    reviewPath: join(RUNS_DIRECTORY, runId, REVIEW_PACKET_FILENAME),
    verifiedChecks: packet.verification.filter((item) => item.outcome === "passed").map((item) => item.check),
  });
  assertLegalRunTransition(events, reviewEvent);
  assertLegalRunTransition([...events, reviewEvent], finalizedEvent);
  writeFileSync(journalPathForRun(repoRoot, runId), appendRunJournalEvents(journalContent, [reviewEvent, finalizedEvent]), "utf8");
  console.log(args.includes("--json") ? JSON.stringify({ runId, status: "finalized", reviewPath: join(RUNS_DIRECTORY, runId, REVIEW_PACKET_FILENAME) }, null, 2) : `Finalized governed run ${runId} from evidence-backed review packet.`);
}

function journalPathForRun(repoRoot: string, runId: string): string {
  return join(repoRoot, RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME);
}

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseManusAgentProfile(value: string | undefined): ManusAgentProfile | undefined {
  if (value === undefined) return undefined;
  if (value === "manus-1.6" || value === "manus-1.6-lite" || value === "manus-1.6-max") return value;
  throw new Error("--profile must be manus-1.6, manus-1.6-lite, or manus-1.6-max");
}

/**
 * Creates a Manus task from one selected proposal. The CLI verifies the
 * repository origin and target-branch commit before a task is created, then
 * writes the task identity as the next append-only lifecycle event.
 */
export async function runManus(repoRoot: string, args: string[]): Promise<void> {
  if (args[0] !== "run") throw new Error("Usage: feature-inventor manus run --run RUN_ID [options]");
  const runId = optionValue(args, "--run");
  if (!runId || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(runId)) {
    throw new Error("manus run requires --run RUN_ID from `feature-inventor propose`");
  }
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiKey) throw new Error("MANUS_API_KEY is required; set it before running `feature-inventor manus run`");

  const proposalPath = join(repoRoot, RUNS_DIRECTORY, runId, RUN_PROPOSAL_FILENAME);
  const journalPath = join(repoRoot, RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME);
  const proposalContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUN_PROPOSAL_FILENAME));
  const journalContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME));
  if (proposalContent === null) throw new Error(`No proposal found for ${runId}`);
  if (journalContent === null) throw new Error(`No journal found for ${runId}`);
  const proposal = parseRunProposal(proposalContent);
  if (proposal.runId !== runId) throw new Error(`Proposal run ID ${proposal.runId} does not match requested run ${runId}`);

  const [repoUrl, baseCommit] = await Promise.all([
    readGitValue(repoRoot, ["remote", "get-url", "origin"]),
    readGitValue(repoRoot, ["rev-parse", "--verify", `${proposal.target.defaultBranch}^{commit}`]),
  ]);
  if (repoUrl === null) throw new Error("Git remote origin is empty; Manus needs a cloneable repository URL");
  if (baseCommit === null) throw new Error(`Could not resolve configured default branch ${proposal.target.defaultBranch} to a commit`);
  assertProposalMatchesEnvironment(proposal, { repositoryUrl: repoUrl, baseCommit });

  const events = parseRunJournalEvents(journalContent);
  const timestamp = new Date().toISOString();
  const createdEvent = createRunJournalEvent(runId, "task-created", timestamp, { pending: true });
  assertLegalRunTransition(events, createdEvent);

  const task = await createManusRunTask({
    apiKey,
    repoUrl,
    proposal,
    allowRemotePush: args.includes("--allow-remote-push"),
    projectId: optionValue(args, "--project"),
    githubConnectorId: optionValue(args, "--github-connector"),
    agentProfile: parseManusAgentProfile(optionValue(args, "--profile")),
  });

  const recordedEvent = createRunJournalEvent(runId, "task-created", timestamp, {
    taskId: task.taskId,
    taskUrl: task.taskUrl,
    taskTitle: task.taskTitle,
    baseCommit,
    proposalPath: join(RUNS_DIRECTORY, runId, RUN_PROPOSAL_FILENAME),
  });
  writeFileSync(journalPath, appendRunJournalEvents(journalContent, [recordedEvent]), "utf8");

  console.log(
    `Created Manus run task for ${runId}: ${task.taskTitle}\nTask ID: ${task.taskId}\nTask URL: ${task.taskUrl}\n` +
      `Proposal: ${proposalPath}\nJournal: ${journalPath}`,
  );
}


/**
 * Launches Claude Code only from one immutable proposal. The adapter uses a
 * worktree and records concrete lifecycle events; it does not push, open a
 * pull request, or finalize the run.
 */
export async function runClaude(repoRoot: string, args: string[]): Promise<void> {
  if (args[0] !== "run") throw new Error("Usage: feature-inventor claude run --run RUN_ID [--json]");
  const runId = optionValue(args, "--run");
  if (!runId || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(runId)) {
    throw new Error("claude run requires --run RUN_ID from `feature-inventor propose`");
  }
  const proposal = loadProposalForRun(repoRoot, runId);
  const journalPath = join(repoRoot, RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME);
  let journalContent = readOptionalFile(repoRoot, join(RUNS_DIRECTORY, runId, RUN_JOURNAL_FILENAME));
  if (journalContent === null) throw new Error(`No journal found for ${runId}`);
  let events = parseRunJournalEvents(journalContent);
  const [repoUrl, baseCommit] = await Promise.all([
    readGitValue(repoRoot, ["remote", "get-url", "origin"]),
    readGitValue(repoRoot, ["rev-parse", "--verify", `${proposal.target.defaultBranch}^{commit}`]),
  ]);
  if (repoUrl === null || baseCommit === null) throw new Error("Could not resolve the local Git origin and configured default-branch commit");
  assertProposalMatchesEnvironment(proposal, { repositoryUrl: repoUrl, baseCommit });

  const append = (event: ReturnType<typeof createRunJournalEvent>) => {
    assertLegalRunTransition(events, event);
    journalContent = appendRunJournalEvents(journalContent ?? "", [event]);
    writeFileSync(journalPath, journalContent, "utf8");
    events = [...events, event];
  };

  try {
    const outcome = await runClaudeCodeProposal(
      { repoRoot, proposal },
      undefined,
      {
        onWorktreePrepared(preparation) {
          append(createRunJournalEvent(runId, "workspace-prepared", new Date().toISOString(), {
            runtime: "claude-code",
            worktreePath: preparation.worktreePath,
            branchName: preparation.branchName,
          }));
          append(createRunJournalEvent(runId, "candidate-started", new Date().toISOString(), {
            runtime: "claude-code",
            approvedQueue: proposal.queue.map((item) => item.title),
          }));
        },
      },
    );
    if (outcome.runtimeResult === null || outcome.error !== null) {
      append(createRunJournalEvent(runId, "run-failed", new Date().toISOString(), {
        runtime: "claude-code",
        worktreePath: outcome.worktreePath,
        branchName: outcome.branchName,
        exitCode: outcome.process.exitCode,
        error: outcome.error ?? "Claude Code returned no valid runtime result",
      }));
      throw new Error(outcome.error ?? "Claude Code returned no valid runtime result");
    }
    append(createRunJournalEvent(runId, "task-completed", new Date().toISOString(), {
      runtime: "claude-code",
      worktreePath: outcome.worktreePath,
      branchName: outcome.branchName,
      runtimeResultPath: join(RUNS_DIRECTORY, runId, RUNTIME_RESULT_FILENAME),
      checkedOutCommit: outcome.runtimeResult.checkedOutCommit,
      commitSha: outcome.runtimeResult.commitSha,
      remotePushed: outcome.runtimeResult.remotePushed,
    }));
    const data = { runId, worktreePath: outcome.worktreePath, branchName: outcome.branchName, runtimeResultPath: outcome.runtimeResultPath, runtimeResult: outcome.runtimeResult };
    console.log(args.includes("--json") ? JSON.stringify(data, null, 2) : `Claude Code completed governed run ${runId}; review ${outcome.runtimeResultPath} before finalizing.`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const latest = events.at(-1)?.type;
    if (latest !== "run-failed" && latest !== "run-finalized") {
      const failed = createRunJournalEvent(runId, "run-failed", new Date().toISOString(), { runtime: "claude-code", error: reason });
      try {
        append(failed);
      } catch {
        // Preserve the original adapter failure if the journal was concurrently advanced.
      }
    }
    throw err;
  }
}

function formatDaemonAge(ageMs: number | null): string {
  if (ageMs === null) return "an unknown amount of time";
  if (ageMs < 60_000) return "less than a minute";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  return `${Math.floor(ageMs / 3_600_000)}h ${Math.floor((ageMs % 3_600_000) / 60_000)}m`;
}

export function printStatus(repoRoot: string, options: { json?: boolean } = {}): void {
  const data = getStatusData(repoRoot);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const {
    nowItems,
    nextPreview,
    backlogCounts,
    recentShipped,
    recentAttempts,
    calibration,
    stopRequestedAt,
    lastRun,
    daemonHealth,
    governedRuns,
  } = data;

  console.log("Feature Inventor — status\n");

  if (stopRequestedAt) {
    console.log(
      `Stop requested at ${stopRequestedAt} — the nightly loop will wrap up its current feature ` +
        "and stop before starting another. Run `feature-inventor stop --cancel` to undo.\n",
    );
  }

  if (governedRuns.length > 0) {
    console.log("Governed runs:");
    for (const run of governedRuns) {
      const review = run.reviewReadiness ? `, review ${run.reviewReadiness}` : "";
      const scheduled = run.scheduledRuntime ? `, handoff ${run.scheduledRuntime}` : "";
      console.log(`  ${run.runId}: ${run.status}${review}${scheduled}, ${run.eventCount} event(s), latest ${run.latestEvent?.type ?? "(none)"}`);
    }
    console.log("");
  }

  if (lastRun) {
    const stopNote =
      lastRun.stopReason === null
        ? "it worked through its whole queue"
        : lastRun.stopReason === "explicit-stop"
          ? "a stop was requested"
          : "it hit this run's feature cap";
    console.log(
      `Last run finished ${lastRun.completedAt} — ${stopNote}, nothing was left mid-feature. ` +
        `${lastRun.shipped.length} shipped, ${lastRun.abandoned.length} abandoned, ` +
        `${lastRun.notAttempted.length} not attempted.`,
    );
    if (lastRun.notAttempted.length > 0) {
      console.log(
        `Not attempted (already researched and ICE-scored, carried into ROADMAP.md): ${lastRun.notAttempted.join(", ")}`,
      );
    }
    console.log("");
  }

  console.log(`Up next (${nowItems.length}):`);
  if (nowItems.length === 0) {
    if (nextPreview.length > 0) {
      console.log("  (none — ROADMAP.md's Now section is empty; previewing top of Next)");
      for (const item of nextPreview) console.log(`  - ${item}`);
    } else {
      console.log("  (none — ROADMAP.md's Now section is empty)");
    }
  } else {
    for (const item of nowItems) console.log(`  - ${item}`);
  }

  console.log(
    `\nBacklog: ${backlogCounts.next} in Next, ${backlogCounts.later} in Later, ${backlogCounts.horizon} in Horizon.`,
  );

  console.log("\nLegacy daemon (retired):");
  console.log("  No new cycle is started by `feature-inventor daemon`. Use a reviewed schedule handoff for one governed proposal instead.");
  console.log("  Historical daemon log:");
  if (daemonHealth.lastCycle === null) {
    console.log("  NO CYCLE DATA — no daemon cycle has been recorded yet.");
  } else {
    const livenessLabel: Record<DaemonHealth["liveness"], string> = {
      "no-cycle-data": "NO CYCLE DATA",
      "in-progress": "IN PROGRESS",
      stale: "STALE",
      idle: "IDLE",
    };
    const latest = daemonHealth.lastCycle;
    const eventAt = latest.outcome === "running" ? latest.startedAt : latest.finishedAt ?? latest.startedAt;
    const stalenessNote = latest.outcome === "running" ? `; stale after ${formatDaemonAge(daemonHealth.staleAfterMs)}` : "";
    console.log(
      `  ${livenessLabel[daemonHealth.liveness]} — latest cycle ${latest.outcome} at ${eventAt} ` +
        `(${formatDaemonAge(daemonHealth.lastCycleAgeMs)} ago${stalenessNote}).`,
    );
    console.log("  Recent distinct cycles (newest first):");
    for (const cycle of daemonHealth.recentCycles) {
      const timestamp = cycle.outcome === "running" ? cycle.startedAt : cycle.finishedAt ?? cycle.startedAt;
      const detail = cycle.detail ? ` — ${cycle.detail}` : "";
      console.log(`    - ${cycle.outcome} at ${timestamp}${detail}`);
    }
  }

  console.log("\nRecently shipped:");
  if (recentShipped.length === 0) {
    console.log("  (nothing yet — no nightly run has completed)");
  } else {
    for (const entry of recentShipped) console.log(`  - ${entry}`);
  }

  console.log("\nRecent feature attempts:");
  if (recentAttempts.length === 0) {
    console.log("  (none recorded yet — see feature-log.jsonl once the loop has run)");
  } else {
    for (const entry of recentAttempts) {
      const suffix = entry.commitSha ? ` (${entry.commitSha})` : "";
      const autonomy = entry.selfAssessment || entry.filesChanged !== undefined ? computeAutonomyScore(entry) : null;
      const autonomySuffix = autonomy ? ` [autonomy ${autonomy.score}/10]` : "";
      console.log(`  - [${entry.status}] ${entry.title} — ICE ${entry.ice.composite.toFixed(1)}${suffix}${autonomySuffix}`);
    }
  }

  console.log("\nCalibration:");
  if (calibration.totalEntries === 0) {
    console.log("  (nothing logged yet — see feature-log.jsonl once the loop has run)");
  } else {
    const fmt = (n: number | null) => (n === null ? "n/a" : n.toFixed(1));
    console.log(
      `  Shipped ${calibration.outcomeCounts.shipped} (avg predicted confidence ${fmt(calibration.averageIceConfidence.shipped)}), ` +
        `abandoned ${calibration.outcomeCounts.abandoned} (${fmt(calibration.averageIceConfidence.abandoned)}), ` +
        `reverted ${calibration.outcomeCounts.reverted} (${fmt(calibration.averageIceConfidence.reverted)}).`,
    );
    if (calibration.hallucinationRate === null) {
      console.log("  Hallucination rate: n/a (no self-assessed \"confident\" shipped/reverted features yet)");
    } else {
      console.log(
        `  Hallucination rate: ${(calibration.hallucinationRate * 100).toFixed(0)}% ` +
          `(${calibration.confidentButRevertedCount} of ${calibration.confidentButRevertedCount + calibration.confidentAndShippedCount} ` +
          `self-reported-confident features were later reverted).`,
      );
    }
  }
}

/**
 * Requests or cancels a graceful stop of the nightly loop. A request is a
 * gitignored local flag file (see src/stop-flag.ts); `workflows/nightly.js`
 * checks for it between features (not mid-feature) so anything already in
 * progress still finishes, gets verified, and is logged normally before the
 * run wraps up early instead of picking up another candidate.
 */
export function runStop(repoRoot: string, options: { cancel?: boolean } = {}): void {
  const flagPath = join(repoRoot, STOP_FLAG_FILENAME);

  if (options.cancel) {
    if (existsSync(flagPath)) {
      unlinkSync(flagPath);
      console.log("Stop request cancelled — the nightly loop will run normally.");
    } else {
      console.log("No stop request was pending.");
    }
    return;
  }

  if (existsSync(flagPath)) {
    const existing = parseStopFlag(readFileSync(flagPath, "utf8"));
    console.log(`Stop already requested at ${existing?.requestedAt ?? "(unknown time)"} — still pending.`);
    return;
  }

  const requestedAt = new Date().toISOString();
  writeFileSync(flagPath, serializeStopFlag({ requestedAt }), "utf8");
  console.log(
    "Stop requested. The nightly loop will finish whatever feature it's currently on, skip " +
      "starting a new one, and still update the roadmap/changelog before exiting. Run " +
      "`feature-inventor stop --cancel` to undo this before it takes effect.",
  );
}

/**
 * Prints a "while you were sleeping" summary of feature-log.jsonl activity
 * since the last recap (or `--since`/`--all`), then records today as the
 * new watermark unless `--peek` was passed.
 */
export function runRecap(
  repoRoot: string,
  options: { since?: string; all?: boolean; peek?: boolean; json?: boolean } = {},
): void {
  const featureLogContent = readOptionalFile(repoRoot, "feature-log.jsonl");
  const entries = featureLogContent ? parseFeatureLogEntries(featureLogContent) : [];

  let sinceDate: string | null;
  if (options.all) {
    sinceDate = null;
  } else if (options.since) {
    sinceDate = options.since;
  } else {
    const stateContent = readOptionalFile(repoRoot, RECAP_STATE_FILENAME);
    const state = stateContent ? parseRecapState(stateContent) : null;
    sinceDate = state ? state.lastRecapAt : null;
  }

  const data = buildRecap(entries, sinceDate);
  const governedRuns = getGovernedRunSummaries(repoRoot).filter(
    (run) => sinceDate === null || (run.startedAt !== null && run.startedAt >= sinceDate),
  );
  if (options.json) {
    console.log(JSON.stringify({ ...data, governedRuns }, null, 2));
  } else {
    console.log(formatRecap(data));
    if (governedRuns.length > 0) {
      console.log("\nGoverned run journal:");
      for (const run of governedRuns) {
        console.log(`  ${run.runId}: ${run.status}, ${run.eventCount} event(s), latest ${run.latestEvent?.type ?? "(none)"}`);
      }
    }
  }

  if (!options.peek) {
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(repoRoot, RECAP_STATE_FILENAME), serializeRecapState({ lastRecapAt: today }), "utf8");
  }
}

// This is deliberately explicit about "do not ask for confirmation," not
// just "run unattended" — found the hard way: the /feature-inventor-start
// skill (which this would otherwise naturally reach for) has its own
// interactive "Ready to launch? 1. Yes / 2. Customize / 3. Cancel"
// confirmation step. --dangerously-skip-permissions bypasses Claude Code's
// permission prompts, but that confirmation isn't a permission prompt --
// it's the skill's own designed UX, and it deadlocks forever with nobody
// present to answer it (confirmed live: a real daemon-spawned run sat
// blocked on exactly this). Telling it to skip that skill and invoke the
// Workflow tool directly avoids the deadlock at the source.
function buildDaemonRunPrompt(maxFeatures: number): string {
  return (
    "Run the feature-inventor nightly workflow, right now, with no pauses: invoke the Workflow tool " +
    `directly against workflows/nightly.js with args ${JSON.stringify({ maxFeatures })}. The current working ` +
    "directory is already this repo's root. This is an unattended, non-interactive invocation -- " +
    "nobody is present to answer questions or confirm anything, ever. Do not use /feature-inventor-start " +
    "or any other skill/command that asks for confirmation before proceeding -- that will hang forever " +
    "with no one able to respond. Do not ask for confirmation yourself either. Just invoke the Workflow " +
    "tool immediately with the stated args."
  );
}

export const LEGACY_DAEMON_RETIRED_MESSAGE =
  "The legacy daemon is retired because it launches the archived nightly workflow outside the governed proposal contract. " +
  "Create a proposal, then run `feature-inventor claude run --run RUN_ID` or `feature-inventor manus run --run RUN_ID`.";

const DEFAULT_DAEMON_TIMEOUT_MS = 2 * 60 * 60 * 1000; // Kept only to interpret historical daemon log entries.
const DEFAULT_DAEMON_POLL_MS = 60 * 1000; // check for completion once a minute while a run is in flight
const DEFAULT_DAEMON_CHECK_MS = 5 * 60 * 1000; // how often to check whether a new run is due

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendDaemonLog(repoRoot: string, entry: DaemonLogEntry): void {
  const existing = readOptionalFile(repoRoot, DAEMON_LOG_FILENAME) ?? "";
  writeFileSync(join(repoRoot, DAEMON_LOG_FILENAME), appendDaemonLogEntries(existing, [entry]), "utf8");
}

export interface DaemonOptions {
  /** How often a new run should be attempted, e.g. from parseIntervalToMs("24h"). */
  intervalMs: number;
  /** Passes --dangerously-skip-permissions to the spawned headless run. Bypasses ALL permission checks. */
  yolo?: boolean;
  /**
   * Passed through as --max-budget-usd to the spawned claude invocation, a
   * hard per-run spending cap. Optional and off by default — continuous
   * churn has no cost ceiling unless you explicitly ask for one.
   */
  maxBudgetUsd?: number;
  /** Max time to wait for a spawned run to actually finish before giving up on that cycle. */
  timeoutMs?: number;
  /** How often to check .feature-inventor-last-run.json for completion while a run is in flight. */
  pollMs?: number;
  /** How often to check whether a new run is due, between cycles (only used when nothing was due). */
  checkMs?: number;
  /** Run at most one cycle and return. This is the default safe operating mode. */
  once?: boolean;
  /** Maximum features passed to the nightly workflow for each spawned cycle. */
  maxFeatures?: number;
}

/**
 * Best-effort short status line for the spawned session (name/status/state)
 * via `claude agents --json`. Never throws — a failed or unparseable call
 * just means no status line gets appended, not a broken poll loop.
 */
async function describeSpawnedSession(
  repoRoot: string,
  sessionId: string | null,
  startedAtMs: number,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("claude", ["agents", "--json", "--all"], { cwd: repoRoot });
    const sessions = JSON.parse(stdout) as ClaudeAgentSummary[];
    const match = sessionId
      ? sessions.find((s) => s.id === sessionId)
      : sessions.find(
          (s) => s.cwd?.toLowerCase() === repoRoot.toLowerCase() && (s.startedAt ?? 0) >= startedAtMs,
        );
    if (!match) return null;
    return `${match.name ?? "session"}: status=${match.status ?? "?"} state=${match.state ?? "?"}`;
  } catch {
    return null;
  }
}

/**
 * Fetches the spawned session's full transcript via `claude logs <id>` —
 * this is what actually shows the workflow's real decisions/phase
 * transitions as they happen (skill loads, "Shipped (verified): ...", etc.),
 * not just a status flag. Best-effort: returns null on any failure rather
 * than throwing, since this is diagnostic output layered on top of the
 * real completion signal (.feature-inventor-last-run.json), not a
 * replacement for it. maxBuffer is generous since a long run's transcript
 * can grow well past Node's 1MB execFile default.
 */
async function fetchSessionLogs(repoRoot: string, sessionId: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("claude", ["logs", sessionId], {
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Stops leftover background sessions from previous `feature-inventor daemon`
 * runs against this repo that are stuck/idle rather than actively working —
 * built directly from a real incident where a prompt bug left several
 * sessions permanently blocked on an unanswerable confirmation, burning
 * hours of continuous-churn retries before anyone noticed (see
 * `CHANGELOG.md` 2026-08-02). Filtering logic (what counts as "stale") is
 * `filterStaleNightlySessions` in `daemon.ts`, kept pure and tested there;
 * this function is just the I/O around it (list, filter, stop).
 */
export async function cleanStaleSessions(repoRoot: string): Promise<void> {
  let sessions: ClaudeAgentSummary[];
  try {
    const { stdout } = await execFileAsync("claude", ["agents", "--json", "--all"], { cwd: repoRoot });
    sessions = JSON.parse(stdout) as ClaudeAgentSummary[];
  } catch (err) {
    console.error(`Could not list sessions: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const stale = filterStaleNightlySessions(sessions, repoRoot);

  if (stale.length === 0) {
    console.log("No stale nightly-workflow sessions found for this repo — nothing to clean.");
    return;
  }

  console.log(`Found ${stale.length} stale nightly-workflow session(s) for this repo:`);
  for (const s of stale) {
    console.log(`  - ${s.id}: status=${s.status ?? "?"} state=${s.state ?? "?"} — ${s.name}`);
  }

  for (const s of stale) {
    if (!s.id) continue;
    try {
      await execFileAsync("claude", ["stop", s.id], { cwd: repoRoot });
      console.log(`  stopped ${s.id}`);
    } catch (err) {
      console.log(`  failed to stop ${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Runs one cycle if a new run is due: spawns a headless Claude Code
 * invocation (`claude --bg`) and waits for it to actually finish, logging
 * the outcome. Returns null if no run was due this cycle.
 *
 * The spawned process's own exit is deliberately NOT treated as proof the
 * nightly run completed — the Workflow tool returns immediately and
 * finishes its spawned agents later (confirmed by this project's own first
 * real run), and whether a headless `--bg` invocation's process lifetime
 * spans that later completion hasn't been verified. The authoritative
 * signal is `.feature-inventor-last-run.json`'s `completedAt` actually
 * advancing past this cycle's start time — the same file
 * `workflows/nightly.js`'s Finalize phase already writes on every real run.
 */
export async function runDaemonCycleIfDue(repoRoot: string, options: DaemonOptions): Promise<DaemonLogEntry | null> {
  const runSummaryContent = readOptionalFile(repoRoot, RUN_SUMMARY_FILENAME);
  const lastRun = runSummaryContent ? parseRunSummary(runSummaryContent) : null;

  if (!isRunDue(Date.now(), lastRun ? lastRun.completedAt : null, options.intervalMs)) {
    return null;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_DAEMON_TIMEOUT_MS;
  const startedAt = new Date().toISOString();
  // Persist the in-progress record before spawning. If the daemon process dies
  // during a cycle, `status` can surface this record as stale instead of
  // misleadingly reporting only an older completed run.
  appendDaemonLog(repoRoot, { startedAt, finishedAt: null, outcome: "running", staleAfterMs: timeoutMs });
  console.log(`[daemon] ${startedAt} — a run is due, starting one.`);

  const claudeArgs = ["--bg"];
  if (options.yolo) claudeArgs.push("--dangerously-skip-permissions");
  if (options.maxBudgetUsd !== undefined) {
    // --max-budget-usd is documented as "only works with --print" — added
    // here only when a cap was explicitly requested, since --bg alone
    // (the default, no cap) is the combination actually exercised against
    // the real `claude` binary so far. This --bg + --print pairing is not
    // separately verified; if a budget cap is set and runs don't behave as
    // expected, check this first.
    claudeArgs.push("--print", "--max-budget-usd", String(options.maxBudgetUsd));
  }
  claudeArgs.push(buildDaemonRunPrompt(options.maxFeatures ?? 1));

  const spawnResult = await new Promise<{ error: string | null; output: string }>((resolve) => {
    const child = spawn("claude", claudeArgs, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (err) => resolve({ error: err instanceof Error ? err.message : String(err), output }));
    child.on("exit", (code) => {
      console.log(`[daemon] claude --bg exited (code ${code}). Output: ${output.trim() || "(none)"}`);
      resolve({ error: null, output });
    });
  });

  if (spawnResult.error) {
    const entry: DaemonLogEntry = {
      startedAt,
      finishedAt: new Date().toISOString(),
      outcome: "spawn-error",
      detail: spawnResult.error,
      staleAfterMs: timeoutMs,
    };
    appendDaemonLog(repoRoot, entry);
    console.log(`[daemon] Failed to spawn claude: ${spawnResult.error}`);
    return entry;
  }

  const sessionId = extractSessionId(spawnResult.output);
  const pollMs = options.pollMs ?? DEFAULT_DAEMON_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  const startedAtMs = Date.parse(startedAt);
  // Tracks how much of the session's transcript has already been printed,
  // so each poll only prints the *new* portion -- an accumulating feed of
  // what the workflow is actually doing (phase transitions, "Shipped
  // (verified): ...", etc.), not a status line that overwrites itself and
  // leaves nothing to scroll back through.
  let previousLogs = "";

  while (Date.now() < deadline) {
    await sleep(pollMs);
    const content = readOptionalFile(repoRoot, RUN_SUMMARY_FILENAME);
    const summary = content ? parseRunSummary(content) : null;
    if (summary && Date.parse(summary.completedAt) >= startedAtMs) {
      const entry: DaemonLogEntry = {
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: "completed",
        staleAfterMs: timeoutMs,
      };
      appendDaemonLog(repoRoot, entry);
      console.log(
        `[daemon] Run completed: ${summary.shipped.length} shipped, ${summary.abandoned.length} abandoned, ` +
          `${summary.notAttempted.length} not attempted.`,
      );
      return entry;
    }

    // Live feed: stream only what's new since the last poll. Purely
    // informational -- never affects whether/when the loop considers the
    // run done (that's still only .feature-inventor-last-run.json, above).
    // Best-effort: a failed or unparseable `claude logs`/`claude agents`
    // call just means a quieter poll, not a broken loop.
    if (sessionId) {
      const logs = await fetchSessionLogs(repoRoot, sessionId);
      if (logs !== null) {
        const newContent = logs.startsWith(previousLogs) ? logs.slice(previousLogs.length) : logs;
        if (newContent.trim()) {
          console.log(`[daemon] ── live feed (${sessionId}) ──\n${newContent.trim()}`);
        }
        previousLogs = logs;
      }
    }

    const elapsedMin = Math.round((Date.now() - startedAtMs) / 60_000);
    const remainingMin = Math.max(0, Math.round((deadline - Date.now()) / 60_000));
    const sessionInfo = await describeSpawnedSession(repoRoot, sessionId, startedAtMs);
    console.log(
      `[daemon] still waiting (${elapsedMin}m elapsed, ~${remainingMin}m until timeout)` +
        (sessionInfo ? ` — ${sessionInfo}` : ""),
    );
  }

  const entry: DaemonLogEntry = {
    startedAt,
    finishedAt: new Date().toISOString(),
    outcome: "timed-out",
    detail: `no ${RUN_SUMMARY_FILENAME} update within ${timeoutMs}ms`,
    staleAfterMs: timeoutMs,
  };
  appendDaemonLog(repoRoot, entry);
  console.log(`[daemon] Timed out waiting for the run to complete after ${timeoutMs}ms — will try again next cycle.`);
  return entry;
}

/**
 * Long-running loop: checks whether a run is due, and when one is, spawns
 * and waits for it via runDaemonCycleIfDue, then immediately checks again —
 * with the default intervalMs of 0 (isRunDue treats 0 as "always due"),
 * this means continuous churn: as soon as one run finishes, the next one
 * starts, no gap. Passing --every opts into a slower, interval-based
 * cadence instead; `checkMs` only introduces an idle-poll delay when
 * *nothing* was due this check, so it never adds latency between two
 * back-to-back runs.
 *
 * This is feature-inventor's own scheduler — deliberately not the OS's
 * cron/Task Scheduler (simpler to set up, no OS-specific configuration) and
 * deliberately not Claude Code's CronCreate (session-only, no persistence
 * across a restart, and auto-expires after 7 days — see the conversation
 * this was designed from). The tradeoff: this process itself must keep
 * running for the schedule to fire at all; unlike an OS scheduler, a reboot
 * or a killed process silently ends things until it's started again. See
 * CONTRIBUTING.md for the planned follow-up (registering auto-start on boot).
 */
export async function runDaemon(repoRoot: string, options: DaemonOptions): Promise<void> {
  void repoRoot;
  void options;
  throw new Error(LEGACY_DAEMON_RETIRED_MESSAGE);
}

const USAGE =
  "Usage: feature-inventor [status [--json] | doctor [--json] | plan [--json] | propose [--json] | journal RUN_ID [--json] | watch RUN_ID [--json] | recover RUN_ID [--json] | capture RUN_ID [--json] | verify RUN_ID --check COMMAND --passed|--failed --evidence TEXT [--json] | review RUN_ID [--json] | finalize RUN_ID --confirm [--json] | manus run --run RUN_ID [--project ID] [--github-connector ID] [--profile PROFILE] [--allow-remote-push] | claude run --run RUN_ID [--json] | schedule handoff RUN_ID --runtime claude|manus [--json] | recap [--since DATE|--all] [--peek] [--json] | stop [--cancel] | " +
  "daemon [clean | --once | --every DURATION ...] | --help | --version]\n" +
  "  daemon execution is retired and fails closed because it used the archived nightly workflow. " +
  "Use `schedule handoff RUN_ID --runtime claude|manus` to write an exact proposal-pinned handoff instead.\n" +
  "  daemon clean still stops leftover stuck/idle background sessions from prior daemon runs against " +
  "this repo (never touches actively-busy sessions or unrelated background work).";

/**
 * Prints usage/description and exits 0. Shared by the `--help`/`-h` flags
 * (feature-inventor treats those as top-level commands, not options of
 * `status`) so `feature-inventor --help` behaves the way users expect from
 * virtually every other CLI instead of falling through to "Unknown command".
 */
export function printHelp(): void {
  console.log("feature-inventor — a self-hosted, self-growing nightly feature-building loop.\n");
  console.log(USAGE);
}

/**
 * Prints the version from package.json and exits 0. repoRoot defaults to the
 * package root (one directory up from this compiled file in dist/) so it
 * works regardless of the caller's current working directory.
 */
export function printVersion(packageRoot: string = join(dirname(fileURLToPath(import.meta.url)), "..")): void {
  const raw = readRequiredFile(packageRoot, "package.json");
  const parsed = JSON.parse(raw) as { version?: string };
  console.log(parsed.version ?? "unknown");
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function parsePositiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number`);
  return parsed;
}

/** Parses the explicit daemon modes without starting a process, keeping safety defaults testable. */
export function parseDaemonOptions(args: string[]): DaemonOptions {
  const once = args.includes("--once");
  const every = optionValue(args, "--every");
  const timeout = optionValue(args, "--timeout");
  const poll = optionValue(args, "--poll");
  const budget = optionValue(args, "--max-budget-usd");
  const maxFeatures = optionValue(args, "--max-features");

  if (once === Boolean(every)) {
    throw new Error("daemon requires exactly one execution mode: --once or --every DURATION");
  }
  if (every && !timeout) {
    throw new Error("repeated daemon execution requires --timeout DURATION");
  }
  if (every && !maxFeatures) {
    throw new Error("repeated daemon execution requires --max-features COUNT");
  }

  return {
    intervalMs: every ? parseIntervalToMs(every) : 0,
    timeoutMs: timeout ? parseIntervalToMs(timeout) : undefined,
    pollMs: poll ? parseIntervalToMs(poll) : undefined,
    maxBudgetUsd: budget ? parsePositiveNumber(budget, "--max-budget-usd") : undefined,
    maxFeatures: maxFeatures ? parsePositiveInteger(maxFeatures, "--max-features") : 1,
    yolo: args.includes("--yolo") || args.includes("--unattended"),
    once,
  };
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command ?? "status") {
    case "status":
      printStatus(process.cwd(), { json: rest.includes("--json") });
      break;
    case "doctor":
      await runDoctor(process.cwd(), { json: rest.includes("--json") });
      break;
    case "plan":
      printRunPlan(process.cwd(), { json: rest.includes("--json") });
      break;
    case "propose":
      await runPropose(process.cwd(), { json: rest.includes("--json") });
      break;
    case "journal":
      runJournal(process.cwd(), rest);
      break;
    case "watch":
      await runWatch(process.cwd(), rest, "watch");
      break;
    case "recover":
      await runWatch(process.cwd(), rest, "recover");
      break;
    case "capture":
      await runCapture(process.cwd(), rest);
      break;
    case "verify":
      runVerify(process.cwd(), rest);
      break;
    case "review":
      runReview(process.cwd(), rest);
      break;
    case "finalize":
      runFinalize(process.cwd(), rest);
      break;
    case "manus":
      await runManus(process.cwd(), rest);
      break;
    case "schedule":
      runSchedule(process.cwd(), rest);
      break;
    case "claude":
      await runClaude(process.cwd(), rest);
      break;
    case "recap": {
      const sinceIndex = rest.indexOf("--since");
      const since = sinceIndex !== -1 ? rest[sinceIndex + 1] : undefined;
      runRecap(process.cwd(), {
        since,
        all: rest.includes("--all"),
        peek: rest.includes("--peek"),
        json: rest.includes("--json"),
      });
      break;
    }
    case "stop":
      runStop(process.cwd(), { cancel: rest.includes("--cancel") });
      break;
    case "daemon": {
      if (rest[0] === "clean") {
        await cleanStaleSessions(process.cwd());
        break;
      }
      await runDaemon(process.cwd(), parseDaemonOptions(rest));
      break;
    }
    case "--help":
    case "-h":
      printHelp();
      break;
    case "--version":
    case "-v":
      printVersion();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(USAGE);
      process.exit(1);
  }
}

/**
 * Whether this module was invoked directly (as the CLI entry point) rather
 * than merely imported (e.g. by cli.test.ts). Comparing raw paths here is
 * not enough: `import.meta.url` always resolves through symlinks to this
 * file's real location, but `process.argv[1]` does not -- when invoked via
 * an `npm link`-installed global command (itself a symlink), argv[1] is the
 * symlink path, not the real one, so a strict `===` silently never matches
 * and `main()` never runs (confirmed: exit code 0, zero output, no error --
 * the exact bug this fixes). `realpathSync` resolves argv[1]'s symlinks
 * first so the comparison works regardless of how the command was reached.
 */
function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

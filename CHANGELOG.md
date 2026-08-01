# Changelog

Append-only log of what actually shipped — whether built by the automated
nightly loop running unattended, or hand-built in a human-directed session.
Every entry is traceable to a git commit and tagged so the two stay visibly
distinct:

- `(loop-shipped)` — built and independently verified by
  `workflows/nightly.js` on its own.
- `(hand-built)` — same bar for tests/docs, but a human was driving.

This is the one place a human reads each morning to answer "what happened
while I was asleep" — see also `feature-inventor recap`, which reads the
same underlying history (`feature-log.jsonl`) back as a short summary.

`workflows/nightly.js` executed for real for the first time on 2026-08-01
(see the three `(loop-shipped)` entries dated that day); everything before
that run is `(hand-built)`. Correction, also 2026-08-01: that run's own
Implement-phase agents initially tagged all three of their own entries
`(hand-built)` instead of `(loop-shipped)` — `workflows/nightly.js`'s prompt
never actually told them which tag applied to their own work, so they
defaulted to the wrong one. Fixed both the three entries and the prompt (see
`ROADMAP.md`/this file's `feature-inventor daemon` entry below). Entries
from before this file existed — the initial v0 scaffolding — aren't
backfilled here, to avoid inventing effort/value estimates that were never
actually recorded; see `ROADMAP.md`'s `[x]` items and `git log` for that
history instead.

Format per entry:

```
## YYYY-MM-DD — <feature title> (loop-shipped|hand-built)
- Effort/value estimate vs actual:
- Sanity checks: <pass/fail, what was checked>
- Commit: <sha>
- Notes from re-evaluation:
```

## 2026-08-01 — `feature-inventor recap --json` (loop-shipped)

- Effort/value estimate vs actual: ICE 4/8/9 (composite 7.0) — matched;
  `buildRecap()` already returned a plain, JSON-serializable `RecapData`
  object, so the change was a one-line branch in `runRecap` mirroring the
  already-shipped `status --json` pattern.
- Sanity checks: pass — `npm test` (87/87 tests, including 3 new
  `cli.test.ts` cases covering JSON output shape, absence of formatted text,
  and that the recap-state watermark is still written/skipped correctly with
  `--json`) and `npm run build` both green.
- Commit: this commit
- Notes from re-evaluation: `runRecap` previously always called
  `formatRecap(buildRecap(...))` and printed the formatted text. Added a
  `json` option threaded from a new `--json` CLI flag; when set, `runRecap`
  prints `JSON.stringify(buildRecap(...), null, 2)` instead of the formatted
  string. The `--peek`/watermark-write behavior is unchanged and applies the
  same regardless of output mode. Updated `USAGE` and README to document the
  new flag.

## 2026-08-01 — Preview upcoming Next-section titles in `status` when Now is empty (loop-shipped)

- Effort/value estimate vs actual: ICE 7/7/8 (composite 7.3) — matched; the
  needed section-parsing logic (`parseSection`, already used for
  `parseBacklogCounts`) was reused as-is via a new `parseNextSection` export,
  with only `printStatus`'s "Up next" block and `StatusData` changed.
- Sanity checks: pass — `npm test` (84/84 tests, including 3 new
  `roadmap.test.ts` cases for `parseNextSection` and 3 new `cli.test.ts` cases
  covering the Next preview, the both-empty fallback, and the
  Now-non-empty no-op) and `npm run build` both green.
- Commit: this commit
- Notes from re-evaluation: `printStatus`'s "Up next" block previously only
  read ROADMAP.md's Now section and printed a bare
  "(none — ROADMAP.md's Now section is empty)" placeholder whenever it was
  empty, even if the Next section still had plenty queued up. Added an
  exported `parseNextSection(roadmapMd)` to `roadmap.ts` (a thin wrapper
  around the existing `parseSection` helper, mirroring `parseNowSection`),
  and a `nextPreview` field on `StatusData` populated with up to the top 3
  open Next-section titles, but only when `nowItems` is empty. When
  `printStatus` renders and `nowItems` is empty, it now checks `nextPreview`:
  if it has entries, it prints an updated placeholder plus the preview
  titles; otherwise it falls back to the original plain placeholder (both
  sections genuinely empty). `--json` output carries `nextPreview` the same
  way as the other `StatusData` fields, so both output modes stay in sync.

## 2026-08-01 — `--help`/`-h` and `--version`/`-v` flags on the CLI (loop-shipped)

- Effort/value estimate vs actual: ICE 5/8/9 (composite 7.3) — matched; a
  handful of added `switch` cases plus two small exported helper functions
  (`printHelp`, `printVersion`), no architectural risk.
- Sanity checks: pass — `npm test` (78/78 tests, including 3 new cli.test.ts
  cases for `printHelp`/`printVersion`) and `npm run build` both green;
  manually ran `dist/cli.js --help`, `-h`, `--version`, and `-v` and confirmed
  exit code 0 with the expected usage/version output in each case, and
  confirmed `dist/cli.js bogus` still exits 1 with "Unknown command".
- Commit: this commit
- Notes from re-evaluation: `main()`'s switch previously had no cases for
  `--help`/`-h`/`--version`/`-v`, so they fell through to the `default` case's
  "Unknown command" error and exit 1. Added explicit cases: `--help`/`-h` call
  a new exported `printHelp()` (prints a one-line description plus the usage
  string) and exit 0 normally; `--version`/`-v` call a new exported
  `printVersion()`, which reads `version` from `package.json` (resolved
  relative to the compiled file's own directory via
  `import.meta.url`/`dirname`, so it works regardless of the caller's cwd)
  and prints it, also exiting 0 normally.

## 2026-08-01 — README.md quickstart (hand-built)

- Effort/value estimate vs actual: ICE 4/7/9 (composite 6.7) — matched; pure
  documentation, no code touched.
- Sanity checks: pass — `npm test` (22/22 tests) and `npm run build` both
  green (neither exercises README.md, so this confirms no regression from
  adding the file, not that the doc's contents are correct — verified the
  latter by re-reading it against `src/cli.ts`'s actual `status` output and
  `VISION.md`'s loop description).
- Commit: this commit
- Notes from re-evaluation: Added a root `README.md` covering what the
  project is, a quickstart for `feature-inventor status` (build once via
  `npm run build`, then `feature-inventor status` / `node dist/cli.js
  status` / `npm start -- status`), and a walkthrough of the nightly loop's
  five phases (Research, Prioritize, Implement, Verify, Finalize) with the
  harness-not-dark-factory boundary called out. No code changed; existing
  test/build coverage is unaffected by design.

## 2026-08-01 — Clean error + non-zero exit in cli.ts for missing/malformed ROADMAP.md or CHANGELOG.md (hand-built)
- Effort/value estimate vs actual: ICE 6/8/9 (composite 7.7) — matched; the fix was a small try/catch wrapper as expected.
- Sanity checks: pass — `npm test` (10/10 tests, including 3 new cli.test.ts cases) and `npm run build` both green; manually ran `dist/cli.js status` from a directory with no ROADMAP.md/CHANGELOG.md and confirmed a one-line `Error: could not read ROADMAP.md (...)` message with exit code 1, and confirmed normal `status` output still works from the repo root.
- Commit: this commit
- Notes from re-evaluation:

## 2026-08-01 — Structured feature-attempt log persisted to a file (hand-built)
- Effort/value estimate vs actual: ICE 7/7/7 (composite 7.0) — matched; plain JSON Lines I/O, no architectural risk, exactly as scoped.
- Sanity checks: pass — `npm test` (22/22 tests, including 10 new src/feature-log.test.ts cases and 2 new src/cli.test.ts cases) and `npm run build` both green; manually simulated the new `appendFeatureLogEntry` helper's dynamic-`import('node:fs/promises')` call outside vitest and confirmed it appends valid, parseable JSON Lines records.
- Commit: this commit
- Notes from re-evaluation: Added `src/feature-log.ts` (serialize/append/parse for a `feature-log.jsonl` record: date, title, ICE score, status shipped/abandoned/reverted, reason, commit sha, verification concerns) plus tests, wired `workflows/nightly.js`'s Implement-phase loop to append one entry per feature attempt (agent-error, pre-verification abandon, post-verification shipped, and post-revert cases all covered), and extended `feature-inventor status` to read the log back as a "Recent feature attempts" section so the history survives past a single run's in-memory `shipped`/`abandoned` arrays. `nightly.js` already relies on a non-standard execution model (top-level `return`/`await` predating this change, confirmed still present on a clean checkout), so the new persistence call uses a dynamic `import()` inside an `async function` rather than a static top-level `import`, matching the file's existing pattern rather than introducing new syntax risk.

## 2026-08-01 — `status --json` machine-readable output mode (hand-built)
- Effort/value estimate vs actual: ICE 5/6/8 (composite 6.3) — matched; the existing parse functions already returned plain data, so this was a pure refactor-and-branch with no new parsing logic.
- Sanity checks: pass — `npm test` (24/24 tests, including 2 new `cli.test.ts` cases covering `--json` output and its structure) and `npm run build` both green; manually ran `dist/cli.js status --json` and confirmed valid, `JSON.parse`-able output with `nowItems`/`recentShipped`/`recentAttempts` matching the plain-text `status` output's content, and confirmed `dist/cli.js status` (no flag) is unchanged.
- Commit: this commit
- Notes from re-evaluation: Extracted a new `getStatusData(repoRoot)` in `src/cli.ts` that reads ROADMAP.md/CHANGELOG.md/feature-log.jsonl and returns the same `{ nowItems, recentShipped, recentAttempts }` shape `printStatus` already rendered as text, so the JSON and text paths can't drift apart. `printStatus` now takes an `{ json?: boolean }` option; `main()` parses a `--json` flag off `process.argv` for the `status` subcommand. No change to the default (no-flag) text output. This is the swappable-runtime-adapter groundwork VISION.md calls for — a future hosted-service adapter or CI script can now consume `status` without scraping console lines.

## 2026-08-01 — Remove hardcoded repo path from workflows/nightly.js (hand-built)
- Effort/value estimate vs actual: not ICE-scored in advance — a direct correction requested after review, not picked off the backlog. In hindsight, roughly 8/9/8 (composite ~8.3): high value (the script was unusable on any machine but one), high confidence, genuinely easy fix.
- Sanity checks: pass — `npm test` (47/47, unaffected — `workflows/nightly.js` has no automated test harness, see `CONTRIBUTING.md`) and `npm run build` both green (this file isn't part of the TypeScript build; checked manually for syntax/logic correctness by inspection since it only runs inside the Workflow tool's runtime, not plain Node).
- Commit: this commit
- Notes from re-evaluation: `REPO_ROOT` was a literal absolute Windows path (`I:/Tal/Code/other/feature-inventor`) — correct on exactly one machine, and a direct violation of `VISION.md`'s own "no hardcoded personal assumptions" bar for a production-grade product. Replaced with `resolveRepoRoot()`, which takes an explicit `args.repoRoot` override if given, otherwise resolves it via an `agent()` call running `git rev-parse --show-toplevel` and cross-checking `package.json`'s `name` field — so an accidental wrong-directory invocation fails loudly with a clear reason instead of silently running git operations against the wrong repository. `BRANCH_NAME` was also switched from a bare literal to `(args && args.branchName) || 'nightly'`, matching the existing `maxFeatures` pattern, so the whole workflow's identity (repo, branch, batch size) is now configurable via `args` rather than baked into the file.

## 2026-08-01 — Graceful stop, recap, and slash commands; nightly.js filesystem-access fix (hand-built)
- Effort/value estimate vs actual: not ICE-scored in advance — built directly from a conversation about product UX rather than picked off the ranked backlog. In hindsight, roughly a 6/7/7 (composite ~6.7): real next-morning value, fairly confident it would work cleanly, moderate effort (five new/changed source files, three doc files, three slash commands).
- Sanity checks: pass — `npm test` (47/47 tests, including 12 new cases across `stop-flag.test.ts`, `recap.test.ts`, and `cli.test.ts`) and `npm run build` both green; manually ran `stop`, `stop` again (already-pending path), `stop --cancel`, and `status` before/after against this actual repo and confirmed the printed behavior at each step, then removed the leftover local state file before committing.
- Commit: `c27022a`
- Notes from re-evaluation: Added `feature-inventor stop [--cancel]` (a gitignored stop-flag file, checked between features rather than mid-feature in `workflows/nightly.js`'s Implement loop, so anything already in progress still finishes/verifies/logs normally) and `feature-inventor recap [--since DATE|--all] [--peek]` (a "while you were sleeping" summary of `feature-log.jsonl`, tracking a local watermark so each recap only shows what's new). `status` now surfaces a pending stop request in both text and `--json`. Added three Claude Code slash commands (`/feature-inventor-status`, `-recap`, `-stop`) wrapping the CLI. While wiring the stop-flag check, found that `appendFeatureLogEntry` called `node:fs/promises` directly from the Workflow script body — but Workflow scripts have no filesystem access, only the agents they spawn do — so it would have silently never worked; never caught before because `workflows/nightly.js` has still never actually executed through real automation (confirmed via empty `TaskList`/`CronList` and no `feature-log.jsonl` on disk despite CHANGELOG/ROADMAP prose describing a completed run). Fixed by delegating the write to a small dedicated agent call, the same pattern the new stop-flag check/clear use. Also corrected that stale "this run" narration in `ROADMAP.md`'s `CronCreate` item so it doesn't cause the real first dry run to get skipped.

## 2026-08-01 — Fix candidates-not-attempted under-reporting and the Next/Next-Steps heading collision (hand-built)
- Effort/value estimate vs actual: both S/S as re-estimated in `ROADMAP.md` — matched; both were small, well-isolated fixes.
- Sanity checks: pass — `npm test` (52/52 tests, including a new colliding-heading fixture in `roadmap.test.ts` and a new backlog-counts test in `cli.test.ts`) and `npm run build` both green; manually ran `node dist/cli.js status` against this repo's real `ROADMAP.md` and confirmed "Backlog: 5 in Next, 5 in Later, 3 in Horizon." matches a manual count of open items in each section.
- Commit: this commit
- Notes from re-evaluation: Two fixes. (1) `workflows/nightly.js`'s Finalize step computed "candidates not attempted" as `orderedFeatures.slice(queue.length)`, which only ever covered candidates beyond `MAX_ATTEMPTS` — it silently missed queued candidates dropped by an early `MAX_FEATURES_PER_RUN` cutoff or a `feature-inventor stop` request. Now the Implement loop tracks `attemptedCount` and a `stopReason` (`'max-features-reached' | 'explicit-stop' | null`), and Finalize computes `notAttempted` from `queue.slice(attemptedCount)` plus the `MAX_ATTEMPTS` tail, so already-ICE-scored candidates survive into the reevaluation prompt regardless of why the run stopped short. (2) `src/roadmap.ts`'s heading match used a bare `\b` word boundary, which let `## Next\b` false-match the start of an unrelated `## Next Steps` heading (a space is also a word boundary) — the exact bug a prior reverted attempt (`98fd48d`/`aa35e1d`) shipped with a test that didn't actually cover the collision. Replaced with a generic `parseSection(markdown, name)` requiring the heading line to either end immediately or continue into a parenthetical suffix (`## Now (this run's candidates...)`), added `parseBacklogCounts()`, and added a fixture with a real `## Next Steps` heading next to `## Next` asserting the right one is picked. `status`/`--json` now show a "Backlog: N in Next, N in Later, N in Horizon" line/`backlogCounts` field.

## 2026-08-01 — Retrospective self-assessment fields and a calibration log (hand-built)
- Effort/value estimate vs actual: L/M as scoped in `ROADMAP.md` — roughly matched; the schema/prompt changes were straightforward, the calibration math was the fiddlier part (getting the hallucination-rate denominator right: confident-and-shipped plus confident-but-reverted, not every entry).
- Sanity checks: pass — `npm test` (57/57 tests, including 3 new `feature-log.test.ts` cases for the `selfAssessment` block and 4 new `src/calibration.test.ts` cases) and `npm run build` both green; manually ran `node dist/cli.js status` against this repo (no `feature-log.jsonl` exists yet, since no automated run has happened) and confirmed it prints "(nothing logged yet — see feature-log.jsonl once the loop has run)" rather than crashing or showing misleading zeros.
- Commit: this commit
- Notes from re-evaluation: `src/feature-log.ts`'s `FeatureLogEntry` gained an optional `selfAssessment` block (`creativity: routine|creative|novel`, `difficulty: easy|medium|hard` — independent of the pre-scored ICE Ease, `confident: boolean`, `wantedHumanGuidance: boolean`, `knowledgeGaps?: string`, `modelFit: overkill|right-sized|underpowered`), validated field-by-field so a malformed block drops the whole entry rather than silently accepting garbage. `workflows/nightly.js`'s `IMPLEMENT_SCHEMA` now requires this on every attempt (shipped or abandoned), with prompt wording explicitly telling the agent it isn't graded on sounding confident, since `RESEARCH.md` §4 found self-reported confidence drifts upward without cause; the `selfAssessment` is kept even on a post-verification revert specifically, since a "confident: true" claim that got reverted anyway is the exact signal the new hallucination-rate metric needs. Added `src/calibration.ts`'s `computeCalibrationStats()` (pure function over the full `feature-log.jsonl` history — per-outcome counts and average predicted ICE Confidence, plus a hallucination rate: confident-but-reverted / (confident-but-reverted + confident-and-shipped), `null` until there's at least one such entry rather than a misleading `0%`), surfaced as a new "Calibration" section in `status`/`--json`. `nightly.js`'s Finalize reflection step now also reads this history (via `feature-log.jsonl` or `status --json`) to check whether tonight's outcome continues or breaks an existing calibration pattern, not just tonight's in isolation.

## 2026-08-01 — Nightly summary push notification and live per-feature progress (hand-built)
- Effort/value estimate vs actual: M/M and S/M as scoped in `ROADMAP.md` — roughly matched; both are thin delegation wrappers around existing tools (`PushNotification`, `TaskCreate`/`TaskUpdate`), no new architecture.
- Sanity checks: pass — `npm test` (57/57, unaffected — this is entirely `workflows/nightly.js` changes, which has no automated test harness per `CONTRIBUTING.md`) and `npm run build` both green; syntax-checked `nightly.js` by wrapping its body in a temporary `async function` and running `node --check` against that (the file's own top-level `await`/`return` makes `node --check` fail directly on an unmodified file too, so this wrapper is the only way to catch a real syntax error without executing it through the actual Workflow tool).
- Commit: this commit
- Notes from re-evaluation: Neither the script body of a `Workflow`-tool script nor a plain Node process can call `PushNotification` or `TaskCreate`/`TaskUpdate` directly — only a spawned `agent()` can, the same constraint `appendFeatureLogEntry` and the stop-flag checks already work around. Added `sendRunCompletionNotification()`, called once Finalize completes (not on the early-return paths when Research/Prioritize found nothing, since there's nothing worth a notification for in that case) with a short deterministic summary line (shipped/abandoned/not-attempted counts, stop reason if any). Added `createFeatureTasks()` (one `TaskCreate` per queued candidate, up front, all starting `pending`) and `updateFeatureTask()` (called at `in_progress` when a feature's attempt starts, and `completed` with an `outcome` metadata tag — `shipped`/`abandoned`/`reverted`/`agent-error` — once it concludes), so `TaskList`/`TaskGet` show real-time per-feature status during a run instead of just the current phase name. Both degrade gracefully: a missing `taskId` (e.g. `createFeatureTasks` itself failed) makes `updateFeatureTask` a silent no-op rather than blocking the run.

## 2026-08-01 — Resume-point summary ("where did we stop"), plus a gitignore bug fix (hand-built)
- Effort/value estimate vs actual: M/M as scoped in `ROADMAP.md` — matched; mirrored the existing stop-flag.ts/recap.ts pattern closely enough that there wasn't much surprise.
- Sanity checks: pass — `npm test` (66/66, including 7 new `src/run-summary.test.ts` cases and 2 new `cli.test.ts` cases) and `npm run build` both green; manually wrote a throwaway `.feature-inventor-last-run.json` into this repo, ran `node dist/cli.js status`, confirmed the "Last run finished ..." line and the not-attempted list rendered correctly, then deleted the file and confirmed `git status` showed no trace (it's gitignored).
- Commit: this commit
- Notes from re-evaluation: Added `src/run-summary.ts` (`RunSummary`: `completedAt`, `shipped`/`abandoned`/`notAttempted` title lists, `stopReason: 'max-features-reached'|'explicit-stop'|null`) as a gitignored single-record file — always overwritten with just the most recent run, unlike `feature-log.jsonl`'s append-only history. `workflows/nightly.js` writes it at Finalize via a delegated agent (same pattern as `appendFeatureLogEntry`), and `status`/`--json` now show a "Last run" section: confirmation nothing was left mid-feature, shipped/abandoned/not-attempted counts, and the not-attempted titles explicitly called out as "already researched and ICE-scored, carried into ROADMAP.md" so a human never has to wonder whether that work was silently dropped. While building this, found that `.gitignore` never actually listed `feature-log.jsonl`, despite `appendFeatureLogEntry`'s own prompt text claiming "this file is gitignored — do not commit it" — a real bug (any run that did a broad `git add`/`git commit` could have swept it into a feature commit). Fixed `.gitignore` to include both `feature-log.jsonl` and the new `.feature-inventor-last-run.json`.

## 2026-08-01 — Audit of regex-based parsing in roadmap.ts (hand-built)
- Effort/value estimate vs actual: M/S as scoped in `ROADMAP.md` — smaller than expected; `parseSection`'s heading-boundary bug was already fixed in an earlier entry today, so this audit pass mainly needed to check the rest of the file rather than fix that bug again.
- Sanity checks: pass — `npm test` (67/67, including 1 new `roadmap.test.ts` case) and `npm run build` both green; manually re-ran `node dist/cli.js status` against this repo's real `CHANGELOG.md` (which has several genuine `## YYYY-MM-DD` entries) and confirmed "Recently shipped" is unaffected by the stricter regex.
- Commit: this commit
- Notes from re-evaluation: Audited `src/roadmap.ts` beyond the already-fixed `parseSection` heading match. Found the same class of over-eager boundary match in `parseChangelogEntries`: it matched *any* `^## .+$` line as a changelog entry, so a future non-entry heading like `## Notes` or `## Deprecated` added outside a fenced code block would have been silently treated as a "shipped" entry in `status`'s "Recently shipped" list — not a name collision like the Next/Next-Steps bug, but the same underlying mistake of matching more than the documented format actually allows. Tightened the regex to require the `## YYYY-MM-DD` date prefix `CHANGELOG.md`'s own format documents, added a fixture with a stray non-entry heading asserting it's excluded. `stripFencedCodeBlocks` and the bullet-line regex were also reviewed and found sound for this project's actual markdown conventions (balanced triple-backtick fences, no nested/tilde fences in use) — no further changes made there.

## 2026-08-01 — Output-mode switch scaffold (hand-built)
- Effort/value estimate vs actual: M/L as scoped in `ROADMAP.md` — much smaller in practice, since only the default mode is actually implemented; the "L" value estimate in the original item assumed all three modes would be built, which this deliberately doesn't do (see notes below).
- Sanity checks: pass — `npm test` (67/67, unaffected — this is entirely a `workflows/nightly.js` change) and `npm run build` both green; syntax-checked `nightly.js` with the same temporary-wrapper `node --check` trick used for its other recent changes.
- Commit: this commit
- Notes from re-evaluation: Added `args.outputMode` (default `"auto-commit"`, the only behavior this loop has ever had — commit straight to `BRANCH_NAME`, never push). Any other value throws a clear error explaining why, rather than silently falling back to auto-commit or half-implementing something risky: `"pr-per-feature"` specifically would require pushing a branch and calling `gh pr create`, which conflicts directly with `VISION.md`'s "never push to a remote" harness-not-dark-factory boundary — that's a real decision for a human to make explicitly (a scoped exception, a different remote/fork, something else), not something to resolve unilaterally inside a workflow script. `"batched-summary"` is just not built yet. Documented the accepted `args.outputMode` value in `CONTRIBUTING.md` alongside the existing `repoRoot`/`branchName`/`maxFeatures` args.

## 2026-08-01 — Per-feature harness-vs-dark-factory autonomy score (deterministic scaffold) (hand-built)
- Effort/value estimate vs actual: L/M as scoped in `ROADMAP.md`, but deliberately scoped down — the original item asked for something "trained on feature-log/CHANGELOG history," which isn't honestly possible yet (there still isn't enough logged history); built the deterministic formula and signal-collection scaffold the item itself named as the prerequisite instead.
- Sanity checks: pass — `npm test` (75/75, including 6 new `src/autonomy.test.ts` cases and 2 new `feature-log.test.ts` cases for `filesChanged`) and `npm run build` both green; manually wrote a throwaway `feature-log.jsonl` entry with a `filesChanged` count and a `selfAssessment` block, ran `node dist/cli.js status`, and confirmed the "[autonomy N/10]" suffix matched a hand-computed score (3 for knowledgeGaps + 2 for hard + 2 for not confident + 1 for wantedHumanGuidance + 1 for 6 files touched = 9), then deleted the file and confirmed no trace in `git status`.
- Commit: this commit
- Notes from re-evaluation: Added `src/autonomy.ts`'s `computeAutonomyScore(entry)` — a pure, deterministic 0-10 formula over signals already being collected (`selfAssessment.knowledgeGaps` non-empty, `difficulty: "hard"`, `confident: false`, `wantedHumanGuidance: true`) plus a new factual `filesChanged` count (added to `VERIFY_SCHEMA`, sourced from independent verification's own `git show --stat` rather than the implementer's self-report, since verification is the less-motivated-to-inflate party). Deliberately a formula computed from a log entry, not a value stored in one — so improving the formula later re-scores old entries instead of leaving them stuck with a stale number, and deliberately not a trained model, since `ROADMAP.md`'s own item text says there isn't enough history yet to train one honestly. Surfaced as a `[autonomy N/10]` suffix on each line of `status`'s "Recent feature attempts". Training an actual model against real outcomes stays a Later-list item once there's enough logged history to do that honestly.

## 2026-08-01 — Feature-collision-rate scoring for Prioritize-phase ordering (hand-built)
- Effort/value estimate vs actual: L/L as scoped in `ROADMAP.md` (explicitly "high uncertainty") — the scoring/ordering half landed cleanly; the item's actual-parallelization half was deliberately not attempted, matching the item's own stated gate.
- Sanity checks: pass — `npm test` (75/75, unaffected — this is entirely a `workflows/nightly.js` change) and `npm run build` both green; syntax-checked with the same temporary-wrapper `node --check` trick. Additionally, since `orderByIceTierThenMinimalCollision`/`collisionRateBetween` are pure deterministic functions, copied them into a throwaway script and ran three hand-constructed scenarios (no collision data preserves ICE-only order; a same-tier pair with a reported high collision rate doesn't get placed adjacent when a lower-collision alternative exists; a three-way same-tier case picks the lowest-collision neighbor at each greedy step) — all three matched the expected ordering before this was inlined into `nightly.js`, which has no automated test harness of its own.
- Commit: this commit
- Notes from re-evaluation: Added a `COLLISION_SCHEMA` and a Prioritize-phase agent call (only when more than one feature was kept) that estimates a 0-100 pairwise "feature collision rate" for every distinct pair of kept candidates — predicted file/logic overlap, not anything actually executed. `orderByIceTierThenMinimalCollision()` then replaces the old plain ICE sort: features are grouped into tiers by ICE composite score rounded to the nearest 0.5 (so a lower-ICE feature never jumps ahead of a meaningfully higher-ICE one, preserving `VISION.md` operating principle #1), and within a tier the queue is built greedily by picking whichever remaining feature has the lowest predicted collision with whatever was placed immediately before it. This is deliberately the *scoring and ordering* half of the ROADMAP.md item only — the Implement loop stays strictly sequential; actually running low-collision features in parallel (via the `Workflow` tool's `isolation: 'worktree'` option, already noted as the ready-made mechanism for it) is left for later, since the item's own text says the parallelize-vs-sequential thresholds need real calibration data that doesn't exist yet. An unreported or missing pair is treated as zero collision rather than blocking ordering on incomplete data.

## 2026-08-01 — `feature-inventor daemon`; fixed a real CHANGELOG mistagging bug (hand-built)
- Effort/value estimate vs actual: not ICE-scored in advance — designed directly from a conversation about long-term unattended operation, not picked off the ranked backlog. In hindsight, roughly 7/6/6 (composite ~6.3): real value for anyone wanting extended unattended runs, moderate confidence (the spawn/poll orchestration couldn't be safely tested against the real `claude` binary — see below), moderate effort.
- Sanity checks: pass — `npm test` (100/100, including 13 new `src/daemon.test.ts` cases for the pure interval/due/log logic) and `npm run build` both green. The "not due" path was verified for real against this actual repo (`node dist/cli.js daemon --once` correctly did nothing, since the last real run was ~40 minutes prior and the default interval is 24h). The spawn/poll path was verified against a scratch repo with an intended fake `claude` stand-in on `PATH` — but the override didn't take effect (Windows resolves `claude` through a mechanism `child_process.spawn` doesn't respect `PATH` overrides for), so it accidentally dispatched two real background Claude Code sessions against the scratch directory instead. Both were caught via `claude agents --json`, manually stopped with `claude stop <id>`, and are documented in `CONTRIBUTING.md` as a warning for next time. The accidental runs did, incidentally, validate the timeout/logging path for real: each one spawned correctly, was correctly not mistaken for a completed run, and correctly timed out and logged after 30s with an accurate detail message.
- Commit: this commit
- Notes from re-evaluation: Added `src/daemon.ts` (pure: `parseIntervalToMs`, `isRunDue`, daemon-log serialize/append/parse) and `cli.ts`'s `runDaemonCycleIfDue`/`runDaemon` (spawns `claude --bg [--dangerously-skip-permissions] "<prompt>"`, then polls `.feature-inventor-last-run.json` — not the spawned process's own exit — for proof a run actually finished, since the `Workflow` tool returns before its spawned agents do and whether a headless `--bg` invocation's lifetime spans that isn't verified). New `feature-inventor daemon [--every DURATION] [--yolo|--unattended] [--once] [--poll DURATION] [--timeout DURATION]` command. This is feature-inventor's own scheduler, deliberately not `CronCreate` (session-only, gone if the session ends, auto-expires after 7 days — not a fit for "runs for months") and deliberately not the OS's own scheduler (no OS-specific setup needed, at the cost of not surviving a reboot yet — see `ROADMAP.md`). Separately, while writing this entry, found that the three `(loop-shipped)` entries above (from today's actual first real automated run) had been mistagged `(hand-built)` by that run's own Implement-phase agents — `workflows/nightly.js`'s prompt told them to append a CHANGELOG entry "following its documented format" but never actually told them which tag applied to their own output, so they defaulted to the far more common existing tag in the file's history. Fixed the three entries, the intro paragraph's stale "not yet executed" claim, and the prompt itself (now explicitly: tag your own entries "(loop-shipped)", don't default to "(hand-built)"). Also: this entry's own `node --check` verification during earlier `nightly.js` changes tonight used a wrapper that put the file's `export const meta = {...}` inside a function body — which is unconditionally invalid JS grammar, so those checks were silently not validating anything. The real Workflow-tool execution tonight is much stronger evidence those versions were valid than a broken local check ever was; the wrapper is fixed now (keep `export` at real top level via a `.mjs` extension, wrap only the rest) and used correctly for this change.

## 2026-08-01 — Daemon default flipped to continuous churn; optional --max-budget-usd (hand-built)
- Effort/value estimate vs actual: not ICE-scored — direct correction requested right after the previous entry shipped, based on clarifying what "runs for hours a day or basically forever" actually meant. Small change (default value + one new pass-through flag), high confidence.
- Sanity checks: pass — `npm test` (101/101, including 1 new `daemon.test.ts` case asserting `isRunDue(now, recentTimestamp, 0)` and `isRunDue(now, sameInstant, 0)` are both `true`) and `npm run build` both green. Deliberately did NOT run `feature-inventor daemon --once` bare against this real repo to "smoke test" the new default, since with intervalMs now 0 (always due) that would have spawned a real background `claude` session for real — same category of accidental side effect as the previous entry's testing mishap, avoided this time by reasoning from the already-passing unit test instead of re-triggering a live spawn.
- Commit: this commit
- Notes from re-evaluation: `runDaemon`'s default `intervalMs` changed from `24h` to `0` — `isRunDue` already treated `0` as "always due" (no new branch needed), so the behavior change was purely in `main()`'s argument defaulting (`--every` now opts into a slower cadence instead of overriding a default one) and in `runDaemon`'s loop, which now only applies the idle-poll `checkMs` sleep when a cycle found nothing due, so continuous churn has no artificial gap between one run finishing and the next starting. Added optional `--max-budget-usd AMOUNT` (off by default), passed through to the spawned `claude` invocation as `--print --max-budget-usd <amount>` — only added to the spawn args when explicitly set, since `--max-budget-usd` is documented as requiring `--print`, and the default (no cap) invocation stays exactly `claude --bg "<prompt>"`, the combination already exercised against the real binary. Documented plainly in `README.md`/`CONTRIBUTING.md` that continuous churn is a real, ongoing cost commitment (a single run is ~20+ minutes, ~900K tokens) and that it will land commits on `nightly` far faster than per-commit review is realistic — that's an intentional tradeoff of the harness-not-dark-factory model shifting toward batched review, not a gap that needed closing.

## 2026-08-01 — Fix a real `npm link` bug: the global command silently did nothing (hand-built)
- Effort/value estimate vs actual: not ICE-scored — direct bug report from the user actually running `npm link` for the first time (per the previous entries' own `README.md` instructions), not picked off the backlog. Small, high-confidence fix once the root cause was found.
- Sanity checks: pass — `npm test` (101/101, unaffected — the entrypoint guard is inert during tests either way) and `npm run build` both green. Reproduced the bug directly (`feature-inventor status` after `npm link`: exit code 0, zero output, no error) and root-caused it precisely: `realpathSync` on the symlinked `node_modules/feature-inventor` showed `import.meta.url` resolves through the symlink to this repo's real `dist/cli.js` path, while `process.argv[1]` (as passed by npm's generated shim script) stays as the unresolved symlink path — the old `fileURLToPath(import.meta.url) === process.argv[1]` check therefore never matched, so `main()` silently never ran. Confirmed the fix by rebuilding and re-running the actual globally-linked `feature-inventor status`/`--version`/`--help` for real: all now produce correct output.
- Commit: this commit
- Notes from re-evaluation: This bug existed in `cli.ts`'s entry-point guard since before tonight — nobody had actually run `npm link` and invoked the bare command until the user did, right after the README instructions added this session recommended exactly that. Replaced the raw path comparison with a new `isMainModule()` that resolves `process.argv[1]` through `realpathSync` before comparing, so the check is symlink-agnostic regardless of whether the command was invoked directly, via `npm link`, or via `npm install -g .`. A useful reminder that "the tests pass" doesn't cover every real invocation path — this specific path (global symlink install) had zero coverage until a human actually tried it.

## 2026-08-01 — Correct the auth documentation: setup-token isn't actually required (hand-built)
- Effort/value estimate vs actual: not ICE-scored — a documentation correction prompted directly by the user testing `claude -p "say hi"` without ever using the token from `claude setup-token`, and it working anyway. Docs-only, no code changed.
- Sanity checks: pass — `npm test` (101/101, unaffected) and `npm run build` both green (neither exercises README.md/CONTRIBUTING.md content).
- Commit: this commit
- Notes from re-evaluation: The "Running unattended" section previously presented `claude setup-token` as a one-time required setup step, based on its own `claude --help` description ("long-lived authentication token") without actually testing whether it was necessary. It isn't, on a machine that's already done an interactive login (`claude auth status` shows `loggedIn: true`) — that credential already carries through to headless `claude -p`/`--bg` invocations, confirmed by the user's own test. Corrected both `README.md` and `CONTRIBUTING.md`: `setup-token` is now documented as only mattering for a machine that's never done an interactive login at all (CI runner, fresh headless server), with a kept caveat that an interactive session's credential may not be as long-lived as a dedicated token, worth checking first if the daemon ever silently stops authenticating after running for days/weeks. Another instance (like the `npm link` entrypoint bug above) of documentation stating something with more confidence than had actually been verified — worth continuing to test claims like this against real behavior rather than trusting a tool's one-line `--help` description alone.

## 2026-08-02 — Live feed for `feature-inventor daemon`'s poll loop (hand-built)
- Effort/value estimate vs actual: not ICE-scored — direct UX request after the user found a real ~20-minute poll cycle looked completely frozen (only a start/end log line, nothing in between). Small addition, moderate confidence (the new `claude logs`/`claude agents` calls are best-effort diagnostics layered on the already-working completion signal, not load-bearing).
- Sanity checks: pass — `npm test` (105/105, including 4 new `extractSessionId` cases) and `npm run build` both green. Verified the core assumption (a session's `claude logs` output only grows, never rewrites, making simple suffix-diffing safe) against the actual real background session from tonight's second run by fetching its logs twice a few minutes apart and confirming the second fetch was a strict superset of the first. `describeSpawnedSession`/`fetchSessionLogs` themselves aren't unit tested (real `child_process`/`claude` calls, same category as the rest of the daemon's spawn/poll orchestration) — while implementing this, an actual live daemon run (started by the user, not a test) hit a real complication that ended up validating parts of the design; see the note on that below and the two following entries.
- Commit: this commit
- Notes from re-evaluation: Added `extractSessionId()` (pure, tested) to `src/daemon.ts`, parsing the session id out of `claude --bg`'s own stdout ("backgrounded · <id>"). Added two best-effort helpers to `cli.ts`: `describeSpawnedSession()` (a short `name: status=... state=...` line via `claude agents --json --all`) and `fetchSessionLogs()` (the session's full transcript via `claude logs <id>`). The poll loop now tracks `previousLogs` and each tick prints only the *new* suffix of the transcript since the last poll — an accumulating feed in the terminal's natural scrollback, not a status line that overwrites itself — followed by a short elapsed/remaining-time line. None of this affects *whether* or *when* a cycle is considered done — `.feature-inventor-last-run.json`'s `completedAt` remains the sole authoritative signal; a failed or unparseable `claude logs`/`claude agents` call just means a quieter poll tick, not a broken loop.

## 2026-08-02 — Found and fixed a real bug: shared working directory races between the daemon and an interactive session (hand-built)
- Effort/value estimate vs actual: not ICE-scored — discovered by accident while actively editing `src/cli.ts` in this session at the exact moment the user's real, separately-running `feature-inventor daemon --yolo` process's spawned background run reached its own `git checkout nightly` step, in the *same* working directory. Not a hypothetical: it happened, live, mid-session.
- Sanity checks: n/a — this entry documents a design gap and how it resolved, not a code change with its own tests. Recovery was verified directly: `git stash list` showed the interrupted work safely preserved (the background agent's own choice, not something this project's code did), `git stash pop` after the background run went idle restored it byte-for-byte (confirmed via `npm test`/`npm run build` passing identically before and after), and `master`'s commit history was untouched throughout.
- Commit: this commit
- Notes from re-evaluation: `workflows/nightly.js`'s Implement phase does `git checkout "${BRANCH_NAME}"` in whatever directory it's invoked from — which, when `feature-inventor daemon` spawns `claude --bg` from inside this repo, is this exact repo's working directory, identical to the one any interactive Claude Code session (like this one) is also using. Mid-session, with real uncommitted changes on `master` (the live-feed work above), the background run's Implement-phase agent reached its own `git checkout nightly` step, found the uncommitted changes, and — good behavior, not something this codebase engineered — ran `git stash` with a descriptive message before proceeding, rather than a destructive `git checkout -f`/`git reset --hard`. Confirmed via `git reflog` (`checkout: moving from master to nightly`) and `git stash list`. This is not a designed safeguard; a differently-prompted or differently-behaving agent could have discarded the work outright. **Documented, not yet fixed at the architecture level**: running `feature-inventor daemon` against a repo you're also actively editing interactively is unsafe by construction — no isolation exists between the two. The honest fix is a separate clone/worktree for the daemon's own operations, not relying on a spawned agent's judgment call every time. Added a explicit warning to `CONTRIBUTING.md`'s daemon section; a real `isolation: 'worktree'`-based fix is a candidate for `ROADMAP.md`, not built here.

## 2026-08-02 — Real evidence of a mid-run capacity failure (session usage limit), not hand-built (observation)
- What happened, not a code change: the user's real `feature-inventor daemon --yolo` process (started 2026-08-01) triggered a second real automated run. Its `claude logs <id>` transcript shows the workflow completed after 12m 13s, immediately followed by "You've hit your session limit · resets 12am (Asia/Jerusalem)". `feature-log.jsonl` gained exactly one new entry — `` `feature-inventor doctor` diagnostic/pre-flight command `` — `status: "abandoned"`, `reason: "agent error / no result"` — exactly matching `nightly.js`'s existing `if (!result) { ... }` handling for a single failed `agent()` call. No new commits landed on `nightly`, and `.feature-inventor-last-run.json` was never updated for this run — it still reflects the *first* real run from the previous night.
- Why this matters: this is the real-world case the "insufficient tokens, retry gracefully" conversation earlier this session was about, happening for real rather than hypothetically. The single-call failure path worked exactly as designed (one candidate cleanly logged as abandoned, not a crash). But the run never reached Finalize's file-writing steps (`writeRunSummary`, the push notification), so `status`/`recap` currently show no sign this attempt happened at all — the only visible trace is the one `feature-log.jsonl` line. The daemon's own poll loop is expected to (and should be verified to, next time this is observed) eventually log a `timed-out` entry and retry on its next continuous-churn cycle — but every retry before the account's limit resets will likely fail the same way, burning cycles harmlessly rather than making progress.
- Not fixed here: making Finalize's file-writing steps resilient to a mid-run capacity failure (so `status` reflects "attempted, but capacity-limited" instead of silently looking like nothing happened) is real, valuable follow-up work, not done in this entry. Candidate for `ROADMAP.md`.

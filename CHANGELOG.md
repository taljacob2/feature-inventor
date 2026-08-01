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

As of this writing, every entry below is `(hand-built)`:
`workflows/nightly.js` has not yet actually executed through the Workflow
tool (see `ROADMAP.md`'s `CronCreate` item for how we know that). Entries
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

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

## 2026-08-01 — Graceful stop, recap, and slash commands; nightly.js filesystem-access fix (hand-built)
- Effort/value estimate vs actual: not ICE-scored in advance — built directly from a conversation about product UX rather than picked off the ranked backlog. In hindsight, roughly a 6/7/7 (composite ~6.7): real next-morning value, fairly confident it would work cleanly, moderate effort (five new/changed source files, three doc files, three slash commands).
- Sanity checks: pass — `npm test` (47/47 tests, including 12 new cases across `stop-flag.test.ts`, `recap.test.ts`, and `cli.test.ts`) and `npm run build` both green; manually ran `stop`, `stop` again (already-pending path), `stop --cancel`, and `status` before/after against this actual repo and confirmed the printed behavior at each step, then removed the leftover local state file before committing.
- Commit: `c27022a`
- Notes from re-evaluation: Added `feature-inventor stop [--cancel]` (a gitignored stop-flag file, checked between features rather than mid-feature in `workflows/nightly.js`'s Implement loop, so anything already in progress still finishes/verifies/logs normally) and `feature-inventor recap [--since DATE|--all] [--peek]` (a "while you were sleeping" summary of `feature-log.jsonl`, tracking a local watermark so each recap only shows what's new). `status` now surfaces a pending stop request in both text and `--json`. Added three Claude Code slash commands (`/feature-inventor-status`, `-recap`, `-stop`) wrapping the CLI. While wiring the stop-flag check, found that `appendFeatureLogEntry` called `node:fs/promises` directly from the Workflow script body — but Workflow scripts have no filesystem access, only the agents they spawn do — so it would have silently never worked; never caught before because `workflows/nightly.js` has still never actually executed through real automation (confirmed via empty `TaskList`/`CronList` and no `feature-log.jsonl` on disk despite CHANGELOG/ROADMAP prose describing a completed run). Fixed by delegating the write to a small dedicated agent call, the same pattern the new stop-flag check/clear use. Also corrected that stale "this run" narration in `ROADMAP.md`'s `CronCreate` item so it doesn't cause the real first dry run to get skipped.

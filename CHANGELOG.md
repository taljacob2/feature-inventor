# Changelog

Append-only log of what the nightly loop actually shipped. Every entry
should be traceable to a git commit. This is the record a human reads each
morning to answer "what happened while I was asleep."

Format per entry:

```
## YYYY-MM-DD — <feature title>
- Effort/value estimate vs actual:
- Sanity checks: <pass/fail, what was checked>
- Commit: <sha>
- Notes from re-evaluation:
```

## 2026-08-01 — README.md quickstart

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

## 2026-08-01 — Clean error + non-zero exit in cli.ts for missing/malformed ROADMAP.md or CHANGELOG.md
- Effort/value estimate vs actual: ICE 6/8/9 (composite 7.7) — matched; the fix was a small try/catch wrapper as expected.
- Sanity checks: pass — `npm test` (10/10 tests, including 3 new cli.test.ts cases) and `npm run build` both green; manually ran `dist/cli.js status` from a directory with no ROADMAP.md/CHANGELOG.md and confirmed a one-line `Error: could not read ROADMAP.md (...)` message with exit code 1, and confirmed normal `status` output still works from the repo root.
- Commit: this commit
- Notes from re-evaluation:

## 2026-08-01 — Structured feature-attempt log persisted to a file
- Effort/value estimate vs actual: ICE 7/7/7 (composite 7.0) — matched; plain JSON Lines I/O, no architectural risk, exactly as scoped.
- Sanity checks: pass — `npm test` (22/22 tests, including 10 new src/feature-log.test.ts cases and 2 new src/cli.test.ts cases) and `npm run build` both green; manually simulated the new `appendFeatureLogEntry` helper's dynamic-`import('node:fs/promises')` call outside vitest and confirmed it appends valid, parseable JSON Lines records.
- Commit: this commit
- Notes from re-evaluation: Added `src/feature-log.ts` (serialize/append/parse for a `feature-log.jsonl` record: date, title, ICE score, status shipped/abandoned/reverted, reason, commit sha, verification concerns) plus tests, wired `workflows/nightly.js`'s Implement-phase loop to append one entry per feature attempt (agent-error, pre-verification abandon, post-verification shipped, and post-revert cases all covered), and extended `feature-inventor status` to read the log back as a "Recent feature attempts" section so the history survives past a single run's in-memory `shipped`/`abandoned` arrays. `nightly.js` already relies on a non-standard execution model (top-level `return`/`await` predating this change, confirmed still present on a clean checkout), so the new persistence call uses a dynamic `import()` inside an `async function` rather than a static top-level `import`, matching the file's existing pattern rather than introducing new syntax risk.

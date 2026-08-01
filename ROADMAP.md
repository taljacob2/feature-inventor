# Roadmap

This file is regenerated every run — never treat it as final. Items move
Now → Next → Later as they get picked up, and Horizon always gains at least
one new entry per run so the backlog never visibly empties (see
`VISION.md` operating principle #3).

Format: `- [ ] Title — effort/value, why it matters`. Older items still use
rough t-shirt sizes (S/M/L); `workflows/nightly.js` itself now scores
candidates with real ICE (Impact/Confidence/Ease) per `RESEARCH.md` §3 —
new items below use ICE where the estimate was made after that switch.

Items marked `[x]` below were hand-built during v0 scaffolding, not shipped
by the loop — `CHANGELOG.md` stays reserved for loop-shipped work, per its
own header, so their history lives in this repo's own commits instead.

## Now (this run's candidates, cheapest first)

- [x] `feature-inventor status` CLI command — done, v0 scaffold.
- [x] Sanity-check harness (`npm test` via vitest) — done, v0 scaffold.
- [x] Switch Research/Prioritize scoring in `workflows/nightly.js` from ad-hoc S/M/L to real ICE (Impact/Confidence/Ease) — done, hand-built; ranking is computed deterministically in code from ICE scores, the Prioritize agent only dedupes/scope-filters, see `RESEARCH.md` §3.
- [x] Independent verification pass before trusting a "shipped" claim — done, hand-built; a second agent independently re-runs tests and inspects the diff, reverting via `git revert` if it doesn't hold up, mitigating evaluator overconfidence per `RESEARCH.md` §2, §4 — and this first real run proved its worth by catching a false "matched" confidence claim on the backlog-counts feature below and reverting it before the bad claim could compound.
- [x] Clean error + non-zero exit in `cli.ts` when ROADMAP.md/CHANGELOG.md are missing or malformed — shipped, commit `7c4de84`.
- [x] Structured feature-attempt log persisted to a file — shipped this run, commit `a6ac44d`; `feature-inventor status` now reads it back as a "Recent feature attempts" section.
- [x] README.md quickstart — shipped this run, commit `8d45988`.
- [x] `status --json` machine-readable output mode — shipped this run, commit `a7f8887`.
- [ ] Retry: backlog section counts (Next/Later/Horizon) in `status` — S/S — ICE re-estimated 6/4/8 (Confidence down from 7): a prior attempt (`98fd48d`) was reverted (`aa35e1d`) because the reused `\b`-bounded heading regex matches `## Next Steps` as `## Next` (false match, first-match-wins), the CHANGELOG entry claimed this couldn't happen, and the new test written to cover exactly that case omitted the colliding heading from its own fixture so it passed without testing the claim; retry must fix `parseSection` to require the heading line end (or an explicit separator) after the name rather than a bare word boundary, and must add a fixture that actually contains a colliding heading like `## Next Steps` next to a real `## Next` section, asserting the right one is picked.
- [x] `feature-inventor stop` [--cancel] and `feature-inventor recap` [--since DATE|--all] [--peek] CLI commands, plus a stop-flag check wired into `workflows/nightly.js`'s Implement loop (checked between features, so one already in progress still finishes/verifies/logs normally) — done, hand-built. `status` also now surfaces a pending stop request. Treated as control/safety plumbing rather than a loop-invented feature — VISION.md's "loop invents its own UX" principle is being applied loosely while the platform itself is still being scaffolded.
- [x] Fixed a latent bug in `workflows/nightly.js`: `appendFeatureLogEntry` called `node:fs/promises` directly from the orchestrating script body, but Workflow scripts have no filesystem access — only the agents they spawn do (per the Workflow tool's own documented constraints). This was never caught because the loop has still never actually executed through real automation (see the corrected `CronCreate` item below) — confirmed empirically: `feature-log.jsonl` does not exist on disk despite CHANGELOG.md/ROADMAP.md narrating a completed run. Replaced with a delegated agent call; the new stop-flag check/clear use the same pattern.

## Next

- [ ] Calibration log: predicted ICE confidence vs. actual outcome (shipped-and-verified / abandoned / reverted), reviewed each Finalize phase — M/M — moved up from Later since this run now supplies real outcome data (3 shipped-and-verified, 1 reverted) worth calibrating against, notably a case where Confidence was overestimated for "mechanical reuse of existing code" without checking the existing code for latent bugs; see `RESEARCH.md` §4 on why self-reported confidence needs to be checked against reality, not trusted directly.
- [ ] Nightly summary push notification on run completion — M/M — depends on notification plumbing being worth the setup cost.
- [ ] Live per-feature progress visibility during a run — wire `TaskCreate`/`TaskUpdate` into `workflows/nightly.js`'s Implement loop (one task per candidate feature, pending → in_progress → completed) so `TaskList`/`TaskGet` show real-time status instead of just the current phase name — S/M.

## Later (harder, uncertain effort)

- [ ] `CronCreate` wiring for unattended nightly runs — M/L — deliberately gated on a human reviewing a few manual dry runs first (see `VISION.md`'s harness-not-dark-factory section). Correction: despite CHANGELOG.md/ROADMAP.md prose describing "this run" as the loop's first execution, no run has actually gone through the Workflow tool or `CronCreate` — confirmed 2026-08-01 via `TaskList`/`CronList` (both empty) and the absence of `feature-log.jsonl` (an automated run's delegated agents would have created it). The commits so far are hand-built, not loop-shipped. Still need a genuine `workflows/nightly.js` dry run through the Workflow tool before wiring cron.
- [ ] Output-mode switch (auto-commit / PR-per-feature / batched summary) — M/L — v0 hardcodes auto-commit-to-branch; making it switchable is real but not urgent work.
- [ ] Audit other regex-based parsing in `src/roadmap.ts` (e.g. fenced-code-block stripping, the original `parseNowSection` heading match this run's reverted feature inherited its bug from) for the same class of heading-collision or boundary bugs — M/S — prompted directly by this run's revert; ROADMAP.md is regenerated by an LLM every run, so heading text drifting into look-alike forms ("Next Steps", "Later Additions", "Horizon Scanning") is a realistic, not hypothetical, risk.

## Horizon (speculative — proof this list never runs dry)

- [ ] Support targeting a repo other than this one — deliberately NOT designed in from day one (see VISION.md); revisit once the self-hosted loop has proven itself and this stops being speculative.
- [ ] A small dashboard (even just a rendered markdown/HTML view) instead of CLI-only status, once there's a live run worth visualizing (see `RESEARCH.md` §5 on progress-display UX patterns) — `status --json` shipped this run gives this a real data source to render instead of scraping CLI text.
- [ ] Explore a hosted-service pivot per `VISION.md`'s runtime-adapter section (Claude Agent SDK instead of native Claude Code automation) — purely speculative, not to be picked up until the self-hosted loop has run unattended for a meaningful stretch.

---
*Last regenerated: 2026-08-01, after the loop's first real run: 3 features shipped and independently verified (structured feature-attempt log, README quickstart, `status --json`), 1 feature shipped-then-reverted after independent verification caught a false safety claim (backlog section counts — see `Now` above for the retry plan and CHANGELOG.md's history for the original claim).*

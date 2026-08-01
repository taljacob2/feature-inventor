# Feature Inventor

A self-hosted, self-growing project: instead of shipping a fixed product,
Feature Inventor runs a nightly autonomous loop — research → prioritize →
implement → sanity-check → commit → update roadmap → re-evaluate — that
invents features and builds them into *this very repo*, forever.

There's no "finished" version. The roadmap (`ROADMAP.md`) is designed to
regenerate its own horizon every time it gets close to empty, so the backlog
never visibly runs dry.

For the full model — why it's built this way, the harness-not-dark-factory
safety stance, and what "delightful" means for this project — see
`VISION.md`. Background research the design draws on lives in `RESEARCH.md`.

## Quickstart

Install dependencies and build once:

```sh
npm install
npm run build
```

Then check on the project — no extra setup needed:

```sh
node dist/cli.js status
# or: npm start -- status
```

If you'd rather run the bare `feature-inventor` command instead, register it
on your PATH once with `npm install -g .` (or `npm link`) from the repo
root; that's an optional convenience, not something the project requires.

```sh
feature-inventor status
```

`status` prints:
- **Last run** — where the most recent run left off: confirmation nothing
  was cut mid-feature, shipped/abandoned/not-attempted counts, and (if any)
  the titles of already-researched, already-ICE-scored candidates that
  didn't get attempted — so you can see they were carried into `ROADMAP.md`
  rather than lost, even if that run stopped early. Only shown once a run
  has actually completed.
- **Up next** — the current "Now" items from `ROADMAP.md`.
- **Backlog** — open-item counts for the Next/Later/Horizon sections, so you
  can see the backlog's shape at a glance.
- **Recently shipped** — the last few entries from `CHANGELOG.md`.
- **Recent feature attempts** — the last few records from `feature-log.jsonl`
  (title, ICE score, and outcome), once the loop has run at least once. Each
  line also shows an `[autonomy N/10]` score when self-assessment data exists
  for it — a rough, deterministic read (not a trained model) of how much
  that attempt leaned on inference/assumptions the agent couldn't fully
  verify, versus being cleanly spec'd and testable from what's already in
  the repo.
- **Calibration** — across all logged attempts: average predicted ICE
  confidence per outcome (shipped/abandoned/reverted), plus a hallucination
  rate — the fraction of self-reported-"confident" features that were later
  reverted anyway.
- Whether a graceful stop is currently pending (see below).

Add `--json` for machine-readable output (same data, no section headers).

### Recap: "while you were sleeping"

```sh
feature-inventor recap
```

Summarizes what shipped, was abandoned, or was reverted since the last time
you ran `recap` (it remembers a watermark date locally, gitignored, not
committed). `--all` shows the full history instead; `--peek` previews without
moving the watermark; `--since YYYY-MM-DD` picks an explicit start date. Add
`--json` for machine-readable output (same data, no formatted text).

### Stopping a run gracefully

```sh
feature-inventor stop
```

Asks a running (or about-to-run) nightly loop to wrap up early: it finishes
whatever feature it's currently implementing/verifying, skips starting
another one, still updates `ROADMAP.md`/`CHANGELOG.md`, then exits. This is
not a hard kill — nothing in progress gets cut off mid-write. Run
`feature-inventor stop --cancel` to undo a pending request before it takes
effect; `status` shows whether one is currently pending.

If you're using Claude Code directly, `/feature-inventor-status`,
`/feature-inventor-recap`, and `/feature-inventor-stop` wrap these same
commands as slash commands (see `.claude/commands/`).

### Starting a run

There's no `feature-inventor start` CLI command — the CLI is a plain Node
program and only the `Workflow` tool can actually execute
`workflows/nightly.js`. In a Claude Code session you can just ask directly
("run the nightly workflow") and it'll invoke the `Workflow` tool itself;
`/feature-inventor-start` is a convenience shortcut for the same thing
(optionally passing `maxFeatures`/`branchName`/`repoRoot`), not the only way
to do it. Unattended scheduling via `CronCreate` is a separate, not-yet-wired
path — see `ROADMAP.md`.

Run the test suite and type-check the same way the loop does:

```sh
npm test
npm run build
```

Working on Feature Inventor itself (not just using it)? See
`CONTRIBUTING.md`.

## How a nightly run works

Each run (`workflows/nightly.js`) walks the same loop described in
`VISION.md`:

1. **Research** — gather candidate features from the existing code/docs,
   comparable tools, and (once there's usage) real feedback.
2. **Prioritize** — score candidates with ICE (Impact/Confidence/Ease, see
   `RESEARCH.md` §3) and rank deterministically. Kept candidates also get a
   pairwise "collision rate" estimate (predicted file/logic overlap), used to
   order the queue by ICE tier and then by lowest collision within a tier —
   this only affects ordering today, since features are still implemented
   strictly one at a time (see "Not built yet" below).
3. **Implement** — build one feature at a time, writing/running real tests
   before calling anything done. A feature that turns out harder or riskier
   than its Ease score suggested is abandoned rather than forced through.
   `TaskList`/`TaskGet` show real-time per-feature progress (pending →
   in_progress → completed) while a run is in flight.
4. **Verify** — a second, independent pass re-runs tests and inspects the
   diff before a feature is trusted as "shipped"; anything that doesn't hold
   up is reverted with `git revert` (keeping the audit trail) rather than
   silently discarded.
5. **Finalize** — `CHANGELOG.md` gets one entry per shipped feature,
   `ROADMAP.md` is refreshed (items re-prioritized, at least one new horizon
   item added), every attempt (shipped, abandoned, or reverted, plus a
   self-assessment of how it went) is appended to `feature-log.jsonl`, and a
   push notification summarizes the run. `status`'s "Last run" section reads
   back the same summary afterward.

All of this happens on a disposable `nightly` branch — the loop never
touches `main`/`master` and never pushes to a remote. A human still reviews
and merges before anything reaches production; see VISION.md's "harness, not
dark factory" section for why that boundary is load-bearing.

**Not built yet:** running low-collision features in parallel (only the
scoring/ordering above exists so far — the Implement loop is still strictly
sequential), and any output mode besides committing straight to the branch
(`args.outputMode` accepts other values but errors out rather than
half-implementing them — see `ROADMAP.md`).

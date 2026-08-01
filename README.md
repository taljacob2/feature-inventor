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

### Installing the `feature-inventor` command globally (optional)

Everything in this doc works without this step — `node dist/cli.js <command>`
is enough on its own. If you'd rather type the bare `feature-inventor`
command:

```sh
npm link
```

This symlinks `feature-inventor` on your PATH to this repo's `dist/cli.js`.
Because it's a symlink to this repo — not a copy — **upgrading later is just
rebuilding, not reinstalling**:

```sh
git pull
npm install     # only needed if dependencies changed
npm run build    # recompiles dist/ -- the linked command picks it up immediately
```

No need to re-run `npm link` after pulling updates; only if `package.json`'s
`bin` entry itself changes. To remove it: `npm unlink -g feature-inventor`.

(`npm install -g .` is the alternative — it copies the files instead of
symlinking, works the same day-to-day, but then "upgrading" means re-running
`npm install -g .` after every `git pull` + `npm run build`, since a copy
doesn't see local changes on its own. `npm link` is simpler for a project
like this one that changes under you.)

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
to do it.

### Running unattended for extended periods

**Running this starts real, ongoing work immediately — it does not ask for
confirmation first.** The moment you run `feature-inventor daemon`, it
spawns a real headless Claude Code session, and by default spawns another
one back-to-back the instant each one finishes — indefinitely, until you
stop it (Ctrl+C) or it errors. A single run is ~20+ minutes and real API
cost (tonight's first real run: ~892K tokens, 27 agents) — treat starting
this as switching on an ongoing cost commitment, not running a one-off
command. See `--max-budget-usd` below if you want a hard ceiling on that
before you turn it on.

```sh
claude setup-token          # one-time: long-lived auth so scheduled runs don't need an interactive login
feature-inventor daemon --yolo
```

`feature-inventor daemon` is a long-running process that decides on its own
when a run is due (based on `.feature-inventor-last-run.json`'s timestamp)
and spawns a headless Claude Code invocation (`claude --bg`) to actually run
it, waiting for it to genuinely finish before considering that cycle done.
This is feature-inventor's *own* scheduler — not the OS's cron/Task
Scheduler (no OS-specific setup needed) and not Claude Code's `CronCreate`
(which is session-only, gone if that session ends, and auto-expires after 7
days — not a fit for "runs for months").

It also means commits land on the `nightly` branch far faster than most
people can review line-by-line; that's fine (nothing reaches
`main`/`master` without a human merging — see `VISION.md`'s
harness-not-dark-factory section), but plan to review in batches rather
than per-commit.

- `--every DURATION` — opt into a slower, fixed cadence instead of
  continuous churn (e.g. `12h`, `1d`). Omit this for the continuous default.
- `--yolo` (or `--unattended`) — bypasses Claude Code's permission prompts
  for the spawned runs (`--dangerously-skip-permissions` under the hood).
  This is a real trust decision — the spawned session can read/write files
  and run shell commands with nothing asking you to confirm — appropriate
  for this project's explicitly autonomous premise, but worth knowing what
  it actually does rather than just treating it as a fun flag name.
- `--max-budget-usd AMOUNT` — optional, **off by default**: a hard per-run
  spending cap passed through to the spawned `claude` invocation. With
  continuous churn as the default and no cap, cost is bounded only by how
  long you leave the daemon running — worth turning this on if that matters
  to you.
- `--once` — run at most one cycle then exit, useful for testing.

**Known limitation**: this process itself has to keep running for the
schedule to fire at all — unlike an OS scheduler, a reboot or a killed
process silently ends things until you start it again. Registering
auto-start-on-boot is planned but not built yet (see `ROADMAP.md`).

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

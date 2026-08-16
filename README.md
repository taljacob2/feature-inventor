# Feature Inventor

Feature Inventor is a **governed autonomous improvement harness for one repository at a time**. It turns an operator-approved goal and backlog into a bounded, evidence-backed review candidate: research → prioritize → implement → verify → document → review.

Feature Inventor itself is the reference target used to dogfood the harness. Its self-improving loop is useful evidence, not a reason to let an agent run forever or autonomously ship changes. Every normal run is bounded, isolated, and reviewable; automation never merges to a default branch, deploys, or releases by itself.

For the product boundary, runtime architecture, and remediation sequence, see [`ARCHITECTURE.md`](ARCHITECTURE.md). `VISION.md` explains the harness-not-dark-factory safety stance, while `RESEARCH.md` records the background research behind the design.

## Quickstart

Install dependencies and build once:

```sh
npm install
npm run build
```

Then validate the target and check on the project:

```sh
node dist/cli.js doctor
node dist/cli.js status
# or: npm start -- doctor
```

`doctor` is non-mutating. It validates the target manifest, Git root and origin, current branch, workspace state, declared checks, and the manual scheduling default before any governed run begins.

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

### Governing a target repository

`feature-inventor.target.json` is the operator-owned contract for the repository. It records repository identity, product goals, required checks, protected paths, review boundaries, and scheduling preference.

```json
{
  "schemaVersion": 1,
  "repository": {
    "url": "https://github.com/example/project.git",
    "defaultBranch": "main"
  },
  "goals": ["Improve release reliability"],
  "requiredChecks": ["npm test", "npm run build"],
  "protectedPaths": [".github/workflows/**"],
  "reviewPolicy": { "maxFilesChanged": 12, "humanApprovalRequired": true },
  "schedule": { "mode": "manual" }
}
```

Run `feature-inventor doctor` before planning or launching a run. Unknown manifest fields are reported as warnings rather than silently ignored. Manifest creation will move to `feature-inventor init` in the next remediation batch; until then, copy the documented shape above and adapt it for the target repository.

### Portable run planning (runtime-neutral foundation)

```sh
feature-inventor plan
# or: feature-inventor plan --json
```

`plan` is a **read-only** preview of a future portable run. It selects open
`Now` items (or `Next` when `Now` is clear), extracts existing ICE scores where
present, applies the conservative portable-run policy, orders candidates
deterministically, and labels every candidate carried forward by the per-run
cap. It invokes no agent and makes **no filesystem, worktree, branch, commit,
or remote change**.

An optional `feature-inventor.config.json` in the repository root controls the
preview and is designed to become the common policy for every runtime adapter:

```json
{
  "maxFeatures": 1,
  "branchPrefix": "nightly",
  "requireIsolatedWorktree": true,
  "requireIndependentVerification": true,
  "testCommands": ["npm test", "npm run build"],
  "remotePushPolicy": "forbidden"
}
```

All fields are optional. The defaults above apply if the file is absent;
`remotePushPolicy` accepts only `"forbidden"` (the default) or
`"explicit-only"`. The Manus adapter below consumes the same contract. The
`plan` command itself does **not** execute features; it remains a safe preview
of what the portable executor would be asked to do.

### Running a Manus task (portable executor)

The `manus run` command turns the read-only plan into a private, asynchronous
Manus task. It uses the Manus task API rather than Claude Code; the resulting
agent clones the repository into its own workspace, creates an isolated review
branch, implements at most the configured number of queued candidates, and
performs a separate verification pass.

```sh
export MANUS_API_KEY='your-api-key'
feature-inventor manus run
```

The command prints a task URL for monitoring. It does not wait for completion,
auto-answer questions, auto-confirm commands, or silently approve a push. For
a private GitHub repository, supply the GitHub connector available to the task:

```sh
feature-inventor manus run --github-connector YOUR_CONNECTOR_ID
```

You may also associate the task with a Manus project or choose an available
agent profile:

```sh
feature-inventor manus run --project YOUR_PROJECT_ID --profile manus-1.6
```

The default policy is **local commits only**: the task is instructed not to
push, open a pull request, merge, or alter a remote repository. Allowing a
review-branch push requires *both* an explicit configuration policy and an
explicit command flag; it never permits a push or merge to `main`/`master`:

```json
{ "remotePushPolicy": "explicit-only" }
```

```sh
feature-inventor manus run --allow-remote-push
```

If the task pauses for a confirmation or input, inspect it at the returned task
URL and decide there. The CLI intentionally does not auto-confirm any pending
actions. See the [Manus task lifecycle documentation](https://open.manus.ai/docs/v2/task-lifecycle)
for the possible task states.

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

### Running a bounded daemon cycle

A daemon cycle is **not** started implicitly. Use one bounded cycle for normal operation:

```sh
feature-inventor daemon --once --max-features 1 --yolo
```

Repeated execution is an explicit scheduling choice. It requires a cadence, a timeout, and a feature cap:

```sh
feature-inventor daemon --every 24h --timeout 2h --max-features 1 --yolo
```

A repeated run remains a significant trust decision because `--yolo` bypasses permission prompts for the spawned Claude Code session. Start with one bounded, reviewable cycle and enable repetition only after the target has passed `doctor` and the resulting review packets are consistently useful.

**Auth**: if you're already logged in on this machine (check with
`claude auth status`), that's enough — the same login carries through to the
headless `claude --bg` calls the daemon spawns, no extra setup needed.
`claude setup-token` (a separate, longer-lived credential) is only for a
machine that's never done an interactive login at all — a fresh CI runner or
headless server, not a normal dev machine you already use Claude Code on. If
the daemon ever starts silently failing to authenticate after running for a
long stretch (days/weeks), that's the first thing to check — an interactive
session's credential may not last as long as a dedicated token; re-run
`claude auth login` (or set up a token at that point) to refresh it.

`feature-inventor daemon` is a long-running process that decides on its own
when a run is due (based on `.feature-inventor-last-run.json`'s timestamp)
and spawns a headless Claude Code invocation (`claude --bg`) to actually run
it, waiting for it to genuinely finish before considering that cycle done.
This is feature-inventor's *own* scheduler — not the OS's cron/Task
Scheduler (no OS-specific setup needed) and not Claude Code's `CronCreate`
(which is session-only, gone if that session ends, and auto-expires after 7
days — not a fit for "runs for months").

The legacy Claude daemon remains a transitional execution path. It now
requires an explicit bounded mode, but it does not yet create a runner-owned
worktree. Do not run it from a checkout that is being edited interactively;
use the Manus path for an isolated task workspace until the shared adapter
migration is complete. Nothing reaches `main`/`master` without a human merge.

- `--once` — run one bounded cycle, which is the required safe mode when no schedule is intended.
- `--every DURATION` — enable repeated execution at an explicit fixed cadence (for example, `12h` or `1d`). It requires both `--timeout` and `--max-features`.
- `--yolo` (or `--unattended`) — bypasses Claude Code's permission prompts
  for the spawned runs (`--dangerously-skip-permissions` under the hood).
  This is a real trust decision — the spawned session can read/write files
  and run shell commands with nothing asking you to confirm — appropriate
  for this project's explicitly autonomous premise, but worth knowing what
  it actually does rather than just treating it as a fun flag name.
- `--max-budget-usd AMOUNT` — optional, **off by default**: a hard per-run
  spending cap passed through to the spawned `claude` invocation. It is an
  additional guard for an explicitly scheduled run, not a substitute for the
  required cadence, timeout, and feature cap.
- `--max-features COUNT` — bound how many features the spawned workflow may ship in each cycle. It defaults to one for `--once` and is required for `--every`.

**Known limitations**: this process itself has to keep running for the
schedule to fire at all, and the legacy Claude daemon has not yet been moved
to a runner-created worktree. A reboot, a killed process, or concurrent
interactive editing therefore requires operator attention. The shared
run-journal and isolated-workspace migration is tracked in `ARCHITECTURE.md`.

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

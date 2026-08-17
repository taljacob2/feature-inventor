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
  "schedule": { "mode": "manual" },
  "indexing": {
    "enabled": true,
    "historyDays": 90,
    "defaultContextPack": "change",
    "maxEstimatedTokens": 4000,
    "includeGovernedArtifacts": true
  }
}
```

Run `feature-inventor doctor` before planning or launching a run. Unknown manifest fields are reported as warnings rather than silently ignored. The optional `indexing` section sets local repository-intelligence policy. Its Git-history window is maintenance evidence only; it is not a measure of runtime or user activity. Manifest creation will move to `feature-inventor init` in a later remediation batch; until then, copy the documented shape above and adapt it for the target repository.

### Repository orientation and indexing

`INDEX.md` is the concise committed navigation map. `docs/indexing/features.yml` is the reviewed source-linked feature and flow registry. Together they provide a fast, auditable route from a product capability to its entry point, implementation paths, tests, and risks without treating generated summaries as source of truth.

```sh
feature-inventor docs validate
feature-inventor index status
# Each command also supports --json.
```

`docs validate` checks the committed registry and every referenced source path or exported symbol. `index status` is read-only: it reports whether a future generated local snapshot is fresh, stale, dirty, incomplete, disabled, or not yet initialized. Snapshots remain under the Git-ignored `.feature-inventor/index/` directory and are rebuilt from an exact checkout rather than committed. See the [Repository Index](INDEX.md) and [Indexing and Context Retrieval](docs/indexing/INDEXING.md) guides for the contract and rollout.

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

### Creating a governed run proposal

After `doctor` passes and you have reviewed the read-only plan, create a durable proposal:

```sh
feature-inventor propose
# or: feature-inventor propose --json
```

`propose` does **not** start an agent. It resolves the configured default branch to a concrete Git commit, stores the full queue and policy with stable hashes, and initializes an append-only journal with a `planned` event. Local artifacts are placed under `.feature-inventor/runs/<run-id>/` and are intentionally ignored by Git.

```sh
feature-inventor status
feature-inventor journal RUN_ID
feature-inventor journal RUN_ID --json
feature-inventor recap --all --peek
```

`status` shows recent governed runs, `journal` shows one run's durable events, and `recap` includes governed-run summaries alongside the legacy feature-attempt recap. Both Manus and Claude Code consume the same selected proposal, append lifecycle evidence to the same journal, and produce the same runtime-result contract. The historical `workflows/nightly.js` script is retained only as an archive of prior behavior; do not use it for new governed runs.

### Running a Manus task from a governed proposal

The `manus run` command executes one selected proposal as a private, asynchronous Manus task. It no longer recomputes the current roadmap queue at launch. The CLI verifies that the local Git origin and configured default-branch commit still match the operator-approved proposal before it creates the task.

```sh
feature-inventor propose
# Note the emitted run ID, then:
export MANUS_API_KEY='your-api-key'
feature-inventor manus run --run RUN_ID
```

The task receives the run ID, proposal and manifest hashes, approved base commit, policy, goals, and fixed candidate queue. It must clone the repository into its own workspace, create the review branch from that exact commit, and stop rather than substitute a newer default branch. Immediately after task creation, the CLI appends the task ID and URL to the selected run journal.

The command prints a task URL for monitoring. It does not wait for completion,
auto-answer questions, auto-confirm commands, or silently approve a push. For
a private GitHub repository, supply the GitHub connector available to the task:

```sh
feature-inventor manus run --run RUN_ID --github-connector YOUR_CONNECTOR_ID
```

You may also associate the task with a Manus project or choose an available
agent profile:

```sh
feature-inventor manus run --run RUN_ID --project YOUR_PROJECT_ID --profile manus-1.6
```

The default policy is **local commits only**: the task is instructed not to
push, open a pull request, merge, or alter a remote repository. Allowing a
review-branch push requires *both* an explicit configuration policy and an
explicit command flag; it never permits a push or merge to `main`/`master`:

```json
{ "remotePushPolicy": "explicit-only" }
```

```sh
feature-inventor manus run --run RUN_ID --allow-remote-push
```

### Running Claude Code from a governed proposal

The `claude run` command is the local, proposal-backed Claude Code adapter. It resolves the same approved proposal and base commit as `manus run`, creates a dedicated local worktree and branch, then invokes Claude Code without any permission-bypass flag. It never pushes, opens a pull request, merges code, or finalizes the run.

```sh
feature-inventor propose
# Note the emitted run ID, then:
feature-inventor claude run --run RUN_ID
```

Claude Code must work only inside `.feature-inventor/worktrees/RUN_ID/`, run every proposal-required check, and write `runtime-result.json` into the selected run directory. The adapter rejects a missing or proposal-mismatched result and rejects any result that reports a remote push or review URL. A successful local adapter run records `workspace-prepared`, `candidate-started`, and `task-completed` events in the same journal used by the Manus path. Continue with `review RUN_ID` and `finalize RUN_ID --confirm` only after inspecting the resulting evidence.

### Watching or recovering a Manus run

```sh
export MANUS_API_KEY='your-api-key'
feature-inventor watch RUN_ID
# After an interrupted local watch command:
feature-inventor recover RUN_ID
```

Both commands make one passive task-status request and reconcile at most one new status event into the selected journal. A `running` task is recorded as `task-running`; a task waiting for input or confirmation is recorded as `task-waiting`; a stopped task becomes `task-completed` and is shown as **awaiting review** until evidence is finalized; and an API-reported task error becomes `run-failed`. Re-running `watch` or `recover` is safe because the same external source event is not appended twice.

`watch` and `recover` never send a message, approve a confirmation, provide a secret, push a branch, create a pull request, or merge code. If the task pauses for input or a confirmation, inspect it at the returned task URL and decide there. See the [Manus task lifecycle documentation](https://open.manus.ai/docs/v2/task-lifecycle) for the possible task states.

### Capturing evidence and finalizing a governed run

A stopped task is **not** a completed governed run. Every Manus task is now created with a strict structured-output schema. On completion, `capture` preserves its `runtime-result.json`: the approved and actual commit, isolated branch and worktree, candidate outcome, patch summary, every verification command and result, remote effects, and blockers. The result must match the immutable proposal before it can supply review evidence.

```sh
feature-inventor capture RUN_ID
feature-inventor review RUN_ID
```

`review` derives passing or failing evidence for proposal-required checks from the captured runtime result. Use `verify` only for additional local evidence that the runtime result cannot contain:

```sh
feature-inventor verify RUN_ID --check 'npm test' --passed --evidence 'independent local rerun: 162 tests passed'
feature-inventor review RUN_ID
```

These artifacts remain in `.feature-inventor/runs/RUN_ID/`: `task-outcome.json` stores the passive external outcome, `runtime-result.json` stores the API-validated execution artifact, `verification.jsonl` stores supplementary append-only check evidence, and `review.json` derives readiness from the exact proposal and captured evidence. `status` displays a review packet’s readiness when one exists.

Finalization is a **local lifecycle decision only**. It cannot push, merge, or alter a remote repository, but it still requires an explicit command after the review packet is ready:

```sh
feature-inventor finalize RUN_ID --confirm
```

A packet is ready only when the captured task status is `stopped`, a valid `runtime-result.json` matches the selected proposal and approved base commit, every required check has passing evidence, and the packet hashes still match the proposal. Failed or missing runtime or check evidence keeps the run pending or blocked.

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

### Starting a governed run

New execution begins with an explicit, immutable proposal rather than the historical `Workflow` script. After `doctor` passes, create and inspect a proposal, then choose one supported runtime:

```sh
feature-inventor propose
feature-inventor journal RUN_ID
feature-inventor claude run --run RUN_ID
# or: feature-inventor manus run --run RUN_ID
```

Both paths require the selected proposal’s exact base commit, use an isolated workspace, write a structured runtime result, and leave finalization behind the evidence-backed review gate. They do not push or merge by default.

### Scheduling handoffs

The old `feature-inventor daemon` is **retired**. It fails closed and no longer launches `workflows/nightly.js`, because that path cannot enforce the proposal, worktree, runtime-result, and review contract. `daemon clean` remains available solely to stop stale background sessions created by earlier versions.

To prepare one reviewed proposal for a scheduler configured outside this repository, write an exact non-executing handoff:

```sh
feature-inventor schedule handoff RUN_ID --runtime claude
# or: feature-inventor schedule handoff RUN_ID --runtime manus
```

The handoff is stored inside the run directory and contains only the approved run ID, immutable proposal identity, selected runtime, and exact permitted command. It does **not** register a timer, start a process, provide credentials, or execute any work. Status shows the recorded handoff next to the governed run.

A durable recurring scheduler is intentionally deferred until a deployment target and frequency are chosen. A low-frequency, AI-judgment schedule and a persistent local or hosted runner have different operational and cost trade-offs; neither should be inferred from a handoff artifact. Until that decision is implemented, the handoff preserves a reviewable, fail-closed boundary.

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

## Developer documentation

Developers adding or maintaining an execution engine should read the [Runtime Adapter Implementation Guide](docs/runtimes/IMPLEMENTING_ADAPTERS.md). It describes the adapter contract, capability model, lifecycle ownership rules, conformance requirements, and a practical workflow for future runtimes such as Codex.

Developers adding a product capability, source flow, or language extractor should start with the [Repository Index](INDEX.md) and [Indexing and Context Retrieval guide](docs/indexing/INDEXING.md). The committed registry is validated with `feature-inventor docs validate`; generated local snapshots remain advisory and commit-pinned.

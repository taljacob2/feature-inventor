# Contributing to Feature Inventor

This is a short map of the codebase and the loop you're expected to run
while changing it. For *why* the project is built this way, see `VISION.md`
and `RESEARCH.md`; for *what's planned*, see `ROADMAP.md`; for *what's
shipped*, see `CHANGELOG.md`.

## Where things live

| Path | What it is |
|---|---|
| `src/*.ts` | The CLI (`cli.ts`) and its pure parsing logic (`roadmap.ts`, `feature-log.ts`, `calibration.ts`, `autonomy.ts`, `run-summary.ts`, `daemon.ts`, `recap.ts`, `stop-flag.ts`). Each has a matching `*.test.ts`. |
| `workflows/nightly.js` | The nightly loop itself — a **Workflow-tool script**, not a plain Node file. See below. |
| `.claude/commands/*.md` | Claude Code slash commands: `status`/`recap`/`stop` wrap the CLI; `start` is a shortcut for asking Claude to invoke the `Workflow` tool directly (the CLI itself can't — see below). |
| `ROADMAP.md` | The backlog: what's planned, in progress, or done. |
| `CHANGELOG.md` | What's actually shipped, one entry per feature, tagged `(loop-shipped)` or `(hand-built)`. |
| `VISION.md` / `RESEARCH.md` | Why the project exists and the research its design choices are based on. |

## Dev loop

```sh
npm install
npm test        # vitest — runs src/*.test.ts directly against the TS source, no build needed
npm run build    # tsc — required before running the compiled CLI for real
```

Edit a `.ts` file, run `npm test` to check it fast, then `npm run build`
before trying `feature-inventor` / `node dist/cli.js` — those run the
compiled `dist/`, not your source edits, until you rebuild.

## Changing the CLI (`src/*.ts`)

Standard TypeScript + vitest. Each module (`roadmap.ts`, `feature-log.ts`,
`recap.ts`, `stop-flag.ts`) exports small pure functions — parse, serialize,
build — that `cli.ts` wires up to actual file I/O (`readFileSync`,
`writeFileSync`, etc.). Keep new logic in that pure layer, covered by tests
that don't touch the filesystem; keep `cli.ts` itself a thin wrapper.

## Changing the nightly loop (`workflows/nightly.js`)

This file only runs inside Claude Code's `Workflow` tool — you can't `node
workflows/nightly.js` it. That runtime imposes real constraints worth
knowing before you edit it:

- **No direct filesystem or Node API access in the script body.** Only the
  agents it spawns via `agent()` have file/Bash tools. We hit this for
  real: `appendFeatureLogEntry` used to call `node:fs/promises` straight
  from the script and would have silently never worked — fixed by
  delegating the write to a small dedicated `agent()` call instead.
- **No `Date.now()`/`Math.random()`/bare `new Date()`** in the script body.
- **There is no automated test harness for this file.** The only way to
  validate a change is to actually invoke it through the `Workflow` tool
  and read what happened. It has now executed for real at least once
  (2026-08-01: 3 features shipped and independently verified, 4 candidates
  carried forward, `feature-log.jsonl` and `.feature-inventor-last-run.json`
  both genuinely produced by that run — see `CHANGELOG.md`) — but a single
  successful run doesn't mean every future change here is automatically
  safe; still validate changes with a real dry run through the `Workflow`
  tool, not just by reading the diff.
- **Nothing in this file should be hardcoded to one machine.** It used to
  hardcode an absolute Windows path as `REPO_ROOT`; that's fixed now —
  `resolveRepoRoot()` auto-detects via `git rev-parse --show-toplevel` and
  confirms `package.json`'s `name` before trusting it, or takes an explicit
  `args.repoRoot` override. Don't reintroduce a literal path if you touch
  this again.

The workflow accepts optional `args`: `repoRoot` (explicit path override),
`branchName` (default `"nightly"`), `maxFeatures` (default `3`), `outputMode`
(default `"auto-commit"` — the only mode actually implemented; other values
error out with an explanation rather than silently doing the wrong thing,
since `"pr-per-feature"` in particular would require pushing to a remote,
conflicting with the never-push safety boundary until a human decides
otherwise).

## Running the daemon (`feature-inventor daemon`)

`src/daemon.ts` holds the pure decision logic (is a run due, given the
interval and the last run's timestamp; the log format) — fully unit tested.
The actual spawn/poll orchestration lives in `cli.ts`'s `runDaemonCycleIfDue`/
`runDaemon` and isn't unit tested, for the same reason `workflows/nightly.js`
isn't: it spawns a real `claude` process and waits on real wall-clock time.

Design notes worth knowing before touching this:

- **The spawned process's exit is never trusted as proof a run finished.**
  The `Workflow` tool returns immediately and finishes its spawned agents
  later — confirmed by this project's own first real run — and whether a
  headless `claude --bg` invocation's process lifetime spans that later
  completion isn't verified either way. The authoritative signal is
  `.feature-inventor-last-run.json`'s `completedAt` actually advancing past
  the cycle's start time; `claude --bg`'s own exit is just logged for
  diagnostics.
- **This is feature-inventor's own scheduler, deliberately not the OS's and
  deliberately not Claude Code's `CronCreate`.** `CronCreate` jobs are
  session-only (gone if the Claude Code session ends), auto-expire after 7
  days, and only fire while idle — none of which fits "runs for months." An
  OS-level scheduler would survive a reboot, which this doesn't (yet) —
  registering auto-start-on-boot is a known, deliberately-deferred
  follow-up, not an oversight.
- **`--yolo`/`--unattended` passes `--dangerously-skip-permissions`** to the
  spawned `claude` invocation — bypasses every permission check for that
  run. Real, documented, opt-in; don't make it the default.
- **Default `intervalMs` is `0` — continuous churn, on purpose.** `isRunDue`
  treats `0` as always-due, so with no `--every` flag the next run starts as
  soon as the previous one's `.feature-inventor-last-run.json` update lands.
  `--every DURATION` opts into a slower cadence. `checkMs`'s idle-poll sleep
  only applies when a cycle found *nothing* due — it never adds latency
  between two back-to-back continuous-churn runs (see `runDaemon`'s loop).
- **`--max-budget-usd` is optional, off by default, and only added to the
  spawn args when set** (it requires `--print`, per `claude --help`, which
  is otherwise not passed — the default `claude --bg` invocation without
  `--print` is the combination actually exercised against the real binary
  so far; `--bg` + `--print` together isn't separately verified).
- **Testing this live is genuinely risky, not just inconvenient.** Trying to
  intercept the `claude` binary via a `PATH` override to test with a fake
  stand-in failed twice while building this (Windows resolves `claude`
  through a mechanism `child_process.spawn` doesn't respect PATH
  overrides for), each time silently dispatching a real background session
  instead of the fake. If you need to test the spawn/poll path again, treat
  it as dispatching a real session — check `claude agents --json` and
  `claude stop <id>` it afterward — rather than trusting a PATH override
  actually redirected anything.

One-time setup for actually running this unattended: `claude setup-token`
sets up a long-lived auth token so a scheduled run doesn't need an
interactive login each time.

## Recording what shipped

Every shipped change — whether produced by the automated loop or hand-built
in a human-directed session — gets one entry in `CHANGELOG.md`, tagged
`(loop-shipped)` or `(hand-built)`. Match the existing entry format (effort/
value estimate vs. actual, sanity checks actually run, commit sha, notes).
Check the matching `ROADMAP.md` item off `[x]` with a one-line pointer to
the `CHANGELOG.md` entry rather than repeating the story in both places.

## Safety boundary

The loop commits to a disposable `nightly` branch and never pushes to a
remote or touches `main`/`master` on its own — see `VISION.md`'s
harness-not-dark-factory section for why. That boundary is about the
*automated* loop specifically; a human explicitly directing a commit or
push in a normal Claude Code session is a deliberate action, not the loop
auto-shipping, and isn't restricted by this rule.

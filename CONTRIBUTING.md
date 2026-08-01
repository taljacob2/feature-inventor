# Contributing to Feature Inventor

This is a short map of the codebase and the loop you're expected to run
while changing it. For *why* the project is built this way, see `VISION.md`
and `RESEARCH.md`; for *what's planned*, see `ROADMAP.md`; for *what's
shipped*, see `CHANGELOG.md`.

## Where things live

| Path | What it is |
|---|---|
| `src/*.ts` | The CLI (`cli.ts`) and its pure parsing logic (`roadmap.ts`, `feature-log.ts`, `recap.ts`, `stop-flag.ts`). Each has a matching `*.test.ts`. |
| `workflows/nightly.js` | The nightly loop itself — a **Workflow-tool script**, not a plain Node file. See below. |
| `.claude/commands/*.md` | Claude Code slash commands that wrap the CLI. |
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
  and read what happened. As of this writing, `workflows/nightly.js` has
  still never executed through real automation — confirmed by an empty
  `TaskList`/`CronList` and no `feature-log.jsonl` on disk. A manual dry
  run through the `Workflow` tool is the natural way to validate a change
  here, and is explicitly the gate before `CronCreate` gets wired for
  unattended runs (see `ROADMAP.md`'s `CronCreate` item).
- **Nothing in this file should be hardcoded to one machine.** It used to
  hardcode an absolute Windows path as `REPO_ROOT`; that's fixed now —
  `resolveRepoRoot()` auto-detects via `git rev-parse --show-toplevel` and
  confirms `package.json`'s `name` before trusting it, or takes an explicit
  `args.repoRoot` override. Don't reintroduce a literal path if you touch
  this again.

The workflow accepts optional `args`: `repoRoot` (explicit path override),
`branchName` (default `"nightly"`), `maxFeatures` (default `3`).

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

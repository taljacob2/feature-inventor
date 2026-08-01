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

Then check on the project:

```sh
feature-inventor status
```

(Or, without installing the `bin` globally: `node dist/cli.js status`, or
`npm start -- status` during development.)

`status` prints:
- **Up next** — the current "Now" items from `ROADMAP.md`.
- **Recently shipped** — the last few entries from `CHANGELOG.md`.
- **Recent feature attempts** — the last few records from `feature-log.jsonl`
  (title, ICE score, and outcome), once the loop has run at least once.

Run the test suite and type-check the same way the loop does:

```sh
npm test
npm run build
```

## How a nightly run works

Each run (`workflows/nightly.js`) walks the same loop described in
`VISION.md`:

1. **Research** — gather candidate features from the existing code/docs,
   comparable tools, and (once there's usage) real feedback.
2. **Prioritize** — score candidates with ICE (Impact/Confidence/Ease, see
   `RESEARCH.md` §3) and rank deterministically; cheap, high-value work goes
   first.
3. **Implement** — build one feature at a time, writing/running real tests
   before calling anything done. A feature that turns out harder or riskier
   than its Ease score suggested is abandoned rather than forced through.
4. **Verify** — a second, independent pass re-runs tests and inspects the
   diff before a feature is trusted as "shipped"; anything that doesn't hold
   up is reverted with `git revert` (keeping the audit trail) rather than
   silently discarded.
5. **Finalize** — `CHANGELOG.md` gets one entry per shipped feature,
   `ROADMAP.md` is refreshed (items re-prioritized, at least one new horizon
   item added), and every attempt (shipped, abandoned, or reverted) is
   appended to `feature-log.jsonl`.

All of this happens on a disposable `nightly` branch — the loop never
touches `main`/`master` and never pushes to a remote. A human still reviews
and merges before anything reaches production; see VISION.md's "harness, not
dark factory" section for why that boundary is load-bearing.

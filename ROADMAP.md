# Roadmap

This file is regenerated every run — never treat it as final. Items move
Now → Next → Later as they get picked up, and Horizon always gains at least
one new entry per run so the backlog never visibly empties (see
`VISION.md` operating principle #3).

Format: `- [ ] Title — effort/value, why it matters`. Effort and value are
rough t-shirt sizes (S/M/L) for now; switching this to ICE scoring is
itself a queued item below (see `RESEARCH.md` §3).

Items marked `[x]` below were hand-built during v0 scaffolding, not shipped
by the loop — `CHANGELOG.md` stays reserved for loop-shipped work, per its
own header, so their history lives in this repo's own commits instead.

## Now (this run's candidates, cheapest first)

- [x] `feature-inventor status` CLI command — done, v0 scaffold.
- [x] Sanity-check harness (`npm test` via vitest) — done, v0 scaffold.
- [ ] Clean error + non-zero exit in `cli.ts` when ROADMAP.md/CHANGELOG.md
      are missing or malformed — S/S — currently an unhandled stack trace;
      found via the CLI-UX pass in `RESEARCH.md` §5.
- [ ] Switch Research/Prioritize scoring in `workflows/nightly.js` from
      ad-hoc S/M/L to real ICE (Impact/Confidence/Ease) — S/M — see
      `RESEARCH.md` §3; also the prerequisite for the calibration-log item
      below, since ICE's Confidence field is what gets tracked.

## Next

- [ ] First real execution of `workflows/nightly.js` — the Research,
      Prioritize, Implement, and Finalize phases are drafted but have never
      actually run; this is a dry run, not new code.
- [ ] Structured feature-attempt log persisted to a file (what was tried,
      why abandoned if abandoned) — S/M — the workflow script returns this
      in-memory today but doesn't write it anywhere durable yet.
- [ ] Independent verification pass before trusting a "shipped" claim —
      M/M — mitigates evaluator overconfidence (`RESEARCH.md` §2, §4):
      right now the same agent that implements a feature also judges
      whether it's done.

## Later (harder, uncertain effort)

- [ ] Calibration log: predicted ICE confidence vs. actual outcome,
      reviewed each Finalize phase — M/M — depends on the ICE-scoring item
      above landing first; see `RESEARCH.md` §4 on why self-reported
      confidence needs to be checked against reality, not trusted directly.
- [ ] Nightly summary push notification on run completion — M/M — depends
      on notification plumbing being worth the setup cost.
- [ ] `CronCreate` wiring for unattended nightly runs — M/L — deliberately
      gated on a human reviewing a few manual dry runs first (see
      `VISION.md`'s harness-not-dark-factory section).
- [ ] Output-mode switch (auto-commit / PR-per-feature / batched summary) —
      M/L — v0 hardcodes auto-commit-to-branch; making it switchable is
      real but not urgent work.

## Horizon (speculative — proof this list never runs dry)

- [ ] Support targeting a repo other than this one — deliberately NOT
      designed in from day one (see VISION.md); revisit once the self-hosted
      loop has proven itself and this stops being speculative.
- [ ] A small dashboard (even just a rendered markdown/HTML view) instead of
      CLI-only status, once there's a live run worth visualizing (see
      `RESEARCH.md` §5 on progress-display UX patterns).

---
*Last regenerated: 2026-08-01, after the first research pass (see
`RESEARCH.md`). Still not yet run by the loop itself.*

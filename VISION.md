# Feature Inventor — Vision

## What this is

Feature Inventor is a self-hosted, self-growing project. It has no fixed
product spec — instead it runs a nightly autonomous loop (research → prioritize
→ implement → sanity-check → commit → update roadmap → re-evaluate) that
invents features and builds them into *this very repo*, forever. There is
never a "finished" version — the roadmap is designed to regenerate its own
horizon every time it gets close to empty.

v0 is deliberately small: just enough of a loop, a CLI, and a persistent
roadmap/changelog for the system to start improving itself. Everything else —
a dashboard, notifications, richer prioritization, support for targeting
other repositories — is expected to be *invented by the loop itself* rather
than hand-built up front. If "point this at another repo" turns out to be
valuable, that should show up as an entry in ROADMAP.md that the loop
proposes and ships on its own, not a day-one assumption baked into the
architecture.

## Prior art & where we sit on the safety spectrum

This loop is an application of what the industry calls the "Ralph" pattern
(see `RESEARCH.md`): run an agent repeatedly against a concrete, testable
completion criterion until it's met, then move on. It's a known, proven
shape — teams have used it for overnight refactors and backlog triage at
real scale. We're not inventing the pattern, we're wrapping it in a product
(roadmap, changelog, CLI, re-evaluation) that makes it observable and
trustworthy over long unattended stretches.

That same research draws a hard line between an **agent harness** (human
review before anything reaches production) and a **dark factory** (fully
autonomous, no human in the path to production). Feature Inventor is
deliberately a harness, not a dark factory: the loop commits to a `nightly`
branch, never touches `main`/`master`, and never pushes to a remote. A human
merge is always required before anything the loop builds reaches whatever
"production" means for this project. "Auto-commit" as an output mode means
auto-commit *to a disposable branch*, not auto-ship — that distinction is
load-bearing and should not quietly erode as the loop gets more capable.

The sharper residual risk is **evaluator overconfidence**: right now a
single agent both implements a feature and judges whether its own tests
justify calling it "shipped." Mitigating that (independent verification,
tracking confidence calibration over time) is real work, tracked in
`ROADMAP.md`, not solved by this paragraph.

## Who it's for

Developers and product designers, generally — not tuned to any one person's
workflow or preferences. It's a production-grade product, not a personal
script: the bar for "done" is the same as any tool meant to be handed to a
stranger and trusted — real tests, no hardcoded personal assumptions,
documented behavior.

The current runtime is native Claude Code automation (scheduled nightly via
`CronCreate`, orchestrated via `Workflow`, git for history/rollback) because
that's the fastest honest path to a working v0 — not because the product is
scoped to Claude Code users. It should be built so that a *future* pivot —
turning the engine into a hosted service via the Claude Agent SDK, usable by
people who don't have Claude Code at all — is a matter of swapping the
runtime adapter, not rewriting the core logic. Concretely, this means:
- Prioritization rules, the definition of a "quick win," sanity-check
  criteria, and re-evaluation logic live in plain files (markdown/config),
  not hardcoded inside Workflow scripts — so they're readable/portable
  regardless of what eventually executes them.
- The nightly orchestration (currently `Workflow` + `CronCreate`) is treated
  as a swappable adapter, not the source of truth.
- The CLI/product surface stays decoupled from *how* a feature gets
  implemented, so it isn't Claude-Code-specific by construction.

None of this means building a generic multi-tenant service now — that would
be premature. It means not making choices today that would make that pivot
expensive later.

## What "delightful" means here

Every feature the loop ships should make the *next morning's check-in*
better for whoever is running it: clearer roadmap, more useful status
output, less noise, more confidence that what shipped is real and tested.
Delight is measured by how good that check-in feels, not by feature count.

## Operating principles for the loop

1. **Quick wins first.** Prioritize by value-per-effort, not raw value —
   grab the cheap, high-value features before attempting hard ones.
2. **Never ship untested.** A feature isn't "done" until its sanity
   checks/tests pass. If a feature turns out too hard or risky mid-attempt,
   abandon it, log why, and move to the next one rather than blocking the
   night on it.
3. **Always leave a roadmap.** Every run ends with ROADMAP.md refreshed —
   near-term items re-prioritized, and at least one new horizon item added
   so the backlog never visibly runs out.
4. **Re-evaluate continuously.** After each feature (and again at the end of
   a run), the loop reviews its own recent work: was the priority call
   right, did tests actually cover the risk, should anything be revisited?
5. **Draw ideas from multiple sources**: the existing code/docs, web research
   on comparable tools, this vision doc, and — once there's real usage —
   actual feedback signals.
6. **Survive compaction.** None of the above should live only in
   conversation context. Vision, roadmap, changelog, and operating
   principles are all files in this repo specifically so a compacted or
   fresh context can pick the loop back up without losing the thread.

---
*Draft — edit freely. This is the anchor the nightly loop prioritizes
against, so the more honest/specific it is, the better the loop's judgment
will be.*

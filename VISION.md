# Feature Inventor — Vision

## What this is

Feature Inventor is a governed autonomous improvement harness for one
repository at a time. It turns an operator-owned target, goals, and backlog
into a bounded run that researches, prioritizes, implements, verifies, and
produces an evidence-backed review candidate.

Feature Inventor itself is the reference target used to dogfood the harness.
Its self-improving loop is valuable evidence, but it is not permission for
unbounded autonomous work. Every normal run must be explicitly bounded by a
target commit, feature cap, timeout, validation policy, and remote-effect
policy. See `ARCHITECTURE.md` for the product contract and migration plan.

v0 remains deliberately small: one target repository, a CLI, durable evidence,
and human review before any default-branch or production effect. A dashboard,
fleet management, and multi-tenant hosting are deferred until the
single-repository operating model is proven.

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

The current runtime includes native Claude Code automation and a bounded
Manus task adapter. Neither runtime is the source of product behavior. The
product should be built so that future runtimes are a matter of swapping an
adapter, not rewriting core lifecycle, policy, evidence, and review logic.
Concretely, this means:
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
4. **Re-evaluate with evidence.** After each feature and at the end of a
   run, record the priority call, validation evidence, verification result,
   and human-review recommendation. Agent self-assessment is a signal, not
   proof of value or correctness.
5. **Bound repeated execution explicitly.** One governed run is the default.
   Any schedule requires a cadence, feature cap, timeout, pause control, and
   durable recovery evidence.
6. **Draw ideas from multiple sources**: the existing code/docs, web research
   on comparable tools, this vision doc, and — once there's real usage —
   actual feedback signals.
7. **Survive compaction.** None of the above should live only in
   conversation context. Vision, roadmap, changelog, and operating
   principles are all files in this repo specifically so a compacted or
   fresh context can pick the loop back up without losing the thread.

---
*Draft — edit freely. This is the anchor the nightly loop prioritizes
against, so the more honest/specific it is, the better the loop's judgment
will be.*

# Research notes — 2026-08-01

External research done while designing v0, kept here so the nightly loop's
own Research phase doesn't have to rediscover the same ground every run
(see VISION.md: "Draw ideas from multiple sources"). Update/append rather
than rewrite as future runs find more.

## 1. This pattern already has a name: "Ralph"

The Ralph Wiggum pattern (popularized by Geoffrey Huntley, mid-2025) is
exactly this shape: run an agent in a loop, check whether a concrete
completion criterion was met (tests pass / a completion tag appears), and
if not, re-feed the prompt with updated context and go again. It's
explicitly not a product, just a pattern — teams have used it for overnight
refactors and to triage huge backlogs; one team reported waking up to
1,000+ commits across six ported codebases from a single overnight run.
The stated sweet spot is "batch tasks, broad backlogs, and refactoring jobs
where 'done' can be encoded as tests or tags" — which is precisely why
VISION.md's operating principle #2 ("never ship untested") is load-bearing,
not a nice-to-have: without an objective pass/fail gate, a Ralph-style loop
has no way to know it should stop or move on.

**Implication:** we're not inventing a new category, we're applying a known
pattern with a specific product wrapped around it (roadmap, changelog,
CLI). Worth being explicit about in VISION.md so the loop doesn't reinvent
concepts (like "completion criteria") that already have established
vocabulary.

## 2. "Harness" vs. "dark factory" — the risk axis that actually matters

Industry framing draws a sharp line: an **agent harness** has human review
before anything reaches production; a **dark factory** ships autonomously
with no human in the path to production at all. The documented risks of
going full dark-factory are specific and real:
- **Evaluator overconfidence** — the agent's own test/judgment pass is the
  only gate, and if that gate has a blind spot, bad code ships confidently,
  repeatedly, because nothing "feels off" the way it would to a human
  reviewer.
- **Cascading failures** — an autonomous fix-on-fix loop can chain bad
  deployments before anything trips a circuit breaker.
- **Irreversible actions** — an agent that can merge can also merge
  something destructive, faster and more quietly than a human would.

The recommended mitigation isn't "add more review forever," it's
**progressive autonomy**: start with review everywhere, and only remove it
selectively for task categories that have demonstrated reliability.

**Implication for feature-inventor:** our current design (commit to a
`nightly` branch, never touch `main`/`master`, no push to any remote) is
already a harness, not a dark factory — a human merge is still required to
reach anything that matters. That's worth stating explicitly in VISION.md
rather than leaving implicit. It also reframes the "auto-commit" output
mode decision: "auto-commit to a branch" is the *safe* end of the spectrum,
not the risky one — the risky move would be auto-merging to main, which
nothing in this design does or should do without a separate, explicit
decision later.

The evaluator-overconfidence risk is the sharper one for us specifically,
since right now a single agent both implements a feature *and* judges
whether its own tests justify calling it "shipped." That's a real gap —
logged as a roadmap item below.

## 3. Prioritization: ICE over ad-hoc S/M/L, RICE reserved for less frequent calls

RICE (Reach, Impact, Confidence, Effort) and ICE (Impact, Confidence, Ease)
are the two standard lightweight scoring frameworks. The common
hybrid-team pattern found in multiple sources: **RICE for slower, higher-
level roadmap planning**, **ICE for fast, tactical prioritization** — which
maps almost exactly onto our Now/Next/Later/Horizon structure (RICE-style
thinking at the Later/Horizon end, ICE-style speed at the Now end).

Two things stand out about ICE specifically:
- It already has a **Confidence** dimension — which our current S/M/L
  effort/value schema doesn't capture at all.
- Confidence is exactly the axis research on agent self-evaluation flags as
  failure-prone (next section) — so making it an explicit, tracked field
  is not just a prioritization nicety, it's a calibration mechanism.

**Implication:** replace the ad-hoc effort/value S/M/L scale in
`workflows/nightly.js`'s schemas with real ICE scoring (Impact/Confidence/
Ease, e.g. 1-10 each), and once the product's audience genuinely broadens
(per VISION.md's "developers and product designers" framing), consider
adding Reach for Later/Horizon-tier decisions where "how many people does
this actually help" starts to matter. Not urgent for v0, but a concrete,
well-understood change — good candidate for the loop's own first few runs
rather than something to hand-build now.

## 4. Agent self-confidence is measurably informative *but* miscalibration is common

Research on agentic confidence calibration found genuine signal — in one
study, predicted accuracy rose monotonically from 65.5% at 0.40 stated
confidence to 92.2% at 0.85+ — but also documented real failure modes:
self-reported confidence can be "nearly uninformative" in some contexts,
and some agents show *worse* accuracy in their highest-confidence bucket
than their medium-confidence one. Confidence also tends to drift upward
over a session simply from accumulated context, independent of actual
correctness. The stronger mitigations in the literature are structural, not
just "ask the model to be honest": reward shaping that penalizes
unwarranted certainty, and using confidence to trigger retry/replan
behavior rather than trusting it directly as a stop signal.

**Implication:** don't let a single agent's self-reported "shipped, tests
pass, I'm confident" be the sole gate — which is the same conclusion as
section 2's evaluator-overconfidence point, from an independent angle. Two
concrete, cheap mitigations that fit this project without overbuilding:
1. Track ICE confidence estimates against actual outcomes in `CHANGELOG.md`
   or a calibration log, so miscalibration becomes visible over runs
   instead of invisible.
2. Add a second, independent verification pass for "shipped" claims —
   doesn't need to be elaborate, even a fresh agent re-running the test
   suite and skimming the diff before it's trusted is most of the value.

## 5. CLI UX

Findings were mostly confirmatory rather than new: keep `status` doing one
obvious thing well (the `git status` comparison came up directly — tell the
user exactly what they need to know, nothing more); use the CLI itself for
onboarding rather than pushing people to docs; document and use non-zero
exit codes on failure; use progress indicators (spinner / X-of-Y / progress
bar) once there's a longer-running operation to show progress for, which
there isn't yet in v0's `status` command but will be once a run is
observable live.

**Implication:** no v0 redesign needed, but flags a real gap worth a
roadmap entry — `cli.ts` currently lets `readFileSync` throw an unhandled
exception with a raw stack trace if `ROADMAP.md`/`CHANGELOG.md` are
missing, instead of a clean error + non-zero exit.

---

## New roadmap items this research produced

Two of these were applied by hand shortly after this research pass (see
`ROADMAP.md`'s `[x]` items and their "done, hand-built" notes) rather than
left for the loop's first run — the rest are still queued:
- ~~Switch effort/value scoring to ICE (Impact/Confidence/Ease) in the
  Research/Prioritize schemas, replacing ad-hoc S/M/L.~~ Done —
  `workflows/nightly.js` now computes ICE scores deterministically in code.
- ~~Independent verification pass before trusting a "shipped" claim
  (mitigates evaluator overconfidence).~~ Done — a second agent re-runs
  tests and inspects the diff before anything counts as shipped, reverting
  via `git revert` if it doesn't hold up.
- Calibration log: predicted ICE scores vs. actual outcome, reviewed each
  Finalize phase. Still queued — needs at least one real run to be
  meaningful.
- Clean error + non-zero exit in `cli.ts` when ROADMAP.md/CHANGELOG.md are
  missing/malformed, instead of an unhandled stack trace. Still queued.

## Sources

- [Ralph Wiggum AI Coding Loops: How Agentic Workflows Automate Software Development](https://www.ishir.com/blog/312751/ralph-wiggum-and-ai-coding-loops-from-springfield-to-real-world-software-automation.htm)
- [Ralph Wiggum AI Agents: The Coding Loop of 2026](https://www.leanware.co/insights/ralph-wiggum-ai-coding)
- [11 Tips For AI Coding With Ralph Wiggum](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)
- [GitHub - snarktank/ralph](https://github.com/snarktank/ralph)
- [Long running AI Coding Agents with the Ralph Loop](https://pageai.pro/blog/long-running-ai-coding-agents-ralph-loop)
- [What Is a Dark Factory? The AI Coding Pattern That Ships Code Autonomously](https://www.mindstudio.ai/blog/what-is-a-dark-factory-ai-coding-2)
- [The Dark Factory Pattern: Moving From AI-Assisted to Fully Autonomous Coding](https://hackernoon.com/the-dark-factory-pattern-moving-from-ai-assisted-to-fully-autonomous-coding)
- [RICE Prioritization: Framework, Formula & Template](https://kayako.com/blog/rice-prioritization/)
- [RICE vs ICE: Which Prioritization Framework Should You Use?](https://www.productlift.dev/blog/rice-vs-ice/)
- [ICE, RICE & Kano: Prioritization Frameworks Compared](https://www.growthmentor.com/blog/prioritization-frameworks)
- [Agentic Confidence Calibration](https://www.emergentmind.com/topics/agentic-confidence-calibration)
- [Self-Evaluation in AI Agents With Chain of Thought](https://galileo.ai/blog/self-evaluation-ai-agents-performance-reasoning-reflection)
- [Recursive Self-Improvement in Agentic AI](https://datasciencedojo.com/blog/recursive-self-improvement-agentic-ai/)
- [CLI UX best practices: 3 patterns for improving progress displays](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays)
- [UX patterns for CLI tools](https://www.lucasfcosta.com/blog/ux-patterns-cli-tools)
- [How to Design a CLI Tool That Developers Actually Love Using](https://hackernoon.com/how-to-design-a-cli-tool-that-developers-actually-love-using)

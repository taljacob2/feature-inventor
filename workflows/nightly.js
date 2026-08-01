export const meta = {
  name: 'feature-inventor-nightly',
  description: 'Nightly loop: research ideas, prioritize quick wins first (ICE-scored), implement + independently verify one at a time, update roadmap/changelog, re-evaluate.',
  whenToUse: 'Run manually (or later via CronCreate) to advance feature-inventor by one nightly cycle. Not yet wired to a schedule — dry-run and review output before automating.',
  phases: [
    { title: 'Research' },
    { title: 'Prioritize' },
    { title: 'Implement' },
    { title: 'Finalize' },
  ],
}

// This loop is intentionally sequential in the Implement phase, not fanned
// out with pipeline()/parallel(): the brief this system follows requires
// each feature to be tested (and independently verified) before moving to
// the next, and multiple agents mutating + committing to the same working
// tree concurrently would race. See VISION.md operating principle #2.

const REPO_ROOT = 'I:/Tal/Code/other/feature-inventor'
const BRANCH_NAME = 'nightly'
const MAX_FEATURES_PER_RUN = (args && args.maxFeatures) || 3
const MAX_ATTEMPTS = MAX_FEATURES_PER_RUN * 3 // allow skipping abandoned candidates without capping throughput

// ICE (Impact/Confidence/Ease), each 1-10, replaces ad-hoc S/M/L per
// RESEARCH.md §3. Ranking is computed here in plain code rather than left
// to agent judgment — arithmetic should be deterministic, not guessed at.
// Confidence is tracked (not just Impact/Ease) because RESEARCH.md §4 found
// agent self-reported confidence carries real signal but is prone to
// miscalibration — a value worth recording even before we build the
// calibration-log roadmap item that actually checks it against outcomes.
function computeIceScore(feature) {
  return (feature.impact + feature.confidence + feature.ease) / 3
}

const ICE_FIELDS_SCHEMA = {
  impact: { type: 'integer', minimum: 1, maximum: 10, description: 'ICE Impact: how much this improves the next morning check-in (VISION.md definition of delightful)' },
  confidence: { type: 'integer', minimum: 1, maximum: 10, description: 'ICE Confidence: how sure you are the effort/impact estimate is right' },
  ease: { type: 'integer', minimum: 1, maximum: 10, description: 'ICE Ease: 10 = trivial, 1 = very hard — inverse of effort' },
}

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    candidateFeatures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          ...ICE_FIELDS_SCHEMA,
          source: { type: 'string', description: 'why this idea exists: existing ROADMAP.md item, codebase gap, web research, or VISION.md' },
        },
        required: ['title', 'description', 'impact', 'confidence', 'ease', 'source'],
      },
    },
  },
  required: ['candidateFeatures'],
}

const PRIORITIZE_SCHEMA = {
  type: 'object',
  properties: {
    keptFeatures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          ...ICE_FIELDS_SCHEMA,
          rationale: { type: 'string', description: 'why this was kept as-is, merged, or scope-adjusted' },
        },
        required: ['title', 'description', 'impact', 'confidence', 'ease', 'rationale'],
      },
    },
  },
  required: ['keptFeatures'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['shipped', 'abandoned'] },
    summary: { type: 'string' },
    reason: { type: 'string', description: 'required when abandoned: why it was too hard/risky/out of scope' },
    commitSha: { type: 'string', description: 'required when shipped' },
    testsRun: { type: 'string', description: 'what sanity checks/tests were run and their result' },
  },
  required: ['status', 'summary'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verified: { type: 'boolean' },
    testsRerun: { type: 'string', description: 'what you independently re-ran and its actual result' },
    concerns: { type: 'string', description: 'issues found, even minor ones — report even if verified=true' },
    reverted: { type: 'boolean', description: 'true if you ran git revert because verification failed' },
  },
  required: ['verified', 'testsRerun', 'reverted'],
}

const REEVALUATE_SCHEMA = {
  type: 'object',
  properties: {
    reflections: { type: 'string' },
    priorityCallsWereRight: { type: 'boolean' },
    roadmapCommitSha: { type: 'string' },
  },
  required: ['reflections', 'priorityCallsWereRight', 'roadmapCommitSha'],
}

phase('Research')
const research = await agent(
  `You are running the nightly research step for the feature-inventor project at ${REPO_ROOT}.
Read VISION.md, ROADMAP.md, CHANGELOG.md, and RESEARCH.md in that directory to understand the
product's purpose, operating principles, existing backlog, prior external research, and what has
already shipped.

Produce a list of candidate features by combining:
1. Unclaimed items already in ROADMAP.md's "Now" and "Next" sections.
2. New ideas grounded in gaps you notice reading the actual code in ${REPO_ROOT} (src/, workflows/).
3. A short round of web research (use WebSearch) into what comparable developer tools / CLIs do
   well for onboarding, status visibility, or automation UX — look for genuinely transferable ideas,
   not generic filler.
4. VISION.md's definition of "delightful" (a better next-morning check-in).

Do not propose anything that contradicts VISION.md's operating principles (e.g. do not propose
building generic multi-repo support — that is explicitly deferred), and do not re-propose anything
already logged as a finding in RESEARCH.md.

For each candidate, score it with ICE: Impact (1-10, how much it improves the next check-in),
Confidence (1-10, how sure you are of that estimate), Ease (1-10, 10 = trivial). Be honest about
Confidence specifically — RESEARCH.md §4 found agent self-reported confidence is real signal but
prone to drifting up without cause, so don't default to a high number.`,
  { schema: RESEARCH_SCHEMA, phase: 'Research' }
)

if (!research || research.candidateFeatures.length === 0) {
  log('Research produced no candidate features — nothing to do this run.')
  return { shipped: [], abandoned: [], candidateFeatures: [] }
}
log(`Research produced ${research.candidateFeatures.length} candidate feature(s).`)

phase('Prioritize')
const prioritized = await agent(
  `Given these candidate features for feature-inventor (${REPO_ROOT}), each already ICE-scored:
${JSON.stringify(research.candidateFeatures, null, 2)}

Your job is NOT to re-rank them — ranking is computed deterministically from the ICE scores after
this step. Instead:
1. Merge or drop near-duplicates.
2. Drop anything out of scope per VISION.md (e.g. generic multi-repo support).
3. If a description reveals the ICE score is clearly wrong once you think it through (e.g. "trivial"
   Ease on something that's actually architecturally risky), correct the score and explain why in
   "rationale" — don't silently keep a bad estimate.
Return the kept set with the same fields, ICE scores included (corrected where needed), plus a
rationale for each explaining what you kept/merged/adjusted and why.`,
  { schema: PRIORITIZE_SCHEMA, phase: 'Prioritize' }
)

if (!prioritized || prioritized.keptFeatures.length === 0) {
  log('Prioritization kept nothing — nothing to implement this run.')
  return { shipped: [], abandoned: [], candidateFeatures: research.candidateFeatures }
}

const orderedFeatures = [...prioritized.keptFeatures].sort(
  (a, b) => computeIceScore(b) - computeIceScore(a)
)

phase('Implement')
const shipped = []
const abandoned = []
const queue = orderedFeatures.slice(0, MAX_ATTEMPTS)
if (orderedFeatures.length > MAX_ATTEMPTS) {
  log(`${orderedFeatures.length - MAX_ATTEMPTS} lower-priority candidate(s) not attempted this run — carried forward via the roadmap update.`)
}

for (const feature of queue) {
  if (shipped.length >= MAX_FEATURES_PER_RUN) {
    log(`Reached ${MAX_FEATURES_PER_RUN} shipped features for this run — stopping.`)
    break
  }

  const iceScore = computeIceScore(feature)

  const result = await agent(
    `Implement exactly one feature in the feature-inventor repo at ${REPO_ROOT}, on git branch
"${BRANCH_NAME}" (create it from the current default branch if it doesn't exist yet, checkout to it).

Feature: ${feature.title}
Description: ${feature.description}
ICE score: Impact ${feature.impact}/10, Confidence ${feature.confidence}/10, Ease ${feature.ease}/10 (composite ${iceScore.toFixed(1)})
Why it's prioritized: ${feature.rationale}

Rules (see VISION.md operating principles):
- If, once you're actually in the code, this turns out to be significantly harder or riskier than
  its Ease score suggested, STOP, revert any partial changes (git checkout -- . / git clean if
  needed), and report status "abandoned" with a concrete reason. Do not force a bad implementation
  through. Moving to the next candidate is success, not failure.
- If you implement it: write or update tests, then actually run the project's test suite
  (npm test) and build (npm run build) in ${REPO_ROOT}. A feature is only "shipped" if both pass.
- If shipped: append one entry to CHANGELOG.md following its documented format (commit sha can
  reference "this commit" since the sha isn't knowable before committing), and commit everything
  (code + tests + changelog entry) in a single git commit on "${BRANCH_NAME}" with a clear message.
  Report the resulting commit sha — it will be independently re-verified by another agent, so it
  must be accurate.
- Do not modify ROADMAP.md yourself — a later step reconciles the whole roadmap at once from every
  feature attempted this run.
- Do not push to any remote.`,
    { schema: IMPLEMENT_SCHEMA, phase: 'Implement', label: `implement:${feature.title}` }
  )

  if (!result) {
    log(`No result for "${feature.title}" (agent error) — treating as abandoned.`)
    abandoned.push({ feature, reason: 'agent error / no result' })
    continue
  }

  if (result.status !== 'shipped') {
    log(`Abandoned: ${feature.title} — ${result.reason || 'no reason given'}`)
    abandoned.push({ feature, reason: result.reason })
    continue
  }

  // Independent verification: the implementer judging its own tests is a
  // textbook evaluator-overconfidence setup (RESEARCH.md §2, §4). A fresh
  // agent re-runs the checks itself rather than trusting the self-report,
  // and reverts (not resets — this commit is the branch tip, but a revert
  // preserves the audit trail per VISION.md) if it doesn't hold up.
  const verification = await agent(
    `Independently verify a feature just claimed "shipped" in the feature-inventor repo
(${REPO_ROOT}), branch "${BRANCH_NAME}". You did not implement this — treat the claim with
suspicion; do not just trust the summary or the reported test results.

Feature: ${feature.title}
Claimed commit sha: ${result.commitSha}
Implementer's summary: ${result.summary}
Implementer's reported tests: ${result.testsRun || '(none reported)'}

1. Run \`git show --stat ${result.commitSha}\` and actually read the diff.
2. Independently re-run \`npm test\` and \`npm run build\` yourself in ${REPO_ROOT} — do not reuse
   the implementer's report.
3. Judge whether the diff genuinely does what it claims, and whether the tests meaningfully cover
   the change (not just that some unrelated test somewhere passes).
4. If you find a real problem (tests fail, tests don't cover the actual change, the diff does
   something different from or riskier than described): run
   \`git revert --no-edit ${result.commitSha}\` on "${BRANCH_NAME}", report verified=false with
   concerns explaining why, and reported=true for "reverted".
5. If it genuinely holds up, report verified=true. Still report any concerns you noticed, even
   minor ones — a later re-evaluation step reads these.
Do not push to any remote.`,
    { schema: VERIFY_SCHEMA, phase: 'Implement', label: `verify:${feature.title}` }
  )

  if (verification && verification.verified) {
    log(`Shipped (verified): ${feature.title} (${result.commitSha})${verification.concerns ? ` — noted: ${verification.concerns}` : ''}`)
    shipped.push({ feature, result, verification })
  } else {
    const reason = verification
      ? `failed independent verification: ${verification.concerns || 'no concerns given'}`
      : 'verification agent error — treating as unverified, not trusting the shipped claim'
    log(`Reverted after failed verification: ${feature.title} — ${reason}`)
    abandoned.push({ feature, reason })
  }
}

phase('Finalize')
const reevaluation = await agent(
  `You are the end-of-run re-evaluation step for feature-inventor (${REPO_ROOT}), on branch
"${BRANCH_NAME}".

Shipped this run: ${JSON.stringify(shipped.map(s => ({ title: s.feature.title, summary: s.result.summary, commitSha: s.result.commitSha, iceScore: computeIceScore(s.feature), verificationConcerns: s.verification?.concerns })), null, 2)}
Abandoned this run: ${JSON.stringify(abandoned.map(a => ({ title: a.feature.title, reason: a.reason })), null, 2)}
Candidates not attempted: ${JSON.stringify(orderedFeatures.slice(queue.length).map(f => f.title))}

Do the following, in order:
1. Reflect honestly: were the priority calls this run actually right in hindsight? Did any
   "abandoned" or failed-verification reason suggest an ICE estimate (especially Confidence or
   Ease) was systematically wrong in a way that should change how future runs estimate similar
   work?
2. Rewrite ROADMAP.md: move shipped items out, keep or re-prioritize abandoned/not-attempted items,
   and — per VISION.md operating principle #3 — ensure the Horizon section still has at least one
   speculative item so the backlog never visibly empties. Keep the existing file's format and
   sections (Now/Next/Later/Horizon), and keep list items on a single physical line each (no manual
   line-wrapping) so tooling that parses this file line-by-line keeps working.
3. Commit the ROADMAP.md update on "${BRANCH_NAME}" as its own commit (do not bundle it with feature
   commits). Report that commit's sha.
Do not push to any remote.`,
  { schema: REEVALUATE_SCHEMA, phase: 'Finalize' }
)

log(`Run complete: ${shipped.length} shipped, ${abandoned.length} abandoned.`)

return { shipped, abandoned, reevaluation }

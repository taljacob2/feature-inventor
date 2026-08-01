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

// Accepted args (all optional):
//   repoRoot     - explicit absolute path override (see resolveRepoRoot below)
//   branchName   - defaults to "nightly"
//   maxFeatures  - defaults to 3

// Resolved at run start rather than hardcoded to one machine's absolute
// path — this script has no direct filesystem access itself (only the
// agents it spawns do, see CONTRIBUTING.md), so even "where am I" has to
// go through an agent() call. args.repoRoot lets a caller (e.g. a future
// CronCreate schedule, or CI) pin an explicit path instead of relying on
// the invoking session's working directory; without it, this auto-detects
// via `git rev-parse --show-toplevel` and verifies package.json actually
// names this repo, so a wrong-directory invocation fails loudly instead of
// running git operations against some unrelated repo.
async function resolveRepoRoot() {
  if (args && args.repoRoot) return args.repoRoot

  const result = await agent(
    `Determine the feature-inventor repository's root directory. Run \`git rev-parse --show-toplevel\`
in the current working directory and report the absolute path it prints (forward slashes, no
trailing slash). Then confirm this is actually the feature-inventor repo, not some other one: read
package.json at that path and check its "name" field equals "feature-inventor". If the current
directory isn't inside a git repo, or that check fails, report success=false with a clear reason in
"reason" — do not guess a path.`,
    {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          repoRoot: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['success'],
      },
      effort: 'low',
      label: 'resolve-repo-root',
    }
  )

  if (!result || !result.success || !result.repoRoot) {
    throw new Error(
      `Could not resolve the feature-inventor repo root (${result && result.reason ? result.reason : 'agent error'}). ` +
      'Pass it explicitly via args.repoRoot if this run is not invoked with the repo as the working directory.'
    )
  }
  return result.repoRoot
}

const REPO_ROOT = await resolveRepoRoot()
const BRANCH_NAME = (args && args.branchName) || 'nightly'
const MAX_FEATURES_PER_RUN = (args && args.maxFeatures) || 3
const MAX_ATTEMPTS = MAX_FEATURES_PER_RUN * 3 // allow skipping abandoned candidates without capping throughput

// Durable, cross-run record of every feature attempt (title, ICE score,
// status, reason, commit sha, verification concerns) — see
// src/feature-log.ts for the shared schema and parsing logic that
// `feature-inventor status`/`feature-inventor recap` read back. This loop
// only ever appends: a single JSON object per line, so a partial write never
// corrupts prior history. Workflow scripts have no direct filesystem access
// (see the Workflow tool's own documented constraints), so the write is
// delegated to a small dedicated agent rather than done in-script — a plain
// `node:fs` call here would throw the first time this workflow genuinely
// executed unattended, which (per ROADMAP.md) it never has yet.
const FEATURE_LOG_PATH = `${REPO_ROOT}/feature-log.jsonl`

async function appendFeatureLogEntry(entry) {
  await agent(
    `Append exactly one JSON Lines record to ${FEATURE_LOG_PATH} (create the file if it doesn't
exist yet; otherwise append to the end — never overwrite or reorder existing lines).
The record is this object, with a "date" field added set to today's date as YYYY-MM-DD (run
\`date +%F\` in Bash if you're unsure of it):
${JSON.stringify(entry)}
Write the given fields exactly as provided; only add "date". This file is gitignored — do not
commit it. Do not run tests or touch anything else. Confirm when done.`,
    { effort: 'low', phase: 'Implement', label: `log:${entry.title}` }
  )
}

// Gitignored local control file (see src/stop-flag.ts) a human can create
// via `feature-inventor stop` to ask an in-progress run to wrap up instead
// of starting another feature. Checked between features, not mid-feature —
// per VISION.md operating principle #2, a feature already being implemented
// still finishes (or is abandoned/verified) cleanly rather than being cut
// off half-done.
const STOP_FLAG_PATH = `${REPO_ROOT}/.feature-inventor-stop`

async function isStopRequested() {
  const result = await agent(
    `Check whether the file "${STOP_FLAG_PATH}" exists (e.g. Bash \`test -f "${STOP_FLAG_PATH}"\`).
Do not create, modify, or delete it.`,
    {
      schema: { type: 'object', properties: { exists: { type: 'boolean' } }, required: ['exists'] },
      effort: 'low',
      phase: 'Implement',
      label: 'check-stop-flag',
    }
  )
  return Boolean(result && result.exists)
}

async function clearStopFlagIfPresent() {
  await agent(
    `If the file "${STOP_FLAG_PATH}" exists, delete it — it's a gitignored local control file, not
committed to git, so deleting it needs no commit. If it doesn't exist, do nothing.`,
    { effort: 'low', phase: 'Finalize', label: 'clear-stop-flag' }
  )
}

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

// Retrospective self-assessment, collected on every attempt regardless of
// outcome — the raw signal the Calibration log and harness-vs-dark-factory
// ROADMAP.md items depend on. RESEARCH.md §4 found self-reported confidence
// carries real signal but drifts upward without cause, so the prompt below
// explicitly tells the agent this isn't graded on sounding confident.
const SELF_ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    creativity: { type: 'string', enum: ['routine', 'creative', 'novel'], description: 'Was the approach a routine reuse of an existing pattern, a creative combination of existing ideas, or genuinely novel?' },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: 'Your own honest read on how hard this actually was, independent of the pre-scored ICE Ease value — it is fine, expected even, for this to disagree with Ease.' },
    confident: { type: 'boolean', description: 'Are you actually confident this does what it claims, as opposed to hoping the tests happened to pass?' },
    wantedHumanGuidance: { type: 'boolean', description: 'In hindsight, would you have wanted a human to weigh in on this feature before or during implementation?' },
    knowledgeGaps: { type: 'string', description: 'Optional: anything you had to guess at or infer because it was missing from the repo/docs — spec gaps, unwritten conventions, assumptions you had no way to verify.' },
    modelFit: { type: 'string', enum: ['overkill', 'right-sized', 'underpowered'], description: 'Honest read on whether a cheaper/faster model likely would have sufficed for this specific feature, this model was about right, or a more capable model was genuinely needed.' },
  },
  required: ['creativity', 'difficulty', 'confident', 'wantedHumanGuidance', 'modelFit'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['shipped', 'abandoned'] },
    summary: { type: 'string' },
    reason: { type: 'string', description: 'required when abandoned: why it was too hard/risky/out of scope' },
    commitSha: { type: 'string', description: 'required when shipped' },
    testsRun: { type: 'string', description: 'what sanity checks/tests were run and their result' },
    selfAssessment: SELF_ASSESSMENT_SCHEMA,
  },
  required: ['status', 'summary', 'selfAssessment'],
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
let stoppedEarly = false
// Distinct from stoppedEarly's boolean: this records *why* the Implement
// loop stopped short of its full queue, so Finalize (and, per ROADMAP.md's
// resume-point item, a future `status`/`recap` view) can tell "ran out of
// candidates" apart from "hit the per-run cap" apart from "human asked to
// stop" — all three currently collapse into the same stoppedEarly=true/false
// signal, which isn't enough to explain what actually happened.
let stopReason = null // 'max-features-reached' | 'explicit-stop' | null (queue exhausted normally)
const queue = orderedFeatures.slice(0, MAX_ATTEMPTS)
if (orderedFeatures.length > MAX_ATTEMPTS) {
  log(`${orderedFeatures.length - MAX_ATTEMPTS} lower-priority candidate(s) not attempted this run — carried forward via the roadmap update.`)
}

// Tracks how far into `queue` the loop actually got, so "candidates not
// attempted" can be computed accurately below. Previously this was derived
// solely from `orderedFeatures.slice(queue.length)`, which only accounts for
// candidates beyond MAX_ATTEMPTS — it silently missed queued candidates
// dropped by an early break (MAX_FEATURES_PER_RUN or an explicit stop
// request), so already-researched-and-ICE-scored work could vanish from the
// reevaluation step's context instead of being carried forward into
// ROADMAP.md. See ROADMAP.md's "Bug: ... under-reports 'candidates not
// attempted'" item.
let attemptedCount = 0

for (const feature of queue) {
  if (shipped.length >= MAX_FEATURES_PER_RUN) {
    log(`Reached ${MAX_FEATURES_PER_RUN} shipped features for this run — stopping.`)
    stopReason = 'max-features-reached'
    break
  }

  if (await isStopRequested()) {
    log('Stop requested (via "feature-inventor stop") — wrapping up gracefully instead of starting another feature.')
    stoppedEarly = true
    stopReason = 'explicit-stop'
    break
  }

  attemptedCount++
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
- Do not push to any remote.
- Whether shipped or abandoned, fill in "selfAssessment" honestly. This is not graded on sounding
  confident — RESEARCH.md §4 found self-reported confidence tends to drift upward without cause,
  and an honest "hard"/"not confident"/"wanted human guidance" is more useful here than an
  optimistic one that doesn't hold up. It feeds a calibration log that compares these claims
  against what independent verification actually finds.`,
    { schema: IMPLEMENT_SCHEMA, phase: 'Implement', label: `implement:${feature.title}` }
  )

  if (!result) {
    log(`No result for "${feature.title}" (agent error) — treating as abandoned.`)
    const reason = 'agent error / no result'
    abandoned.push({ feature, reason })
    await appendFeatureLogEntry({
      title: feature.title,
      ice: { impact: feature.impact, confidence: feature.confidence, ease: feature.ease, composite: iceScore },
      status: 'abandoned',
      reason,
    })
    continue
  }

  if (result.status !== 'shipped') {
    log(`Abandoned: ${feature.title} — ${result.reason || 'no reason given'}`)
    abandoned.push({ feature, reason: result.reason })
    await appendFeatureLogEntry({
      title: feature.title,
      ice: { impact: feature.impact, confidence: feature.confidence, ease: feature.ease, composite: iceScore },
      status: 'abandoned',
      reason: result.reason || 'no reason given',
      selfAssessment: result.selfAssessment,
    })
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
    await appendFeatureLogEntry({
      title: feature.title,
      ice: { impact: feature.impact, confidence: feature.confidence, ease: feature.ease, composite: iceScore },
      status: 'shipped',
      commitSha: result.commitSha,
      verificationConcerns: verification.concerns,
      selfAssessment: result.selfAssessment,
    })
  } else {
    const reason = verification
      ? `failed independent verification: ${verification.concerns || 'no concerns given'}`
      : 'verification agent error — treating as unverified, not trusting the shipped claim'
    log(`Reverted after failed verification: ${feature.title} — ${reason}`)
    abandoned.push({ feature, reason })
    // "reverted" (not "abandoned") when a verification agent actually ran and
    // rejected a shipped claim, since that commit did land before being
    // reverted — distinct from a candidate abandoned pre-commit. Keeping the
    // implementer's selfAssessment here specifically (rather than dropping
    // it) is what makes the hallucination-rate calibration metric possible:
    // a "confident: true" self-report that got reverted anyway is exactly
    // the signal that metric exists to surface.
    await appendFeatureLogEntry({
      title: feature.title,
      ice: { impact: feature.impact, confidence: feature.confidence, ease: feature.ease, composite: iceScore },
      status: verification ? 'reverted' : 'abandoned',
      reason,
      commitSha: result.commitSha,
      verificationConcerns: verification ? verification.concerns : undefined,
      selfAssessment: result.selfAssessment,
    })
  }
}

// Accurate regardless of *why* the loop stopped short: candidates still
// sitting in the queue past attemptedCount (dropped by an early break) plus
// anything beyond MAX_ATTEMPTS entirely. Each keeps its already-computed ICE
// fields so Finalize can carry them into ROADMAP.md without re-deriving them.
const notAttempted = [...queue.slice(attemptedCount), ...orderedFeatures.slice(queue.length)]

phase('Finalize')
const reevaluation = await agent(
  `You are the end-of-run re-evaluation step for feature-inventor (${REPO_ROOT}), on branch
"${BRANCH_NAME}".

Shipped this run: ${JSON.stringify(shipped.map(s => ({ title: s.feature.title, summary: s.result.summary, commitSha: s.result.commitSha, iceScore: computeIceScore(s.feature), verificationConcerns: s.verification?.concerns })), null, 2)}
Abandoned this run: ${JSON.stringify(abandoned.map(a => ({ title: a.feature.title, reason: a.reason })), null, 2)}
Candidates not attempted this run (each already ICE-scored — reflect these back into ROADMAP.md's
Now/Next sections with their existing scores rather than dropping or re-deriving them): ${JSON.stringify(notAttempted.map(f => ({ title: f.title, impact: f.impact, confidence: f.confidence, ease: f.ease })), null, 2)}
Why the run stopped short of the full queue (if it did): ${stopReason || 'it did not — every queued candidate was attempted'}

Do the following, in order:
1. Reflect honestly: were the priority calls this run actually right in hindsight? Did any
   "abandoned" or failed-verification reason suggest an ICE estimate (especially Confidence or
   Ease) was systematically wrong in a way that should change how future runs estimate similar
   work? If feature-log.jsonl exists, read it (or run \`node dist/cli.js status --json\` if
   \`dist/\` is built, which includes a "calibration" section computed from the full history) and
   check whether tonight's outcomes continue or break any pattern already visible there — e.g. a
   consistently high hallucination rate (self-reported "confident" features that got reverted
   anyway) is a sign Confidence estimates need to be read more skeptically, not just tonight's.
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

await clearStopFlagIfPresent()

log(`Run complete: ${shipped.length} shipped, ${abandoned.length} abandoned, ${notAttempted.length} not attempted.${stopReason ? ` (stopped: ${stopReason})` : ''}`)

return { shipped, abandoned, reevaluation, stoppedEarly, stopReason, notAttempted: notAttempted.map(f => f.title) }

export const meta = {
  name: 'feature-inventor-nightly',
  description: 'Nightly loop: research ideas, prioritize quick wins first, implement + test one at a time, update roadmap/changelog, re-evaluate.',
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
// each feature to be tested before moving to the next, and multiple agents
// mutating + committing to the same working tree concurrently would race.
// See VISION.md operating principle #2.

const REPO_ROOT = 'I:/Tal/Code/other/feature-inventor'
const BRANCH_NAME = 'nightly'
const MAX_FEATURES_PER_RUN = (args && args.maxFeatures) || 3
const MAX_ATTEMPTS = MAX_FEATURES_PER_RUN * 3 // allow skipping abandoned candidates without capping throughput

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
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          value: { type: 'string', enum: ['S', 'M', 'L'] },
          source: { type: 'string', description: 'why this idea exists: existing ROADMAP.md item, codebase gap, web research, or VISION.md' },
        },
        required: ['title', 'description', 'effort', 'value', 'source'],
      },
    },
  },
  required: ['candidateFeatures'],
}

const PRIORITIZE_SCHEMA = {
  type: 'object',
  properties: {
    orderedFeatures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          value: { type: 'string', enum: ['S', 'M', 'L'] },
          rationale: { type: 'string' },
        },
        required: ['title', 'description', 'effort', 'value', 'rationale'],
      },
    },
  },
  required: ['orderedFeatures'],
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
Read VISION.md, ROADMAP.md, and CHANGELOG.md in that directory to understand the product's
purpose, operating principles, existing backlog, and what has already shipped.

Produce a list of candidate features by combining:
1. Unclaimed items already in ROADMAP.md's "Now" and "Next" sections.
2. New ideas grounded in gaps you notice reading the actual code in ${REPO_ROOT} (src/, workflows/).
3. A short round of web research (use WebSearch) into what comparable developer tools / CLIs do
   well for onboarding, status visibility, or automation UX — look for genuinely transferable ideas,
   not generic filler.
4. VISION.md's definition of "delightful" (a better next-morning check-in).

Do not propose anything that contradicts VISION.md's operating principles (e.g. do not propose
building generic multi-repo support — that is explicitly deferred).
For each candidate, give an effort and value estimate (S/M/L) and cite its source.`,
  { schema: RESEARCH_SCHEMA, phase: 'Research' }
)

if (!research || research.candidateFeatures.length === 0) {
  log('Research produced no candidate features — nothing to do this run.')
  return { shipped: [], abandoned: [], candidateFeatures: [] }
}
log(`Research produced ${research.candidateFeatures.length} candidate feature(s).`)

phase('Prioritize')
const prioritized = await agent(
  `Given these candidate features for feature-inventor (${REPO_ROOT}):
${JSON.stringify(research.candidateFeatures, null, 2)}

Order them for tonight's run to maximize value delivered per unit of effort — cheapest, highest-value
items first ("quick wins"), per VISION.md operating principle #1. Drop near-duplicates. Do not drop
anything silently: if you exclude a candidate as out of scope or redundant, just omit it from the
output (the caller does not need a report of exclusions here, but do not fabricate items either).`,
  { schema: PRIORITIZE_SCHEMA, phase: 'Prioritize' }
)

if (!prioritized || prioritized.orderedFeatures.length === 0) {
  log('Prioritization produced an empty ordering — nothing to implement this run.')
  return { shipped: [], abandoned: [], candidateFeatures: research.candidateFeatures }
}

phase('Implement')
const shipped = []
const abandoned = []
const queue = prioritized.orderedFeatures.slice(0, MAX_ATTEMPTS)
if (prioritized.orderedFeatures.length > MAX_ATTEMPTS) {
  log(`${prioritized.orderedFeatures.length - MAX_ATTEMPTS} lower-priority candidate(s) not attempted this run — carried forward via the roadmap update.`)
}

for (const feature of queue) {
  if (shipped.length >= MAX_FEATURES_PER_RUN) {
    log(`Reached ${MAX_FEATURES_PER_RUN} shipped features for this run — stopping.`)
    break
  }

  const result = await agent(
    `Implement exactly one feature in the feature-inventor repo at ${REPO_ROOT}, on git branch
"${BRANCH_NAME}" (create it from the current default branch if it doesn't exist yet, checkout to it).

Feature: ${feature.title}
Description: ${feature.description}
Effort/value estimate: ${feature.effort}/${feature.value}
Why it's prioritized: ${feature.rationale}

Rules (see VISION.md operating principles):
- If, once you're actually in the code, this turns out to be significantly harder or riskier than
  its S/M/L estimate suggested, STOP, revert any partial changes (git checkout -- . / git clean if
  needed), and report status "abandoned" with a concrete reason. Do not force a bad implementation
  through. Moving to the next candidate is success, not failure.
- If you implement it: write or update tests, then actually run the project's test suite
  (npm test) and build (npm run build) in ${REPO_ROOT}. A feature is only "shipped" if both pass.
- If shipped: append one entry to CHANGELOG.md following its documented format (commit sha can
  reference "this commit" since the sha isn't knowable before committing), and commit everything
  (code + tests + changelog entry) in a single git commit on "${BRANCH_NAME}" with a clear message.
  Report the resulting commit sha.
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

  if (result.status === 'shipped') {
    log(`Shipped: ${feature.title} (${result.commitSha || 'no sha reported'})`)
    shipped.push({ feature, result })
  } else {
    log(`Abandoned: ${feature.title} — ${result.reason || 'no reason given'}`)
    abandoned.push({ feature, reason: result.reason })
  }
}

phase('Finalize')
const reevaluation = await agent(
  `You are the end-of-run re-evaluation step for feature-inventor (${REPO_ROOT}), on branch
"${BRANCH_NAME}".

Shipped this run: ${JSON.stringify(shipped.map(s => ({ title: s.feature.title, summary: s.result.summary, commitSha: s.result.commitSha })), null, 2)}
Abandoned this run: ${JSON.stringify(abandoned.map(a => ({ title: a.feature.title, reason: a.reason })), null, 2)}
Candidates not attempted: ${JSON.stringify(prioritized.orderedFeatures.slice(queue.length).map(f => f.title))}

Do the following, in order:
1. Reflect honestly: were the priority calls this run actually right in hindsight? Did any
   "abandoned" reason suggest the effort/value estimate was systematically wrong in a way that
   should change how future runs estimate similar work?
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

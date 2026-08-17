# Feature Inventor Architecture and Operating Contract

## Product boundary

Feature Inventor is a **governed autonomous improvement harness for one repository at a time**. It helps a maintainer create a bounded, evidence-backed review candidate. It does not autonomously merge to a default branch, deploy production changes, or manage a fleet of repositories.

Feature Inventor itself is the reference target used to exercise and improve the harness. Its self-improving behavior is a form of dogfooding, not a requirement that every target repository continuously invent work forever.

## Non-negotiable safety rules

| Rule | Meaning |
|---|---|
| Human review is mandatory | Automation never merges, releases, deploys, or writes to a default branch. |
| A run is bounded | Every run has a target commit, feature cap, timeout, validation policy, and remote-effect policy. |
| Isolation is required | The executor works in a runner-created isolated workspace, never the operator's active checkout. |
| Policy is enforced | Agents may exercise judgment inside a run, but deterministic code controls repository scope, workspaces, command policy, and remote effects. |
| Evidence is durable | Each run records the target commit, policy, work performed, validation results, verification result, and final review recommendation. |
| Scheduling is explicit | A single bounded run is the default. Repeated execution requires an explicit schedule and pause control. |

## Target operating model

A target repository supplies a `feature-inventor.target.json` manifest. The manifest records its repository identity, operator-owned goals, required checks, protected paths, review policy, scheduling preference, and optional local indexing policy.

```text
init -> doctor -> plan -> propose -> run -> watch -> review
```

`init` establishes the manifest through a guided interactive flow or a fully explicit `--non-interactive` command. It detects optional Git defaults but does not guess policy-defining values, overwrites no existing manifest without `--force`, and never starts a runtime. `overview` is the official orientation command and summarizes the local queue, governed runs, and one next safe action without starting a runtime. `doctor` validates the environment and policy. `docs validate` verifies the committed repository map and source-linked feature registry. `index status` reports generated-snapshot freshness without building or modifying artifacts. `plan` remains a read-only queue preview. `propose` currently resolves the configured default branch to a commit, saves an immutable proposal, and records the first journal event. `run` will execute one governed proposal through a selected runtime adapter. `watch` will show durable run state and required human decisions. `review` will render an evidence-backed review packet. `status` remains a compatibility alias for its legacy detailed presenter.

## Repository intelligence and bounded context

Feature Inventor keeps a concise committed `INDEX.md`, a source-linked `docs/indexing/features.yml` registry, and a detailed `docs/indexing/INDEXING.md` contract. These curated documents provide stable orientation and product vocabulary. `docs validate` fails visibly when a declared source path, exported symbol, flow, or risk tag drifts.

Generated repository intelligence is deliberately local under `.feature-inventor/index/`. `index build` writes a commit-pinned inventory, TypeScript import/export graph, commit-anchored Git activity, separate structural and historical heatmaps, and a Markdown report. `index context` appends selected context-pack artifacts beneath that exact snapshot. The system distinguishes curated entry-point reachability, resolved direct module centrality, Git churn, direct test imports, governed-run observations, and any opt-in runtime telemetry. None of those signals may be presented as application usage unless it is actual configured runtime telemetry.

`index heatmap` requires one explicit lens and exposes raw values rather than a blended score. `index build` requires a clean checkout so artifacts match their recorded commit. `index context` now selects the smallest direct set of entry points, implementation paths, tests, and direct graph neighbors for exactly one feature, flow, path, or command scope. It requires a fresh snapshot, records source anchors, evidence types, selection reasons, a commit, a policy digest, a hard estimated-token budget, and explicit overflow. It is a retrieval aid only: agents must inspect the linked source before making implementation or verification decisions. An operator can enable `indexing.autoPrepareOnPropose` to rebuild a clean commit-pinned snapshot during an explicit proposal call. It creates a pack only for one exact curated feature match, supports `--no-auto-index`, and never starts a runtime, changes code, or promotes a proposal to execution. `propose --context-pack` may record one matching persisted pack as immutable, content-hashed design provenance. That reference remains informational: it never replaces source or artifact evidence, authorizes execution, or affects review readiness.

When an operator configures `verificationPolicy`, proposal creation validates the curated registry and classifies only explicit approved feature scope: a matching context selector, an exact curated feature ID/name, or a deliberate `feature:` candidate source. Declared protected-path matches and curated risk tags can add only the checks named by the manifest. Manifest `requiredChecks` remain first and authoritative, derived checks are separately recorded, and any manual-review reasons are visible in the proposal and review packet. No fuzzy feature matching, invented command, execution authorization, or automated final approval is permitted.

## Shared execution model

The core product owns a run lifecycle and runtime adapters implement capabilities. Runtime choice must not redefine product behavior.

```text
RunRequest
  -> Planned
  -> WorkspacePrepared
  -> CandidateStarted
  -> Implemented | Abandoned
  -> Verified | Reverted
  -> ReviewPacketCreated
  -> Finalized | Failed
```

The proposal and versioned append-only run journal are implemented under `.feature-inventor/runs/<run-id>/`. `status` and `recap` derive governed-run summaries from the journal. The Manus adapter requires a selected proposal, verifies the local origin and approved default-branch commit, records `task-created` after the external task is accepted, and requests a strict structured runtime result when the task finishes. Passive `watch` and `recover` commands record task progress, waiting states, API errors, and task completion idempotently. `capture` retains both the passive task outcome and an immutable-matching `runtime-result.json` containing workspace, branch, commit, patch, verification, remote-effect, and blocker evidence. `review` derives required-check evidence from that result; `verify` adds only supplementary local evidence. A run finalizes only after an explicit local confirmation against a packet that matches the immutable proposal, a stopped task outcome, a valid runtime result, and passing evidence for every required check.

## Adapter responsibilities

An adapter may prepare an isolated workspace, invoke an agent with structured inputs, execute allowed commands, capture artifacts, and report runtime state. An adapter may not broaden policy, infer a different target repository, bypass workspace isolation, or authorize remote effects by itself.

The Manus task integration and the proposal-backed local Claude Code adapter both consume the shared lifecycle, policy, proposal, journal, runtime-result, and review-packet model. Claude Code creates a dedicated local worktree, invokes without a permission-bypass option, and cannot claim a successful run without a proposal-matching local-only runtime result. The historical `workflows/nightly.js` script is not a supported governed runtime.

## Remediation sequence

The implementation order is deliberate:

1. **Complete:** Make bounded execution the default and document the product boundary.
2. **Complete:** Add a target manifest and `doctor` preflight.
3. **Foundation complete:** Add commit-pinned proposals and an append-only run journal.
4. **Foundation complete:** Shared proposal, journal, runtime-result, and evidence gates are enforced for Manus and local Claude Code execution.
5. **Foundation complete:** Add the committed repository map, source-linked feature registry, indexing policy, validation command, and non-mutating snapshot status. The deterministic builder produces local file inventory, TypeScript graph, Git history, separate heatmap lenses, a report, and token-budgeted context packs. Governed proposals may retain matching persisted pack provenance without treating it as source or verification evidence.
6. **Foundation complete:** Establish an official cross-platform command foundation: grouped help, focused command help, a testable global routing layer, `overview`, `--cwd`, explicit output modes, and capability-aware color/motion boundaries. Existing commands and JSON contracts remain compatible. A full-screen TUI remains explicitly deferred until packaging, completions, non-interactive behavior, and cross-platform acceptance coverage are stable.
7. **Foundation complete:** Add cross-platform onboarding and package distribution foundations: guided and non-interactive `init`, parser-validated local manifest generation, package metadata, portable artifact cleanup, production-only compilation, and packed-tarball installation verification. The npm package remains private until license, package ownership, versioning, and release policy are explicitly chosen.
8. **Foundation complete:** Add generated Bash, Zsh, Fish, and PowerShell completion scripts from the shared command specification. The CLI prints scripts only; profile installation and sourcing remain explicit operator actions. Guided initialization now labels policy purpose and confirms that setup has not authorized execution.
9. Convert any remaining runtime-specific paths, including the historical workflow script, into explicit adapters or retire them from supported execution.
10. **Foundation complete:** Add risk-aware verification policies based on explicit curated risk tags, protected paths, and operator-configured check mappings. The derived decision is immutable proposal and review metadata; richer captured-artifact interpretation remains future work.
11. **Complete boundary:** Retire the legacy daemon that invoked the archived workflow. `schedule handoff` now records an exact proposal-pinned command without scheduling or executing it.
12. **Deferred by product decision:** Keep scheduler handoffs non-executing until there is an explicit need to start approved work on a timetable. Automatic local index preparation now addresses faster context without introducing background execution, a persistent host, or a schedule.
13. Support a selected external target repository only after the shared engine is proven.

Do not prioritize a dashboard, parallel feature execution, fleet management, or broader autonomy before the earlier controls are complete.

## Definition of success

A maintainer can initialize Feature Inventor for one repository, understand the governing policy and source-linked core flows, produce a one-feature proposal pinned to a commit, execute it in an isolated workspace, inspect a durable review packet, recover cleanly after interruption, and observe no default-branch or remote change without an explicit human decision.

## Runtime adapter registry

The shared execution model is now exposed through a registry of runtime adapters. The core owns immutable proposal validation, environment pinning, journal transitions, runtime-result validation, review evidence, and explicit finalization. Providers register an adapter that exposes a stable identifier, declared capabilities, preflight, and launch behavior. The public `run --runtime ID --run RUN_ID` command selects from this registry; `manus run` and `claude run` remain compatibility aliases.

> Adapters may translate provider work into a normalized handle and observation, but they may not write governed journal events, mark a run reviewable, or finalize a run directly.

A future Codex adapter therefore belongs under `src/runtimes/`, registers a `codex` identifier, and must pass the same conformance suite without altering core review or finalization logic. Passive observation is also part of this interface: the Manus adapter performs one read-only task-status request and returns a normalized observation, while the shared core produces the idempotent journal lifecycle update. Claude Code completes locally and synchronously, so it currently has no observation implementation. These are adapter capability differences, not separate governed lifecycles.

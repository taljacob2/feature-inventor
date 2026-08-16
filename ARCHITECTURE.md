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

A target repository supplies a `feature-inventor.target.json` manifest. The manifest records its repository identity, operator-owned goals, required checks, protected paths, review policy, and scheduling preference.

```text
init -> doctor -> plan -> propose -> run -> watch -> review
```

`init` will establish the manifest. `doctor` validates the environment and policy. `plan` remains a read-only queue preview. `propose` currently resolves the configured default branch to a commit, saves an immutable proposal, and records the first journal event. `run` will execute one governed proposal through a selected runtime adapter. `watch` will show durable run state and required human decisions. `review` will render an evidence-backed review packet.

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

The proposal and versioned append-only run journal are now implemented under `.feature-inventor/runs/<run-id>/`. `status` and `recap` derive initial governed-run summaries from the journal. Runtime adapters do not yet emit the remaining lifecycle events, so calibration and legacy daemon views remain transitional until adapter migration is complete.

## Adapter responsibilities

An adapter may prepare an isolated workspace, invoke an agent with structured inputs, execute allowed commands, capture artifacts, and report runtime state. An adapter may not broaden policy, infer a different target repository, bypass workspace isolation, or authorize remote effects by itself.

The current Claude Code workflow and Manus task integration are transitional adapters. They must converge on the shared lifecycle, policy, proposal, journal, and review-packet model.

## Remediation sequence

The implementation order is deliberate:

1. **Complete:** Make bounded execution the default and document the product boundary.
2. **Complete:** Add a target manifest and `doctor` preflight.
3. **Foundation complete:** Add commit-pinned proposals and an append-only run journal; migrate adapter event emission next.
4. Move policy and lifecycle enforcement into shared core modules.
5. Convert runtime-specific execution paths into adapters.
6. Add evidence-based, risk-aware verification and review packets.
7. Enable explicit scheduling only after bounded-run recovery is reliable.
8. Support a selected external target repository only after the shared engine is proven.

Do not prioritize a dashboard, parallel feature execution, fleet management, or broader autonomy before the earlier controls are complete.

## Definition of success

A maintainer can initialize Feature Inventor for one repository, understand the governing policy, produce a one-feature proposal pinned to a commit, execute it in an isolated workspace, inspect a durable review packet, recover cleanly after interruption, and observe no default-branch or remote change without an explicit human decision.

# Feature Inventor Repository Index

Feature Inventor is a **governed autonomous-improvement harness** for one repository at a time. It turns operator-owned goals into reviewable proposals, launches a selected runtime through a common adapter boundary, records lifecycle evidence, and produces an evidence-backed review packet before finalization.

This file is the short entry point for developers and execution runtimes. It does not replace source code, tests, or the detailed architecture. Use the links and source anchors below to find the authoritative implementation quickly.

## Fast Orientation

| Need | Start here |
|---|---|
| Understand the product model and operating sequence | [README.md](README.md), then [ARCHITECTURE.md](ARCHITECTURE.md) |
| Check a target repository before governed work | `feature-inventor doctor` and [src/doctor.ts](src/doctor.ts) |
| See the operator-owned target contract | [feature-inventor.target.json](feature-inventor.target.json) and [src/target-manifest.ts](src/target-manifest.ts) |
| Find a named product capability | [docs/indexing/features.yml](docs/indexing/features.yml) |
| Validate the curated index | `feature-inventor docs validate` |
| Build or check a generated local snapshot | `feature-inventor index build`, then `feature-inventor index status` |
| Read generated structural or historical evidence | `feature-inventor index report` or `feature-inventor index heatmap --by LENS` |
| Produce a bounded implementation briefing | `feature-inventor index context --feature ID|--flow ID|--path PATH|--command NAME` |
| Implement a runtime adapter | [docs/runtimes/IMPLEMENTING_ADAPTERS.md](docs/runtimes/IMPLEMENTING_ADAPTERS.md) |
| Understand index design, freshness, and trust boundaries | [docs/indexing/INDEXING.md](docs/indexing/INDEXING.md) |

> **Source-of-truth rule:** This index is a navigation and context-selection aid. Confirm behavior against the linked source files, tests, and governed artifacts before proposing, implementing, or verifying a change.

## Core Flows

| Flow | Entry point | Primary implementation | Tests and detailed reference |
|---|---|---|---|
| Target contract and preflight | `src/cli.ts#runDoctor` | `src/target-manifest.ts`, `src/doctor.ts` | `src/target-manifest.test.ts`, `src/doctor.test.ts` |
| Proposal creation | `src/cli.ts#runPropose` | `src/run-proposal.ts`, `src/context-pack-provenance.ts`, `src/risk-verification-policy.ts`, `src/run-journal.ts`, `src/run-plan.ts` | `src/run-proposal.test.ts`, `src/risk-verification-policy.test.ts`, `src/proposal-context-provenance.test.ts`, `src/governed-runs.test.ts` |
| Governed runtime launch | `src/cli.ts#runRuntime` | `src/core/governed-run-service.ts`, `src/runtimes/registry.ts`, `src/runtimes/types.ts` | `src/runtimes/registry.test.ts`, [adapter guide](docs/runtimes/IMPLEMENTING_ADAPTERS.md) |
| Passive observation and recovery | `src/cli.ts#runWatch` | `src/core/governed-run-service.ts`, `src/runtimes/manus.ts`, `src/run-journal.ts` | `src/runtimes/manus.test.ts`, `src/runtimes/registry.test.ts` |
| Runtime result, verification, and review | `src/cli.ts#runCapture`, `src/cli.ts#runReview` | `src/runtime-result.ts`, `src/risk-verification-policy.ts`, `src/review-packet.ts` | `src/runtime-result.test.ts`, `src/risk-verification-policy.test.ts`, `src/review-packet.test.ts` |
| Runtime adapter extension | `src/runtimes/types.ts#RuntimeAdapter` | `src/runtimes/registry.ts`, `src/runtimes/builtins.ts` | `src/runtimes/registry.test.ts`, [adapter guide](docs/runtimes/IMPLEMENTING_ADAPTERS.md) |
| Proposal-pinned scheduler handoff | `src/cli.ts#runSchedule` | `src/schedule-handoff.ts` | `src/schedule-handoff.test.ts` |

The curated registry contains the machine-validated version of these flow definitions, including risk tags and source references. Keep it aligned whenever a product capability or implementation boundary changes.

## System Areas

| Area | Responsibility | Primary paths |
|---|---|---|
| CLI and operator workflow | Parses commands and exposes non-mutating inspection, governed proposal, execution, and review operations. | `src/cli.ts`, `README.md` |
| Governance artifacts | Defines immutable proposals, append-only journals, structured results, and review packets. | `src/run-proposal.ts`, `src/run-journal.ts`, `src/runtime-result.ts`, `src/review-packet.ts` |
| Runtime integration | Resolves registered providers and normalizes preflight, launch, and optional observation. | `src/runtimes/`, `src/core/governed-run-service.ts` |
| Target contract | Validates the repository identity, operator goals, checks, protected paths, review policy, schedule, and index policy. | `src/target-manifest.ts`, `feature-inventor.target.json` |
| Indexing and context selection | Maintains the curated feature map and later generated, commit-pinned repository snapshots. | `docs/indexing/`, `src/indexing/`, `.feature-inventor/index/` |

## Extension Points

| Extension | Contract | Guardrail |
|---|---|---|
| New AI engine | `RuntimeAdapter` and the built-in runtime registry | The core owns governed lifecycle journal writes. An adapter translates only provider-specific behavior. |
| New target repository | `feature-inventor.target.json` and the target initialization workflow | Repository-specific goals and policies remain operator-owned. |
| New product capability | `docs/indexing/features.yml` | Every declared path, symbol, test, and flow reference must pass `docs validate`. |
| New language extractor | The indexing extractor contract under `src/indexing/` | Generated snapshots must be deterministic, commit-pinned, and explicit about incomplete coverage. |
| Durable scheduling | Proposal-pinned schedule handoff | A handoff records an exact command but does not start a scheduler or execute a run itself. |

## Indexing Status

Generated index artifacts belong under `.feature-inventor/index/` and are intentionally local. The directory is ignored by Git because snapshots are derived from an exact checkout and should be rebuilt rather than committed.

The index builder now produces a deterministic file inventory, TypeScript import/export graph, commit-anchored Git history, separate heatmap lenses, a Markdown report, and persisted token-budgeted context packs. Run `feature-inventor index build` only from a clean checkout. Query a single lens with `feature-inventor index heatmap --by reachability|centrality|churn|test-linkage`; these values are evidence categories, not a blended usage score. Build a briefing only from a fresh snapshot with `feature-inventor index context` and exactly one explicit selector. See [docs/indexing/INDEXING.md](docs/indexing/INDEXING.md) for the contract and limitations.

## Reading Order for Feature Work

For a scoped change, start with the matching feature in `docs/indexing/features.yml`, then read its entry point, primary paths, direct tests, and linked flow. For cross-cutting changes, read [ARCHITECTURE.md](ARCHITECTURE.md) first and expand from the relevant core flow. Do not load the entire repository by default.

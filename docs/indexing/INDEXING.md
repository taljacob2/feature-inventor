# Indexing and Context Retrieval

## Purpose

Feature Inventor uses a repository index to reduce the time and context required to understand a target application. The index is a **deterministic retrieval aid**, not a second source of truth. It gives a developer or runtime a compact, commit-pinned map from a named capability to the source, tests, flows, and governed artifacts that need inspection.

The indexing system has two layers.

| Layer | Location | Ownership | Purpose |
|---|---|---|---|
| Curated index | `INDEX.md` and `docs/indexing/features.yml` | Reviewed and committed | Stable repository orientation, named product capabilities, explicit flow definitions, and risk tags. |
| Generated snapshot | `.feature-inventor/index/v1/<commit>/` | Local and ignored | Reproducible source inventory, graphs, heatmaps, and token-budgeted context packs tied to a checkout. |

> **Source-of-truth rule:** Code, tests, configuration, and governed artifacts remain authoritative. A generated summary or context pack may select what to inspect, but it cannot establish behavior by itself.

## Current Foundation

The initial indexing foundation provides the committed navigation map, curated registry, target-manifest indexing policy, `feature-inventor docs validate`, and `feature-inventor index status`. It intentionally does not infer business features from source code or claim runtime usage from static analysis.

The following increments will add source inventory, language adapters, structural graphs, historical Git heatmaps, and bounded context packs. Those outputs are designed here so that the foundational files remain stable as the implementation grows.

## Curated Registry

`docs/indexing/features.yml` declares product capabilities and core flows in terms that static analysis alone cannot reliably discover. It is the semantic bridge between operator intent and source structure.

Each feature declares a stable identifier, human-readable name, intent, entry points, primary implementation paths, tests, flows, and risk tags. Each flow declares source-linked steps and the role each step plays. Registry references use the form `relative/path.ts` or `relative/path.ts#exportedSymbol`.

The registry must not include guessed features, vague path globs, or generated narrative. Add a feature only when the capability has a clear repository-level purpose and concrete source evidence. A feature may reference more than one entry point, but its primary paths should be the smallest accurate implementation surface.

Run the validation command after editing the registry:

```bash
feature-inventor docs validate
feature-inventor docs validate --json
```

Validation checks the YAML structure, duplicate identifiers, supported risk tags, referenced paths, and anchored symbols. It is intentionally strict so an index cannot quietly drift after a rename or deletion.

## Generated Snapshot Contract

Generated snapshots are local because they are derived artifacts. `feature-inventor index build` creates a snapshot only from a **clean checkout** at its exact current commit. The command records that commit's timestamp rather than the wall clock, so rebuilding an unchanged checkout produces stable artifacts.

```text
.feature-inventor/index/
  v1/
    <full-commit-sha>/
      metadata.json
      inventory.json
      graph.json
      history.json
      heatmaps.json
      report.md
      context/
        <context-pack-id>.json
        <context-pack-id>.md
```

`inventory.json` classifies repository files while excluding generated, dependency, build, and Git directories. `graph.json` contains source-derived TypeScript exports and import, re-export, and dynamic-import relationships. Relative NodeNext `.js` specifiers resolve back to indexed TypeScript source files when that file exists. Package imports and unresolved relative modules remain visible as external edges rather than fabricated internal relationships. `history.json` aggregates Git activity in the configured window, anchored to the indexed commit timestamp. `heatmaps.json` preserves raw structural, historical, and test-linkage values. `report.md` is a human-readable summary of the same local data. The optional `context/` subdirectory is created by `index context`, not by `index build`.

Every `metadata.json` file must record the index schema version, generator version, target commit, generation time, configuration digest, and source-collection coverage. A snapshot is valid only for the commit and configuration it records.

`feature-inventor index status` is non-mutating. It reports whether the generated snapshot is fresh, stale, dirty, incomplete, disabled, or not initialized. `feature-inventor index report` prints the report from the newest matching or prior-commit local snapshot and surfaces its status. Neither command modifies artifacts.

| State | Meaning | How it may be used |
|---|---|---|
| `fresh` | Snapshot commit and configuration match a clean checkout. | It may select context, subject to the source-of-truth rule. |
| `stale` | The target commit or configuration differs from the snapshot. | Rebuild before capturing proposal context. |
| `dirty` | The checkout has uncommitted changes relative to the recorded snapshot. | Treat as local working context only and disclose the mismatch. |
| `incomplete` | One or more configured extraction sources failed or were unsupported. | Use only the reported evidence and disclose gaps. |
| `disabled` | The target manifest disables indexing. | Do not generate or consume snapshots. |
| `not-initialized` | No snapshot exists for the target checkout. | Use the curated map and direct source inspection. |

## Evidence Lenses and Heatmaps

Feature Inventor will expose separate lenses instead of a single ambiguous “hot” score.

| Lens | Evidence source | What it shows | What it does not show |
|---|---|---|---|
| Entry reachability | Curated feature-registry entry points | Whether a module is an explicitly declared product entry point. | A complete call graph or actual production execution frequency. |
| Dependency centrality | Resolved direct TypeScript imports, re-exports, and dynamic imports | Direct relationship concentration through fan-in plus fan-out. | Product importance, correctness, or transitive impact. |
| Historical churn | Git commits and changed lines before the indexed commit within the configured window | Development activity and maintenance concentration. | User demand or runtime use. |
| Test linkage | Direct resolved imports from indexed TypeScript test files | Where direct module-level test relationships are known. | Line, branch, or behavioral coverage. |
| Governed-run observation | Run journals and structured results, when explicitly enabled | Evidence from Feature Inventor governed executions. | Target application user behavior. |
| Runtime telemetry | Explicit opt-in target application telemetry, if ever added | Actual execution frequency in the configured environment. | A default collection mechanism. |

Heatmap queries require an explicit lens and expose raw values. Use `feature-inventor index heatmap --by reachability|centrality|churn|test-linkage [--limit COUNT]`; there is no composite default rank. Do not describe Git churn or dependency centrality as “common use.”

## Context Packs

`feature-inventor index context` constructs a bounded, source-linked briefing from exactly one explicit selector. It requires a **fresh** snapshot. This prevents a pack from claiming that its excerpts represent an edited, stale, or incomplete checkout. The selector resolves through the curated registry first and then adds only direct source-graph dependencies and dependents. It never expands transitively.

```sh
feature-inventor index context --feature governed-run --pack change
feature-inventor index context --flow runtime-observation-recovery --pack verification
feature-inventor index context --path src/core/governed-run-service.ts#launchGovernedRun
feature-inventor index context --command watch --max-tokens 2500
```

A request must specify exactly one of `--feature`, `--flow`, `--path`, or `--command`. Pack kinds are `orientation`, `change`, `verification`, and `deep`. `--max-tokens` can reduce the pack size, but the target-manifest `maxEstimatedTokens` policy remains an upper bound. The pack persists as both JSON and Markdown under the selected commit snapshot's `context/` directory.

Every selected item includes its path, optional symbol, line span, selection reason, evidence type, and estimated token cost. Each pack records its target commit, snapshot directory, indexing policy digest, selector, pack kind, requested budget, effective budget, and fixed rendering overhead. If an item does not fit, it appears in the explicit overflow table. The system does not silently truncate or substitute a vague summary.

| Pack | Default estimated-token ceiling | Intended use |
|---|---:|---|
| `orientation` | 1,500 | Rapid understanding of one feature or flow. |
| `change` | 4,000 | Scoped design and implementation preparation. |
| `verification` | 3,000 | Review and validation preparation. |
| `deep` | 8,000 | Explicitly justified cross-cutting investigation. |

The execution runtime must open and verify the linked source files before it makes an implementation, verification, or governance decision. A context pack is a scope reducer, not a replacement for code reading, a basis for unverified claims, or an authorization to change the repository.

### Optional proposal provenance

When the manifest sets `indexing.autoPrepareOnPropose` to `true`, an explicit `feature-inventor propose` call refreshes the local index from a clean checkout at the resolved proposal commit. If the approved queue identifies **one exact** curated feature by ID, name, or deliberate `feature:` source, it also writes a bounded context pack and records its immutable provenance on the proposal. It does not guess from partial names, create a pack for ambiguous scope, start a runtime, or approve any work. A clean index still refreshes when no exact feature is available, and the proposal records no context pack. Use `feature-inventor propose --no-auto-index` to suppress this local preparation for one proposal.

`feature-inventor propose --context-pack RELATIVE_JSON_PATH` can instead record one already-persisted context pack on a new immutable proposal. It requires a fresh snapshot whose target commit equals the proposal's resolved default-branch commit. The stored proposal reference contains only reproducibility metadata: the pack ID, relative JSON and Markdown paths, SHA-256 digest of the JSON artifact, snapshot policy digest, selector, pack kind, and token accounting. It does not copy source excerpts into the proposal.

> **Trust boundary:** Context-pack provenance is informational design history. It does not satisfy required checks, affect review readiness, authorize a runtime, establish code behavior, or replace the source and artifact evidence gates.

## Target Manifest Policy

The optional `indexing` section in `feature-inventor.target.json` governs this capability. If omitted, Feature Inventor uses conservative defaults and retains backward compatibility with existing target manifests.

```json
{
  "indexing": {
    "enabled": true,
    "historyDays": 90,
    "defaultContextPack": "change",
    "maxEstimatedTokens": 4000,
    "includeGovernedArtifacts": true,
    "autoPrepareOnPropose": true
  }
}
```

`historyDays` controls only historical Git aggregation. It is never a proxy for production use. `maxEstimatedTokens` is a strict upper bound for a later context selector. `includeGovernedArtifacts` covers only local Feature Inventor proposal, journal, result, and review artifacts. It does not authorize target application telemetry or external data collection. `autoPrepareOnPropose` defaults to `false` for compatibility and is an explicit local opt-in. It requires a clean checkout and a resolved default-branch commit; otherwise proposal creation fails rather than writing an index that cannot be tied to the proposal.

## Implementation and Maintenance Rules

The index implementation should remain free, local, and rebuildable using the repository checkout, Git, Node.js, and language tooling. It must not require a hosted vector database, a paid external indexing service, or an LLM for baseline operation.

When a change introduces a new product capability, command path, runtime boundary, or materially different flow, update `INDEX.md` and `features.yml` in the same pull request. When a source reference is renamed or removed, run `feature-inventor docs validate` before review. Run `feature-inventor index build` only from a clean checkout; generated snapshot changes stay local and must never mask failing curated-reference validation.

See the root [INDEX.md](../../INDEX.md) for a concise orientation map and [ARCHITECTURE.md](../../ARCHITECTURE.md) for the broader operating model.

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

Generated snapshots are local because they are derived artifacts. A later `feature-inventor index build` command will create snapshots with this layout:

```text
.feature-inventor/index/
  v1/
    <full-commit-sha>/
      metadata.json
      inventory.json
      graph.json
      features.json
      flows.json
      heatmaps.json
      report.md
      context/
        <context-pack-id>.json
        <context-pack-id>.md
```

Every `metadata.json` file must record the index schema version, generator version, target commit, generation time, configuration digest, and source-collection coverage. A snapshot is valid only for the commit and configuration it records.

`feature-inventor index status` is non-mutating. It reports whether the generated snapshot is fresh, stale, dirty, incomplete, disabled, or not initialized. The foundation may report `not-initialized` until `index build` is implemented. This is expected and must never be treated as a runtime error or a reason to bypass direct source inspection.

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
| Entry reachability | Declared entry points and source graph | A module’s connection to known commands, APIs, workflows, or runtime boundaries. | Actual production execution frequency. |
| Dependency centrality | Direct and bounded transitive imports | Potential change-impact concentration. | Product importance or correctness. |
| Historical churn | Git commits, changed lines, and change dates within a stated window | Development activity and maintenance concentration. | User demand or runtime use. |
| Test linkage | Curated registry plus conventional test relationships | Where direct tests are known. | Line, branch, or behavioral coverage. |
| Governed-run observation | Run journals and structured results, when explicitly enabled | Evidence from Feature Inventor governed executions. | Target application user behavior. |
| Runtime telemetry | Explicit opt-in target application telemetry, if ever added | Actual execution frequency in the configured environment. | A default collection mechanism. |

The first generated heatmap must expose raw values and the selected lens. It must not combine signals into a default composite rank and must not describe Git churn or dependency centrality as “common use.”

## Context Packs

A later `feature-inventor index context` command will construct a bounded briefing for a feature, flow, path, command, or explicit query. It will begin with references supplied by the user or proposal, resolve them through the curated registry and static graph, and select only direct entry points, primary implementations, direct dependencies, tests, and relevant governed artifacts.

Every selected item must include its path, symbol or line span, selection reason, evidence type, and estimated token cost. A pack must record its target commit and index metadata. It must not silently truncate source anchors when the requested budget is exceeded.

| Pack | Default estimated-token ceiling | Intended use |
|---|---:|---|
| `orientation` | 1,500 | Rapid understanding of one feature or flow. |
| `change` | 4,000 | Scoped design and implementation preparation. |
| `verification` | 3,000 | Review and validation preparation. |
| `deep` | 8,000 | Explicitly justified cross-cutting investigation. |

The execution runtime must open the linked source files before it makes an implementation, verification, or governance decision. The pack is a scope reducer, not a replacement for code reading.

## Target Manifest Policy

The optional `indexing` section in `feature-inventor.target.json` governs this capability. If omitted, Feature Inventor uses conservative defaults and retains backward compatibility with existing target manifests.

```json
{
  "indexing": {
    "enabled": true,
    "historyDays": 90,
    "defaultContextPack": "change",
    "maxEstimatedTokens": 4000,
    "includeGovernedArtifacts": true
  }
}
```

`historyDays` controls only historical Git aggregation. It is never a proxy for production use. `maxEstimatedTokens` is a strict upper bound for a later context selector. `includeGovernedArtifacts` covers only local Feature Inventor proposal, journal, result, and review artifacts. It does not authorize target application telemetry or external data collection.

## Implementation and Maintenance Rules

The index implementation should remain free, local, and rebuildable using the repository checkout, Git, Node.js, and language tooling. It must not require a hosted vector database, a paid external indexing service, or an LLM for baseline operation.

When a change introduces a new product capability, command path, runtime boundary, or materially different flow, update `INDEX.md` and `features.yml` in the same pull request. When a source reference is renamed or removed, run `feature-inventor docs validate` before review. Generated snapshot changes should normally stay local and must never mask failing curated-reference validation.

See the root [INDEX.md](../../INDEX.md) for a concise orientation map and [ARCHITECTURE.md](../../ARCHITECTURE.md) for the broader operating model.

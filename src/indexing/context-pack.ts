import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSourceAnchor } from "./feature-registry.js";
import { type ResolvedContextScopeItem } from "./context-scope.js";
import {
  CONTEXT_PACK_DEFAULT_TOKEN_BUDGETS,
  type ContextEvidenceType,
  type ContextOverflowItem,
  type ContextPack,
  type ContextPackProvenance,
  type ContextSelection,
  type ContextSourceAnchor,
  type ModuleGraph,
} from "./types.js";

const CONTEXT_DIRECTORY = "context";
const FIXED_OVERHEAD_ESTIMATED_TOKENS = 320;
const NEIGHBOR_PRIORITY = 60;
const EXCERPT_CONTEXT_LINES = 6;

interface Candidate extends ResolvedContextScopeItem {
  source?: "scope" | "dependency" | "dependent";
}

function anchorKey(anchor: ContextSourceAnchor): string {
  return `${anchor.path}#${anchor.symbol ?? ""}`;
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function safeRepositoryFile(repoRoot: string, anchor: ContextSourceAnchor): string {
  const absolute = resolve(repoRoot, anchor.path);
  const relative = absolute.slice(resolve(repoRoot).length + 1);
  if (relative.startsWith("..") || relative === "") throw new Error(`Context anchor escapes repository root: ${anchor.path}`);
  if (!existsSync(absolute)) throw new Error(`Context anchor path does not exist: ${anchor.path}`);
  return absolute;
}

function symbolLineRange(lines: string[], symbol: string): { start: number; end: number } {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declaration = new RegExp(`\\b(?:export\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:class|function|interface|type|const|let|var|enum)\\s+${escaped}\\b`);
  const namedExport = new RegExp(`\\bexport\\s*{[^}]*\\b${escaped}\\b[^}]*}`);
  const index = lines.findIndex((line) => declaration.test(line) || namedExport.test(line));
  if (index === -1) throw new Error(`Context anchor exported symbol does not exist: ${symbol}`);
  const start = Math.max(0, index - EXCERPT_CONTEXT_LINES);
  const end = Math.min(lines.length, index + EXCERPT_CONTEXT_LINES + 1);
  return { start, end };
}

function excerptForAnchor(repoRoot: string, anchor: ContextSourceAnchor): { lineStart: number; lineEnd: number; content: string } {
  const content = readFileSync(safeRepositoryFile(repoRoot, anchor), "utf8");
  const lines = content.split("\n");
  const range = anchor.symbol === null ? { start: 0, end: lines.length } : symbolLineRange(lines, anchor.symbol);
  return { lineStart: range.start + 1, lineEnd: range.end, content: lines.slice(range.start, range.end).join("\n") };
}

function mergeCandidate(candidates: Map<string, Candidate>, candidate: Candidate): void {
  const key = anchorKey(candidate.anchor);
  const existing = candidates.get(key);
  if (!existing) {
    candidates.set(key, {
      ...candidate,
      selectionReasons: [...candidate.selectionReasons],
      evidenceTypes: [...candidate.evidenceTypes],
    });
    return;
  }
  existing.priority = Math.max(existing.priority, candidate.priority);
  for (const reason of candidate.selectionReasons) if (!existing.selectionReasons.includes(reason)) existing.selectionReasons.push(reason);
  for (const evidence of candidate.evidenceTypes) if (!existing.evidenceTypes.includes(evidence)) existing.evidenceTypes.push(evidence);
}

function graphNeighbors(scopeItems: readonly ResolvedContextScopeItem[], graph: ModuleGraph): Candidate[] {
  const scopePaths = new Set(scopeItems.map((item) => item.anchor.path));
  const candidates = new Map<string, Candidate>();
  for (const edge of graph.edges) {
    if (edge.target === null) continue;
    if (scopePaths.has(edge.source) && !scopePaths.has(edge.target)) {
      mergeCandidate(candidates, {
        anchor: { path: edge.target, symbol: null },
        priority: NEIGHBOR_PRIORITY,
        selectionReasons: [`Direct source-graph dependency of ${edge.source}`],
        evidenceTypes: ["source-graph-dependency"],
        source: "dependency",
      });
    }
    if (scopePaths.has(edge.target) && !scopePaths.has(edge.source)) {
      mergeCandidate(candidates, {
        anchor: { path: edge.source, symbol: null },
        priority: NEIGHBOR_PRIORITY,
        selectionReasons: [`Direct source-graph dependent of ${edge.target}`],
        evidenceTypes: ["source-graph-dependent"],
        source: "dependent",
      });
    }
  }
  return [...candidates.values()];
}

function sortCandidates(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort(
    (left, right) =>
      right.priority - left.priority ||
      left.anchor.path.localeCompare(right.anchor.path) ||
      (left.anchor.symbol ?? "").localeCompare(right.anchor.symbol ?? ""),
  );
}

function buildPackId(provenance: ContextPackProvenance): string {
  const digestInput = JSON.stringify({
    commit: provenance.targetCommit,
    selector: provenance.selector,
    packKind: provenance.packKind,
    budget: provenance.effectiveMaxEstimatedTokens,
  });
  return `context-${createHash("sha256").update(digestInput).digest("hex").slice(0, 16)}`;
}

function readingRules(): string[] {
  return [
    "This context pack is a retrieval index, not a substitute for reading linked source files.",
    "Open and verify each selected source anchor before making an implementation, verification, or governance decision.",
    "Overflow items were deliberately omitted to preserve the requested token budget; narrow the selector or request a larger explicit budget to include them.",
  ];
}

export interface BuildContextPackInput {
  repoRoot: string;
  provenance: Omit<ContextPackProvenance, "effectiveMaxEstimatedTokens">;
  graph: ModuleGraph;
  scopeItems: readonly ResolvedContextScopeItem[];
  maxEstimatedTokens?: number;
}

/**
 * Selects direct curated scope first, then direct graph neighbors. It never
 * expands transitively and never exceeds the effective estimated-token budget.
 */
export function buildContextPack(input: BuildContextPackInput): ContextPack {
  const requestedBudget = input.maxEstimatedTokens ?? CONTEXT_PACK_DEFAULT_TOKEN_BUDGETS[input.provenance.packKind];
  if (!Number.isInteger(requestedBudget) || requestedBudget < 1) throw new Error("Context-pack token budget must be a positive integer");
  const effectiveBudget = Math.min(requestedBudget, input.provenance.requestedMaxEstimatedTokens);
  if (effectiveBudget <= FIXED_OVERHEAD_ESTIMATED_TOKENS) {
    throw new Error(`Context-pack token budget must exceed fixed overhead of ${FIXED_OVERHEAD_ESTIMATED_TOKENS} estimated tokens`);
  }
  const provenance: ContextPackProvenance = { ...input.provenance, effectiveMaxEstimatedTokens: effectiveBudget };
  const candidateMap = new Map<string, Candidate>();
  for (const item of input.scopeItems) mergeCandidate(candidateMap, { ...item, source: "scope" });
  for (const neighbor of graphNeighbors(input.scopeItems, input.graph)) mergeCandidate(candidateMap, neighbor);

  const selected: ContextSelection[] = [];
  const overflow: ContextOverflowItem[] = [];
  let estimatedTokens = FIXED_OVERHEAD_ESTIMATED_TOKENS;
  for (const candidate of sortCandidates([...candidateMap.values()])) {
    const excerpt = excerptForAnchor(input.repoRoot, candidate.anchor);
    const candidateTokens = estimateTokens(excerpt.content);
    if (estimatedTokens + candidateTokens <= effectiveBudget) {
      selected.push({
        anchor: candidate.anchor,
        priority: candidate.priority,
        selectionReasons: candidate.selectionReasons,
        evidenceTypes: candidate.evidenceTypes,
        lineStart: excerpt.lineStart,
        lineEnd: excerpt.lineEnd,
        estimatedTokens: candidateTokens,
        content: excerpt.content,
      });
      estimatedTokens += candidateTokens;
    } else {
      overflow.push({
        anchor: candidate.anchor,
        priority: candidate.priority,
        selectionReasons: candidate.selectionReasons,
        evidenceTypes: candidate.evidenceTypes,
        estimatedTokens: candidateTokens,
        reason: "budget-exceeded",
      });
    }
  }
  return {
    id: buildPackId(provenance),
    provenance,
    fixedOverheadEstimatedTokens: FIXED_OVERHEAD_ESTIMATED_TOKENS,
    estimatedTokens,
    selected,
    overflow,
    readingRules: readingRules(),
  };
}

function anchorLabel(anchor: ContextSourceAnchor): string {
  return `${anchor.path}${anchor.symbol ? `#${anchor.symbol}` : ""}`;
}

function markdownFence(content: string): string {
  return content.includes("```") ? "````" : "```";
}

/** Renders a pack with machine-verifiable provenance and readable source excerpts. */
export function formatContextPack(pack: ContextPack): string {
  const selectedRows = pack.selected.length === 0
    ? ["| None | - | - | - | - |"]
    : pack.selected.map((item) => `| ${item.priority} | \`${anchorLabel(item.anchor)}\` | ${item.selectionReasons.join("; ")} | ${item.evidenceTypes.join(", ")} | ${item.estimatedTokens} |`);
  const overflowRows = pack.overflow.length === 0
    ? ["| None | - | - | - | - |"]
    : pack.overflow.map((item) => `| ${item.priority} | \`${anchorLabel(item.anchor)}\` | ${item.selectionReasons.join("; ")} | ${item.evidenceTypes.join(", ")} | ${item.estimatedTokens} |`);
  const excerpts = pack.selected.flatMap((item) => {
    const fence = markdownFence(item.content);
    return [
      `### \`${anchorLabel(item.anchor)}\` (lines ${item.lineStart}-${item.lineEnd})`,
      "",
      `${fence}text`,
      item.content,
      fence,
      "",
    ];
  });
  return [
    `# Context Pack: ${pack.id}`,
    "",
    `- **Target commit:** \`${pack.provenance.targetCommit}\``,
    `- **Snapshot:** \`${pack.provenance.snapshotPath}\``,
    `- **Selector:** \`${pack.provenance.selector.kind}:${pack.provenance.selector.value}\``,
    `- **Pack kind:** \`${pack.provenance.packKind}\``,
    `- **Estimated tokens:** ${pack.estimatedTokens} / ${pack.provenance.effectiveMaxEstimatedTokens} (fixed overhead: ${pack.fixedOverheadEstimatedTokens})`,
    "",
    "## Selected Anchors",
    "",
    "| Priority | Source | Selection reason | Evidence type | Estimated tokens |",
    "|---:|---|---|---|---:|",
    ...selectedRows,
    "",
    "## Source Excerpts",
    "",
    ...(excerpts.length > 0 ? excerpts : ["No source excerpt fit within the selected budget.", ""]),
    "## Budget Overflow",
    "",
    "| Priority | Source | Selection reason | Evidence type | Estimated tokens |",
    "|---:|---|---|---|---:|",
    ...overflowRows,
    "",
    "## Reading Rules",
    "",
    ...pack.readingRules.map((rule) => `- ${rule}`),
    "",
  ].join("\n");
}

/** Persists machine and human forms beneath the commit-pinned snapshot only. */
export function persistContextPack(snapshotDirectory: string, pack: ContextPack): { jsonPath: string; markdownPath: string } {
  const directory = join(snapshotDirectory, CONTEXT_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const jsonPath = join(directory, `${pack.id}.json`);
  const markdownPath = join(directory, `${pack.id}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, formatContextPack(pack), "utf8");
  return { jsonPath, markdownPath };
}

/** Reads one persisted context pack without treating it as a replacement for current source. */
export function readContextPack(path: string): ContextPack {
  return JSON.parse(readFileSync(path, "utf8")) as ContextPack;
}

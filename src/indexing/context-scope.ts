import { parseSourceAnchor } from "./feature-registry.js";
import {
  type ContextEvidenceType,
  type ContextSelector,
  type ContextSourceAnchor,
  type FeatureRegistry,
} from "./types.js";

export interface ResolvedContextScopeItem {
  anchor: ContextSourceAnchor;
  priority: number;
  selectionReasons: string[];
  evidenceTypes: ContextEvidenceType[];
}

function anchorKey(anchor: ContextSourceAnchor): string {
  return `${anchor.path}#${anchor.symbol ?? ""}`;
}

function sourceAnchor(reference: string): ContextSourceAnchor {
  const parsed = parseSourceAnchor(reference);
  return { path: parsed.path, symbol: parsed.symbol };
}

function mergeScopeItem(items: Map<string, ResolvedContextScopeItem>, item: ResolvedContextScopeItem): void {
  const key = anchorKey(item.anchor);
  const existing = items.get(key);
  if (!existing) {
    items.set(key, {
      ...item,
      selectionReasons: [...item.selectionReasons],
      evidenceTypes: [...item.evidenceTypes],
    });
    return;
  }
  existing.priority = Math.max(existing.priority, item.priority);
  for (const reason of item.selectionReasons) if (!existing.selectionReasons.includes(reason)) existing.selectionReasons.push(reason);
  for (const evidence of item.evidenceTypes) if (!existing.evidenceTypes.includes(evidence)) existing.evidenceTypes.push(evidence);
}

function addReference(
  items: Map<string, ResolvedContextScopeItem>,
  reference: string,
  priority: number,
  reason: string,
  evidenceType: ContextEvidenceType,
): void {
  mergeScopeItem(items, { anchor: sourceAnchor(reference), priority, selectionReasons: [reason], evidenceTypes: [evidenceType] });
}

function scopeFeature(registry: FeatureRegistry, featureId: string, items: Map<string, ResolvedContextScopeItem>): void {
  const feature = registry.features.find((candidate) => candidate.id === featureId);
  if (!feature) throw new Error(`Unknown feature selector: ${featureId}`);
  for (const reference of feature.entryPoints) {
    addReference(items, reference, 100, `Feature ${feature.id} declared entry point`, "explicit-scope");
  }
  for (const reference of feature.primaryPaths) {
    addReference(items, reference, 90, `Feature ${feature.id} declared primary path`, "curated-feature-map");
  }
  for (const reference of feature.tests) {
    addReference(items, reference, 80, `Feature ${feature.id} declared direct test`, "direct-test");
  }
  for (const flowId of feature.flows) scopeFlow(registry, flowId, items, `Feature ${feature.id} includes flow`);
}

function scopeFlow(registry: FeatureRegistry, flowId: string, items: Map<string, ResolvedContextScopeItem>, parentReason?: string): void {
  const flow = registry.flows.find((candidate) => candidate.id === flowId);
  if (!flow) throw new Error(`Unknown flow selector: ${flowId}`);
  for (const reference of flow.startsAt) {
    addReference(items, reference, 95, parentReason ? `${parentReason} ${flow.id} start` : `Flow ${flow.id} start`, "declared-flow");
  }
  for (const step of flow.steps) {
    addReference(items, step.source, 85, parentReason ? `${parentReason} ${flow.id} step (${step.role})` : `Flow ${flow.id} step (${step.role})`, "declared-flow");
  }
}

function scopeCommand(registry: FeatureRegistry, command: string, items: Map<string, ResolvedContextScopeItem>): void {
  const normalized = command.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "") throw new Error("Command selector must contain letters or numbers");
  let matches = 0;
  for (const feature of registry.features) {
    for (const reference of feature.entryPoints) {
      const anchor = sourceAnchor(reference);
      const symbol = (anchor.symbol ?? "").toLowerCase();
      if (!symbol.includes(normalized)) continue;
      matches += 1;
      addReference(items, reference, 100, `Command selector ${command} matched registered entry symbol ${anchor.symbol}`, "explicit-scope");
      for (const primaryPath of feature.primaryPaths) {
        addReference(items, primaryPath, 90, `Command selector ${command} matched feature ${feature.id} primary path`, "curated-feature-map");
      }
      for (const test of feature.tests) {
        addReference(items, test, 80, `Command selector ${command} matched feature ${feature.id} direct test`, "direct-test");
      }
    }
  }
  if (matches === 0) throw new Error(`No registered entry point matches command selector: ${command}`);
}

/** Resolves one explicit selector only; broad fuzzy repository searching is intentionally out of scope. */
export function resolveContextScope(registry: FeatureRegistry, selector: ContextSelector): ResolvedContextScopeItem[] {
  const items = new Map<string, ResolvedContextScopeItem>();
  switch (selector.kind) {
    case "feature":
      scopeFeature(registry, selector.value, items);
      break;
    case "flow":
      scopeFlow(registry, selector.value, items);
      break;
    case "path":
      addReference(items, selector.value, 100, `Explicit path selector ${selector.value}`, "explicit-scope");
      break;
    case "command":
      scopeCommand(registry, selector.value, items);
      break;
  }
  return [...items.values()].sort(
    (left, right) =>
      right.priority - left.priority ||
      left.anchor.path.localeCompare(right.anchor.path) ||
      (left.anchor.symbol ?? "").localeCompare(right.anchor.symbol ?? ""),
  );
}

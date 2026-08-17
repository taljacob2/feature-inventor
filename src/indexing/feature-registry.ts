import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  INDEX_FEATURE_REGISTRY_PATH,
  type FeatureRegistry,
  type IndexedFeature,
  type IndexedFlow,
  type IndexedFlowStep,
  type RegistryDiagnostic,
  type RegistryValidation,
  type SourceAnchor,
} from "./types.js";

export const SUPPORTED_RISK_TAGS = new Set([
  "external-runtime",
  "finalization-gate",
  "governance-policy",
  "idempotency",
  "immutable-artifact",
  "lifecycle-state",
  "non-executing-handoff",
  "provider-boundary",
  "repository-identity",
  "verification-evidence",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string`);
  return value;
}

function requireStringArray(value: unknown, path: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`${path} must be ${allowEmpty ? "an array" : "a non-empty array"} of non-empty strings`);
  }
  return [...value];
}

function requireKnownKeys(record: Record<string, unknown>, allowed: string[], path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key} is not supported by this registry version`);
  }
}

function requireUnique(values: string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${path} must not contain duplicate value ${value}`);
    seen.add(value);
  }
}

function parseFeature(value: unknown, path: string): IndexedFeature {
  const feature = requireRecord(value, path);
  requireKnownKeys(feature, ["id", "name", "intent", "entryPoints", "primaryPaths", "tests", "flows", "riskTags"], path);
  const result: IndexedFeature = {
    id: requireString(feature.id, `${path}.id`),
    name: requireString(feature.name, `${path}.name`),
    intent: requireString(feature.intent, `${path}.intent`),
    entryPoints: requireStringArray(feature.entryPoints, `${path}.entryPoints`),
    primaryPaths: requireStringArray(feature.primaryPaths, `${path}.primaryPaths`),
    // A curated feature may truthfully have no automated-test anchors yet.
    // Require the field but allow an empty list rather than fabricating coverage.
    tests: requireStringArray(feature.tests, `${path}.tests`, true),
    flows: requireStringArray(feature.flows, `${path}.flows`),
    riskTags: requireStringArray(feature.riskTags, `${path}.riskTags`),
  };
  for (const tag of result.riskTags) {
    if (!SUPPORTED_RISK_TAGS.has(tag)) throw new Error(`${path}.riskTags contains unsupported risk tag ${tag}`);
  }
  requireUnique(result.entryPoints, `${path}.entryPoints`);
  requireUnique(result.primaryPaths, `${path}.primaryPaths`);
  requireUnique(result.tests, `${path}.tests`);
  requireUnique(result.flows, `${path}.flows`);
  requireUnique(result.riskTags, `${path}.riskTags`);
  return result;
}

function parseFlowStep(value: unknown, path: string): IndexedFlowStep {
  const step = requireRecord(value, path);
  requireKnownKeys(step, ["source", "role"], path);
  return {
    source: requireString(step.source, `${path}.source`),
    role: requireString(step.role, `${path}.role`),
  };
}

function parseFlow(value: unknown, path: string): IndexedFlow {
  const flow = requireRecord(value, path);
  requireKnownKeys(flow, ["id", "name", "startsAt", "steps"], path);
  const stepsValue = flow.steps;
  if (!Array.isArray(stepsValue) || stepsValue.length === 0) throw new Error(`${path}.steps must be a non-empty array`);
  const result: IndexedFlow = {
    id: requireString(flow.id, `${path}.id`),
    name: requireString(flow.name, `${path}.name`),
    startsAt: requireStringArray(flow.startsAt, `${path}.startsAt`),
    steps: stepsValue.map((step, index) => parseFlowStep(step, `${path}.steps[${index}]`)),
  };
  requireUnique(result.startsAt, `${path}.startsAt`);
  return result;
}

/** Parses the human-edited registry before checking references against a checkout. */
export function parseFeatureRegistry(content: string): FeatureRegistry {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid feature registry YAML: ${reason}`);
  }
  const root = requireRecord(parsed, INDEX_FEATURE_REGISTRY_PATH);
  requireKnownKeys(root, ["version", "features", "flows"], INDEX_FEATURE_REGISTRY_PATH);
  if (root.version !== 1) throw new Error(`${INDEX_FEATURE_REGISTRY_PATH}.version must be 1`);
  if (!Array.isArray(root.features) || root.features.length === 0) throw new Error(`${INDEX_FEATURE_REGISTRY_PATH}.features must be a non-empty array`);
  if (!Array.isArray(root.flows) || root.flows.length === 0) throw new Error(`${INDEX_FEATURE_REGISTRY_PATH}.flows must be a non-empty array`);
  const registry: FeatureRegistry = {
    version: 1,
    features: root.features.map((feature, index) => parseFeature(feature, `${INDEX_FEATURE_REGISTRY_PATH}.features[${index}]`)),
    flows: root.flows.map((flow, index) => parseFlow(flow, `${INDEX_FEATURE_REGISTRY_PATH}.flows[${index}]`)),
  };
  requireUnique(registry.features.map((feature) => feature.id), `${INDEX_FEATURE_REGISTRY_PATH}.features ids`);
  requireUnique(registry.flows.map((flow) => flow.id), `${INDEX_FEATURE_REGISTRY_PATH}.flows ids`);
  return registry;
}

/** Parses a relative source reference without allowing it to escape the target checkout. */
export function parseSourceAnchor(value: string): SourceAnchor {
  const parts = value.split("#");
  if (parts.length > 2) throw new Error(`Source reference must contain at most one # separator: ${value}`);
  const [path, symbolValue] = parts;
  if (!path || path.startsWith("/") || path.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new Error(`Source reference must be a safe relative path: ${value}`);
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) throw new Error(`Source reference contains unsupported path characters: ${value}`);
  if (symbolValue !== undefined && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(symbolValue)) {
    throw new Error(`Source reference has an invalid symbol anchor: ${value}`);
  }
  return { path, symbol: symbolValue ?? null };
}

function sourcePath(repoRoot: string, anchor: SourceAnchor): string {
  const absolute = resolve(repoRoot, anchor.path);
  const pathFromRoot = relative(repoRoot, absolute);
  if (pathFromRoot === "" || pathFromRoot.startsWith("..") || pathFromRoot.includes("../")) {
    throw new Error(`Source reference escapes repository root: ${anchor.path}`);
  }
  return absolute;
}

function hasExportedSymbol(content: string, symbol: string): boolean {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declaration = new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:class|function|interface|type|const|let|var|enum)\\s+${escaped}\\b`);
  const namedExport = new RegExp(`\\bexport\\s*{[^}]*\\b${escaped}\\b[^}]*}`);
  return declaration.test(content) || namedExport.test(content);
}

function validateSourceReference(repoRoot: string, value: string, diagnosticPath: string, diagnostics: RegistryDiagnostic[]): void {
  let anchor: SourceAnchor;
  try {
    anchor = parseSourceAnchor(value);
  } catch (err) {
    diagnostics.push({ path: diagnosticPath, message: err instanceof Error ? err.message : String(err) });
    return;
  }
  let absolute: string;
  try {
    absolute = sourcePath(repoRoot, anchor);
  } catch (err) {
    diagnostics.push({ path: diagnosticPath, message: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (!existsSync(absolute)) {
    diagnostics.push({ path: diagnosticPath, message: `Referenced path does not exist: ${anchor.path}` });
    return;
  }
  if (anchor.symbol !== null && !hasExportedSymbol(readFileSync(absolute, "utf8"), anchor.symbol)) {
    diagnostics.push({ path: diagnosticPath, message: `Referenced exported symbol does not exist: ${value}` });
  }
}

/** Validates registry semantics and every source anchor against one target checkout. */
export function validateFeatureRegistry(repoRoot: string, content: string): RegistryValidation {
  let registry: FeatureRegistry;
  try {
    registry = parseFeatureRegistry(content);
  } catch (err) {
    return { registry: null, diagnostics: [{ path: INDEX_FEATURE_REGISTRY_PATH, message: err instanceof Error ? err.message : String(err) }], valid: false };
  }

  const diagnostics: RegistryDiagnostic[] = [];
  const knownFlowIds = new Set(registry.flows.map((flow) => flow.id));
  registry.features.forEach((feature, featureIndex) => {
    for (const flowId of feature.flows) {
      if (!knownFlowIds.has(flowId)) {
        diagnostics.push({ path: `features[${featureIndex}].flows`, message: `Feature ${feature.id} references unknown flow ${flowId}` });
      }
    }
    feature.entryPoints.forEach((source, index) => validateSourceReference(repoRoot, source, `features[${featureIndex}].entryPoints[${index}]`, diagnostics));
    feature.primaryPaths.forEach((source, index) => validateSourceReference(repoRoot, source, `features[${featureIndex}].primaryPaths[${index}]`, diagnostics));
    feature.tests.forEach((source, index) => validateSourceReference(repoRoot, source, `features[${featureIndex}].tests[${index}]`, diagnostics));
  });
  registry.flows.forEach((flow, flowIndex) => {
    flow.startsAt.forEach((source, index) => validateSourceReference(repoRoot, source, `flows[${flowIndex}].startsAt[${index}]`, diagnostics));
    flow.steps.forEach((step, index) => validateSourceReference(repoRoot, step.source, `flows[${flowIndex}].steps[${index}].source`, diagnostics));
  });
  return { registry, diagnostics, valid: diagnostics.length === 0 };
}

/** Loads the committed registry if present, returning a diagnostic rather than silently treating it as optional. */
export function validateFeatureRegistryFile(repoRoot: string): RegistryValidation {
  const path = resolve(repoRoot, INDEX_FEATURE_REGISTRY_PATH);
  if (!existsSync(path)) {
    return {
      registry: null,
      diagnostics: [{ path: INDEX_FEATURE_REGISTRY_PATH, message: "Curated feature registry is required" }],
      valid: false,
    };
  }
  return validateFeatureRegistry(repoRoot, readFileSync(path, "utf8"));
}

export function formatRegistryValidation(validation: RegistryValidation): string {
  if (validation.valid && validation.registry) {
    return `Documentation index is valid: ${validation.registry.features.length} feature(s), ${validation.registry.flows.length} flow(s)`;
  }
  const lines = ["Documentation index is invalid:"];
  for (const diagnostic of validation.diagnostics) lines.push(`- ${diagnostic.path}: ${diagnostic.message}`);
  return lines.join("\n");
}

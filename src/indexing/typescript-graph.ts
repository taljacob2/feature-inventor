import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { type ModuleEdgeKind, type ModuleGraph, type ModuleGraphEdge, type ModuleGraphNode, type RepositoryInventoryFile } from "./types.js";

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

function toRepositoryPath(repoRoot: string, absolutePath: string): string {
  return relative(repoRoot, absolutePath).split("\\").join("/");
}

function modifiersFor(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
}

function hasExportModifier(node: ts.Node): boolean {
  return modifiersFor(node).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function hasDefaultModifier(node: ts.Node): boolean {
  return modifiersFor(node).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

function declaredNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  const names: string[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) names.push(...declaredNames(element.name));
  }
  return names;
}

function exportsFromSourceFile(sourceFile: ts.SourceFile): string[] {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      names.add("default");
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add(element.name.text);
      }
      continue;
    }
    if (!hasExportModifier(statement)) continue;
    if (hasDefaultModifier(statement)) names.add("default");
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of declaredNames(declaration.name)) names.add(name);
      }
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function resolveRelativeModule(sourcePath: string, specifier: string, indexedPaths: ReadonlySet<string>): string | null {
  if (!specifier.startsWith(".")) return null;
  const direct = resolve(dirname(sourcePath), specifier);
  const sourceBase = direct.replace(/\.(?:c|m)?js$/i, "");
  const candidates = [
    direct,
    ...TYPESCRIPT_EXTENSIONS.map((extension) => `${sourceBase}${extension}`),
    ...TYPESCRIPT_EXTENSIONS.map((extension) => resolve(sourceBase, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && indexedPaths.has(candidate)) return candidate;
  }
  return null;
}

function edgeFromSpecifier(
  repoRoot: string,
  sourcePath: string,
  specifier: string,
  kind: ModuleEdgeKind,
  indexedPaths: ReadonlySet<string>,
): ModuleGraphEdge {
  const resolved = resolveRelativeModule(sourcePath, specifier, indexedPaths);
  return {
    source: toRepositoryPath(repoRoot, sourcePath),
    target: resolved === null ? null : toRepositoryPath(repoRoot, resolved),
    specifier,
    kind,
    external: resolved === null,
  };
}

function collectEdges(
  repoRoot: string,
  sourceFile: ts.SourceFile,
  indexedPaths: ReadonlySet<string>,
): ModuleGraphEdge[] {
  const edges: ModuleGraphEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push(edgeFromSpecifier(repoRoot, sourceFile.fileName, node.moduleSpecifier.text, "import", indexedPaths));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push(edgeFromSpecifier(repoRoot, sourceFile.fileName, node.moduleSpecifier.text, "export-from", indexedPaths));
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      edges.push(edgeFromSpecifier(repoRoot, sourceFile.fileName, node.arguments[0].text, "dynamic-import", indexedPaths));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return edges;
}

/**
 * Extracts a file-level graph from TypeScript syntax. Only source-relative
 * modules resolve to internal edges; package and unresolved imports stay visible
 * as external edges instead of becoming fabricated repository relationships.
 */
export function buildTypeScriptModuleGraph(
  repoRoot: string,
  generatedForCommit: string,
  inventoryFiles: readonly RepositoryInventoryFile[],
): ModuleGraph {
  const typeScriptFiles = inventoryFiles.filter((file) => file.language === "typescript");
  const indexedPaths = new Set(typeScriptFiles.map((file) => resolve(repoRoot, file.path)));
  const nodes: ModuleGraphNode[] = [];
  const edges: ModuleGraphEdge[] = [];
  const warnings: string[] = [];
  for (const inventoryFile of typeScriptFiles) {
    const absolutePath = resolve(repoRoot, inventoryFile.path);
    try {
      const content = readFileSync(absolutePath, "utf8");
      const sourceFile = ts.createSourceFile(absolutePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      nodes.push({ path: inventoryFile.path, language: "typescript", exports: exportsFromSourceFile(sourceFile), isTest: inventoryFile.kind === "test" });
      edges.push(...collectEdges(repoRoot, sourceFile, indexedPaths));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not parse ${inventoryFile.path}: ${reason}`);
    }
  }
  nodes.sort((left, right) => left.path.localeCompare(right.path));
  edges.sort((left, right) =>
    [left.source, left.target ?? "", left.kind, left.specifier].join("\u0000").localeCompare([right.source, right.target ?? "", right.kind, right.specifier].join("\u0000")),
  );
  return { generatedForCommit, language: "typescript", nodes, edges, warnings: warnings.sort((left, right) => left.localeCompare(right)) };
}

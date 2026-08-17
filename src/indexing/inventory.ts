import { readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { type RepositoryFileKind, type RepositoryInventory, type RepositoryInventoryFile } from "./types.js";

/** Generated artifacts and dependency/build trees are not meaningful target-source evidence. */
export const DEFAULT_IGNORED_DIRECTORIES = [".feature-inventor", ".git", "coverage", "dist", "node_modules"] as const;

function toRepositoryPath(repoRoot: string, absolutePath: string): string {
  return relative(repoRoot, absolutePath).split("\\").join("/");
}

function languageForPath(path: string): string | null {
  switch (extname(path).toLowerCase()) {
    case ".ts":
    case ".tsx":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".svelte":
      return "svelte";
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".md":
    case ".mdx":
      return "markdown";
    case ".css":
      return "css";
    case ".html":
      return "html";
    default:
      return null;
  }
}

function classifyPath(path: string): RepositoryFileKind {
  const filename = path.split("/").at(-1) ?? path;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(filename)) return "test";
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte)$/i.test(filename)) return "source";
  if (/\.(md|mdx)$/i.test(filename)) return "documentation";
  if (
    /\.(json|ya?ml|toml|ini|config\.[cm]?[jt]s)$/i.test(filename) ||
    ["Dockerfile", "Makefile", ".gitignore", ".npmrc"].includes(filename)
  ) {
    return "configuration";
  }
  return "other";
}

function collectFiles(repoRoot: string, directory: string, ignored: ReadonlySet<string>, files: RepositoryInventoryFile[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) collectFiles(repoRoot, join(directory, entry.name), ignored, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const absolutePath = join(directory, entry.name);
    const path = toRepositoryPath(repoRoot, absolutePath);
    const stat = statSync(absolutePath);
    files.push({ path, kind: classifyPath(path), language: languageForPath(path), bytes: stat.size });
  }
}

/**
 * Enumerates only checkout files that can contribute source, documentation, or
 * configuration evidence. The result is sorted and contains no clock-derived data.
 */
export function buildRepositoryInventory(
  repoRoot: string,
  generatedForCommit: string,
  ignoredDirectories: readonly string[] = DEFAULT_IGNORED_DIRECTORIES,
): RepositoryInventory {
  const files: RepositoryInventoryFile[] = [];
  collectFiles(repoRoot, repoRoot, new Set(ignoredDirectories), files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const totals = {
    files: files.length,
    sourceFiles: files.filter((file) => file.kind === "source").length,
    testFiles: files.filter((file) => file.kind === "test").length,
    documentationFiles: files.filter((file) => file.kind === "documentation").length,
    configurationFiles: files.filter((file) => file.kind === "configuration").length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  };
  return { generatedForCommit, files, totals, ignoredDirectories: [...ignoredDirectories] };
}

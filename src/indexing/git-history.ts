import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type HistoricalActivity, type HistoricalFileActivity } from "./types.js";

const execFileAsync = promisify(execFile);

async function readGit(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function parseNumstat(content: string): HistoricalFileActivity[] {
  const files = new Map<string, HistoricalFileActivity>();
  for (const line of content.split("\n")) {
    if (line.trim() === "") continue;
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!match) continue;
    const [, additionsText, deletionsText, path] = match;
    const additions = additionsText === "-" ? 0 : Number(additionsText);
    const deletions = deletionsText === "-" ? 0 : Number(deletionsText);
    const current = files.get(path) ?? { path, commits: 0, additions: 0, deletions: 0, changedLines: 0 };
    current.commits += 1;
    current.additions += additions;
    current.deletions += deletions;
    current.changedLines += additions + deletions;
    files.set(path, current);
  }
  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function cutoffForCommit(commitTimestamp: string, historyDays: number): string {
  const timestamp = Date.parse(commitTimestamp);
  if (!Number.isFinite(timestamp)) throw new Error(`Could not parse target commit timestamp: ${commitTimestamp}`);
  return new Date(timestamp - historyDays * 24 * 60 * 60 * 1_000).toISOString();
}

/**
 * Aggregates activity before the indexed commit, using that commit's timestamp
 * as the rolling-window anchor. This avoids a wall-clock-dependent heatmap.
 */
export async function buildHistoricalActivity(repoRoot: string, generatedForCommit: string, historyDays: number): Promise<HistoricalActivity> {
  try {
    const commitTimestamp = (await readGit(repoRoot, ["show", "-s", "--format=%cI", generatedForCommit])).trim();
    const since = cutoffForCommit(commitTimestamp, historyDays);
    const [numstat, commitCount] = await Promise.all([
      readGit(repoRoot, ["log", generatedForCommit, "--no-renames", `--since=${since}`, "--format=", "--numstat"]),
      readGit(repoRoot, ["rev-list", "--count", generatedForCommit, `--since=${since}`]),
    ]);
    return {
      generatedForCommit,
      historyDays,
      commitsScanned: Number(commitCount.trim()) || 0,
      files: parseNumstat(numstat),
      complete: true,
      warnings: [],
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      generatedForCommit,
      historyDays,
      commitsScanned: 0,
      files: [],
      complete: false,
      warnings: [`Git history could not be collected: ${reason}`],
    };
  }
}

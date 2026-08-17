import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  throw new Error(`Release version preparation failed: ${message}`);
}

function parseArguments(argv) {
  const options = { version: undefined, date: undefined };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--version") {
      options.version = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--date") {
      options.date = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log("Usage: node scripts/prepare-release-version.mjs --version X.Y.Z --date YYYY-MM-DD");
      process.exit(0);
    }
    fail(`unknown argument ${argument}.`);
  }

  if (!options.version || !options.date) {
    fail("--version and --date are both required.");
  }
  if (!SEMVER_PATTERN.test(options.version)) {
    fail(`version ${JSON.stringify(options.version)} must use release semantic version format X.Y.Z.`);
  }
  if (!DATE_PATTERN.test(options.date) || Number.isNaN(Date.parse(`${options.date}T00:00:00Z`))) {
    fail(`date ${JSON.stringify(options.date)} must use valid ISO date format YYYY-MM-DD.`);
  }

  return options;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  writeFileSync(resolve(repositoryRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function prepareReleaseVersion({ argv = process.argv.slice(2) } = {}) {
  const options = parseArguments(argv);
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const changelogPath = resolve(repositoryRoot, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");

  if (packageJson.private !== true) {
    fail('package.json must remain "private": true while this release foundation is validation-only.');
  }
  if (!SEMVER_PATTERN.test(packageJson.version)) {
    fail(`current package version ${JSON.stringify(packageJson.version)} must use release semantic version format X.Y.Z.`);
  }
  if (compareVersions(options.version, packageJson.version) <= 0) {
    fail(`new version ${options.version} must be greater than current version ${packageJson.version}.`);
  }
  if (packageLock.packages?.[""] === undefined) {
    fail("package-lock.json must contain the root package metadata at packages[\"\"].");
  }
  if (!/^## Unreleased\s*$/m.test(changelog)) {
    fail("CHANGELOG.md must contain an Unreleased section to promote.");
  }
  if (changelog.includes(`## [${options.version}] - `)) {
    fail(`CHANGELOG.md already contains a release heading for ${options.version}.`);
  }

  packageJson.version = options.version;
  packageLock.version = options.version;
  packageLock.packages[""].version = options.version;
  const updatedChangelog = changelog.replace(
    /^## Unreleased\s*$/m,
    `## Unreleased\n\n## [${options.version}] - ${options.date}`,
  );

  writeJson("package.json", packageJson);
  writeJson("package-lock.json", packageLock);
  writeFileSync(changelogPath, updatedChangelog, "utf8");

  return { version: options.version, date: options.date };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = prepareReleaseVersion();
    console.log(`Prepared version ${result.version} with changelog date ${result.date}. No tag, artifact, or package was published.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

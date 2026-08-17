import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REQUIRED_PACKAGE_FILES = [
  "dist",
  "README.md",
  "ARCHITECTURE.md",
  "INDEX.md",
  "RELEASING.md",
  "LICENSE",
  "docs/cli",
];
const REQUIRED_PACKED_PATHS = [
  "dist/cli.js",
  "README.md",
  "ARCHITECTURE.md",
  "INDEX.md",
  "RELEASING.md",
  "LICENSE",
  "docs/cli/COMMAND_INTERFACE.md",
  "docs/cli/INSTALLATION_AND_ONBOARDING.md",
  "package.json",
];
const FORBIDDEN_PACKED_PATHS = [
  /^src\//,
  /^scripts\//,
  /^\.github\//,
  /(^|\/)node_modules\//,
  /\.test\.[cm]?[jt]s$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)(?:CHANGELOG|CONTRIBUTING|ROADMAP|RESEARCH|VISION)\.md$/,
];

function fail(message) {
  throw new Error(`Release validation failed: ${message}`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8"));
}

function parseArguments(argv) {
  const options = { release: undefined, tag: undefined };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--release") {
      options.release = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--tag") {
      options.tag = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log("Usage: node scripts/release-validate.mjs [--release VERSION --tag TAG]");
      process.exit(0);
    }
    fail(`unknown argument ${argument}.`);
  }

  if (Boolean(options.release) !== Boolean(options.tag)) {
    fail("--release and --tag must be supplied together.");
  }

  return options;
}

function inspectPackedFiles() {
  const output = execFileSync(npmCommand(), ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const manifest = JSON.parse(output);
  if (!Array.isArray(manifest) || manifest.length !== 1 || !Array.isArray(manifest[0]?.files)) {
    fail("npm pack did not return one inspectable package manifest.");
  }
  return manifest[0].files.map((entry) => entry.path);
}

function assertPackageContract(packageJson) {
  if (packageJson.private !== false) {
    fail('package.json must explicitly declare "private": false for the approved public npm policy.');
  }
  if (!SEMVER_PATTERN.test(packageJson.version)) {
    fail(`package version ${JSON.stringify(packageJson.version)} must use release semantic version format X.Y.Z.`);
  }
  if (packageJson.name !== "feature-inventor") {
    fail('package name must remain "feature-inventor" under the approved public distribution policy.');
  }
  if (packageJson.repository?.url !== "git+https://github.com/taljacob2/feature-inventor.git") {
    fail("package.json must declare the canonical public GitHub repository URL for trusted publishing provenance.");
  }
  if (packageJson.license !== "MIT") {
    fail('package.json must declare the approved MIT license.');
  }
  if (packageJson.author !== "taljacob2") {
    fail('package.json must declare taljacob2 as the approved package owner.');
  }
  if (packageJson.publishConfig?.access !== "public") {
    fail('package.json must declare public npm access.');
  }
  if (packageJson.publishConfig?.provenance !== true) {
    fail('package.json must require npm provenance for public publication.');
  }
  if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org") {
    fail('package.json must target the public npm registry at https://registry.npmjs.org.');
  }
  if (packageJson.bin?.["feature-inventor"] !== "dist/cli.js") {
    fail('package.json must expose the "feature-inventor" CLI through dist/cli.js.');
  }
  if (packageJson.engines?.node !== ">=22") {
    fail('package.json must retain the supported Node declaration ">=22".');
  }

  const missingPackageFiles = REQUIRED_PACKAGE_FILES.filter((requiredPath) => !packageJson.files?.includes(requiredPath));
  if (missingPackageFiles.length > 0) {
    fail(`package files allowlist is missing ${missingPackageFiles.join(", ")}.`);
  }
}

function assertChangelogContract(changelog, packageVersion, requestedRelease, requestedTag) {
  if (!/^## Unreleased\s*$/m.test(changelog)) {
    fail("CHANGELOG.md must contain a top-level '## Unreleased' section for the next release.");
  }

  if (requestedRelease === undefined) {
    return;
  }

  if (requestedRelease !== packageVersion) {
    fail(`requested release ${requestedRelease} does not match package.json version ${packageVersion}.`);
  }
  if (!SEMVER_PATTERN.test(requestedRelease)) {
    fail(`requested release ${requestedRelease} must use release semantic version format X.Y.Z.`);
  }
  if (requestedTag !== `v${requestedRelease}`) {
    fail(`requested tag ${requestedTag} must equal v${requestedRelease}.`);
  }

  const releasedHeading = new RegExp(`^## \\[${requestedRelease.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
  if (!releasedHeading.test(changelog)) {
    fail(`CHANGELOG.md must contain a dated heading '## [${requestedRelease}] - YYYY-MM-DD' before an artifact release.`);
  }
}

function assertPackedContent(paths) {
  const missingPaths = REQUIRED_PACKED_PATHS.filter((requiredPath) => !paths.includes(requiredPath));
  if (missingPaths.length > 0) {
    fail(`npm package is missing required files: ${missingPaths.join(", ")}.`);
  }

  const forbiddenPaths = paths.filter((path) => FORBIDDEN_PACKED_PATHS.some((pattern) => pattern.test(path)));
  if (forbiddenPaths.length > 0) {
    fail(`npm package contains forbidden files: ${forbiddenPaths.join(", ")}.`);
  }
}

export function validateRelease({ argv = process.argv.slice(2) } = {}) {
  const options = parseArguments(argv);
  const packageJson = readJson("package.json");
  const changelog = readFileSync(resolve(repositoryRoot, "CHANGELOG.md"), "utf8");

  if (!existsSync(resolve(repositoryRoot, "dist", "cli.js"))) {
    fail("dist/cli.js is missing. Run npm run build before release validation.");
  }

  assertPackageContract(packageJson);
  assertChangelogContract(changelog, packageJson.version, options.release, options.tag);
  const packedPaths = inspectPackedFiles();
  assertPackedContent(packedPaths);

  return {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    packedFileCount: packedPaths.length,
    release: options.release ?? null,
    tag: options.tag ?? null,
    publicNpmPolicy: packageJson.private === false && packageJson.license === "MIT" && packageJson.publishConfig?.access === "public",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateRelease();
    console.log(`Release validation passed for ${result.packageName}@${result.packageVersion} (${result.packedFileCount} packed files).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

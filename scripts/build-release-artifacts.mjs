import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRelease } from "./release-validate.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(`Release artifact build failed: ${message}`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function git(args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function parseArguments(argv) {
  const options = { output: "release-artifacts", release: undefined, tag: undefined };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }
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
      console.log("Usage: node scripts/build-release-artifacts.mjs [--output DIRECTORY] [--release VERSION --tag TAG]");
      process.exit(0);
    }
    fail(`unknown argument ${argument}.`);
  }

  if (Boolean(options.release) !== Boolean(options.tag)) {
    fail("--release and --tag must be supplied together.");
  }

  return options;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
}

function assertCleanCheckout() {
  const changes = git(["status", "--porcelain"]);
  if (changes.length > 0) {
    fail("working tree is not clean. Commit, stash, or discard changes before creating provenance-bearing release artifacts.");
  }
}

export function buildReleaseArtifacts({ argv = process.argv.slice(2) } = {}) {
  const options = parseArguments(argv);
  const outputDirectory = resolve(repositoryRoot, options.output);
  const validation = validateRelease({
    argv: options.release ? ["--release", options.release, "--tag", options.tag] : [],
  });
  assertCleanCheckout();

  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  execFileSync(npmCommand(), ["pack", "--ignore-scripts", "--pack-destination", outputDirectory], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });

  const tarballs = readdirSync(outputDirectory).filter((fileName) => fileName.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    fail(`expected exactly one npm tarball, found ${tarballs.length}.`);
  }

  const packageJson = readPackageJson();
  const tarball = tarballs[0];
  const tarballPath = resolve(outputDirectory, tarball);
  const checksum = sha256(tarballPath);
  const sourceCommit = git(["rev-parse", "HEAD"]);
  const sourceRef = process.env.GITHUB_REF ?? git(["symbolic-ref", "--short", "HEAD"]);
  const provenance = {
    schemaVersion: 1,
    package: {
      name: packageJson.name,
      version: packageJson.version,
      private: packageJson.private,
      tarball,
      sha256: checksum,
    },
    source: {
      commit: sourceCommit,
      ref: sourceRef,
    },
    release: options.release ? { version: options.release, tag: options.tag } : null,
    validation,
    publication: {
      npmPublishAttempted: false,
      githubPackagesPublishAttempted: false,
      githubReleaseCreated: false,
    },
  };

  writeFileSync(resolve(outputDirectory, "checksums.txt"), `${checksum}  ${tarball}\n`, "utf8");
  writeFileSync(resolve(outputDirectory, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  return { outputDirectory, tarball, checksum, provenance };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = buildReleaseArtifacts();
    console.log(`Release artifacts created in ${result.outputDirectory}: ${result.tarball} and checksums.txt.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

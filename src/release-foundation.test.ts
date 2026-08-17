import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoots: string[] = [];

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "feature-inventor-release-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "docs", "cli"), { recursive: true });
  copyFileSync(resolve(repositoryRoot, "scripts", "release-validate.mjs"), join(root, "scripts", "release-validate.mjs"));
  copyFileSync(resolve(repositoryRoot, "scripts", "build-release-artifacts.mjs"), join(root, "scripts", "build-release-artifacts.mjs"));
  copyFileSync(resolve(repositoryRoot, "scripts", "prepare-release-version.mjs"), join(root, "scripts", "prepare-release-version.mjs"));

  const packageJson = {
    name: "feature-inventor",
    version: "0.2.0",
    private: false,
    license: "MIT",
    author: "taljacob2",
    publishConfig: { access: "public", provenance: true, registry: "https://registry.npmjs.org" },
    repository: { type: "git", url: "git+https://github.com/taljacob2/feature-inventor.git" },
    type: "module",
    engines: { node: ">=22" },
    files: ["dist", "README.md", "ARCHITECTURE.md", "INDEX.md", "RELEASING.md", "LICENSE", "docs/cli"],
    bin: { "feature-inventor": "dist/cli.js" },
  };
  const packageLock = {
    name: packageJson.name,
    version: packageJson.version,
    lockfileVersion: 3,
    requires: true,
    packages: { "": packageJson },
  };
  writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(join(root, "package-lock.json"), `${JSON.stringify(packageLock, null, 2)}\n`);
  writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n### Added\n\n- Fixture note.\n\n## [0.2.0] - 2026-08-17\n\n### Added\n\n- Fixture release.\n");
  writeFileSync(join(root, "dist", "cli.js"), "#!/usr/bin/env node\nconsole.log('fixture');\n");
  writeFileSync(join(root, "README.md"), "# Feature Inventor\n");
  writeFileSync(join(root, "ARCHITECTURE.md"), "# Architecture\n");
  writeFileSync(join(root, "INDEX.md"), "# Index\n");
  writeFileSync(join(root, "RELEASING.md"), "# Releasing\n");
  writeFileSync(join(root, "LICENSE"), "MIT License\n");
  writeFileSync(join(root, "docs", "cli", "COMMAND_INTERFACE.md"), "# Command interface\n");
  writeFileSync(join(root, "docs", "cli", "INSTALLATION_AND_ONBOARDING.md"), "# Installation\n");
  return root;
}

function runNode(root: string, script: string, args: string[] = []) {
  return execFileSync(process.execPath, [join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("validation-only release foundation", () => {
  it("validates a public MIT package, a matching versioned changelog, and its restricted tarball", () => {
    const root = createFixture();

    const output = runNode(root, "release-validate.mjs", ["--release", "0.2.0", "--tag", "v0.2.0"]);

    expect(output).toContain("Release validation passed for feature-inventor@0.2.0");
  });

  it("rejects a private package because public npm release metadata is required", () => {
    const root = createFixture();
    const packagePath = join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { private: boolean };
    packageJson.private = true;
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    expect(() => runNode(root, "release-validate.mjs", ["--release", "0.2.0", "--tag", "v0.2.0"])).toThrow(
      /must explicitly declare "private": false/,
    );
  });

  it("rejects a release tag that does not correspond to the selected version", () => {
    const root = createFixture();

    expect(() => runNode(root, "release-validate.mjs", ["--release", "0.2.0", "--tag", "v0.2.1"])).toThrow(
      /must equal v0\.2\.0/,
    );
  });

  it("promotes Unreleased notes with an explicit higher version and date without publishing", () => {
    const root = createFixture();
    const changelogPath = join(root, "CHANGELOG.md");
    writeFileSync(changelogPath, "# Changelog\n\n## Unreleased\n\n### Added\n\n- Prepared change.\n");

    const output = runNode(root, "prepare-release-version.mjs", ["--version", "0.2.1", "--date", "2026-08-17"]);
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
    const packageLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
      version: string;
      packages: Record<string, { version: string }>;
    };

    expect(output).toContain("No tag, artifact, or package was published");
    expect(packageJson.version).toBe("0.2.1");
    expect(packageLock.version).toBe("0.2.1");
    expect(packageLock.packages[""]?.version).toBe("0.2.1");
    expect(readFileSync(changelogPath, "utf8")).toContain("## [0.2.1] - 2026-08-17");
  });

  it("rejects artifact generation from a dirty checkout because a commit cannot honestly identify uncommitted contents", () => {
    const root = createFixture();
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Release Fixture"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
    writeFileSync(join(root, "README.md"), "# Changed after commit\n");

    expect(() => runNode(root, "build-release-artifacts.mjs", ["--output", "release-artifacts"])).toThrow(
      /working tree is not clean/,
    );
    expect(existsSync(join(root, "release-artifacts"))).toBe(false);
  });

  it("creates a tarball, checksum, and provenance record after validation without registry publication", () => {
    const root = createFixture();
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Release Fixture"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });

    const output = runNode(root, "build-release-artifacts.mjs", ["--output", "release-artifacts", "--release", "0.2.0", "--tag", "v0.2.0"]);
    const provenance = JSON.parse(readFileSync(join(root, "release-artifacts", "provenance.json"), "utf8")) as {
      publication: Record<string, boolean>;
    };

    expect(output).toContain("Release artifacts created");
    expect(existsSync(join(root, "release-artifacts", "feature-inventor-0.2.0.tgz"))).toBe(true);
    expect(readFileSync(join(root, "release-artifacts", "checksums.txt"), "utf8")).toMatch(
      /^[a-f0-9]{64}  feature-inventor-0\.2\.0\.tgz\n$/,
    );
    expect(provenance.publication).toEqual({
      npmPublishAttempted: false,
      githubPackagesPublishAttempted: false,
      githubReleaseCreated: false,
    });
  });

  it("keeps artifact preparation non-publishing while making public npm publication a separately manual OIDC-gated workflow", () => {
    const workflow = readFileSync(resolve(repositoryRoot, ".github", "workflows", "release.yml"), "utf8");
    const workflowDocument = parseDocument(workflow);
    const publishWorkflow = readFileSync(resolve(repositoryRoot, ".github", "workflows", "publish.yml"), "utf8");
    const publishWorkflowDocument = parseDocument(publishWorkflow);
    const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
      private: boolean;
      license: string;
      author: string;
      scripts: Record<string, string>;
      publishConfig?: { access?: string; provenance?: boolean; registry?: string };
      repository: { url: string };
    };

    expect(workflowDocument.errors).toEqual([]);
    expect(publishWorkflowDocument.errors).toEqual([]);
    expect(workflowDocument.toJSON()).toMatchObject({
      name: "Prepare release artifacts",
      jobs: {
        "prepare-artifacts": { "runs-on": "ubuntu-latest" },
        "create-draft-release": { "runs-on": "ubuntu-latest" },
      },
    });
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("create_draft_release:");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("sha256sum --check checksums.txt");
    expect(workflow).toContain("--draft");
    expect(workflow).not.toMatch(/\bnpm\s+publish\b/);
    expect(workflow).not.toContain("npm.pkg.github.com");
    expect(publishWorkflowDocument.toJSON()).toMatchObject({
      name: "Publish package to npm",
      jobs: {
        publish: { "runs-on": "ubuntu-latest", environment: "npm-publication" },
      },
    });
    expect(publishWorkflow).toContain("workflow_dispatch:");
    expect(publishWorkflow).toContain("publish_confirmation:");
    expect(publishWorkflow).toContain("id-token: write");
    expect(publishWorkflow).toContain("npm install --global npm@^11.15.0");
    expect(publishWorkflow).toContain("TARBALL=\"release-artifacts/feature-inventor-${RELEASE_VERSION}.tgz\"");
    expect(publishWorkflow).toContain("npm publish \"$TARBALL\" --provenance --access public");
    expect(publishWorkflow).not.toContain("NPM_TOKEN");
    expect(publishWorkflow).not.toContain("NODE_AUTH_TOKEN");
    expect(publishWorkflow).not.toContain("npm.pkg.github.com");
    expect(packageJson.private).toBe(false);
    expect(packageJson.repository.url).toBe("git+https://github.com/taljacob2/feature-inventor.git");
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.author).toBe("taljacob2");
    expect(packageJson.publishConfig).toEqual({
      access: "public",
      provenance: true,
      registry: "https://registry.npmjs.org",
    });
    expect(packageJson.scripts["release:dry-run"]).toContain("release:artifacts");
  });
});

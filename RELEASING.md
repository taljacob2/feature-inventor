# Releasing Feature Inventor

Feature Inventor is an **MIT-licensed public npm package** owned by `taljacob2`. The approved public package identity is `feature-inventor`, published only to `https://registry.npmjs.org`. GitHub Packages is not part of the public installation path.

> **Publication boundary:** A reproducible artifact proves that one revision built and packaged correctly. A public npm publication is a separate, intentionally irreversible action that requires an exact version, tag, protected environment approval, and typed confirmation.

## Distribution Policy

| Stage | Channel | Purpose | Status |
|---|---|---|---|
| Local evidence | `npm run release:dry-run` | Builds, tests, validates, packages, checksums, and records provenance on one clean checkout. | Enabled |
| Release review | GitHub Actions artifact | Shares the exact validated tarball, checksum, and source provenance. | Enabled |
| Curated handoff | Draft GitHub Release | Optionally attaches the validated artifacts to a draft release. | Enabled only through an explicit workflow input |
| Public CLI distribution | Public npm | Delivers the unscoped `feature-inventor` CLI using the normal `npm install --global feature-inventor` path after the first package version is published. | Policy and guarded workflow enabled; no version published yet |
| Authenticated private registry | GitHub Packages | Would require a scoped package name and installer authentication. | Disabled |
| Standalone executables | Platform-specific binary builds | Requires separate packaging, signing, and update design. | Deferred |

The package metadata explicitly declares `private: false`, `license: "MIT"`, `author: "taljacob2"`, public npm access, provenance, and the npmjs registry. The release validator rejects drift from this policy.

## Artifact Contract

A successful artifact run produces exactly one npm tarball and two evidence files.

| File | Purpose | Verification |
|---|---|---|
| `feature-inventor-VERSION.tgz` | Installable npm package for the validated source revision. | Check its SHA-256 value against `checksums.txt`. |
| `checksums.txt` | SHA-256 digest manifest for the tarball. | Run `sha256sum --check checksums.txt` on Linux or macOS, or compare the digest with a Windows SHA-256 tool. |
| `provenance.json` | Machine-readable package version, commit, source ref, validation outcome, checksum, and pre-publication state. | Inspect it before accepting or sharing an artifact. |

The validator requires the public CLI entry point, Node.js declaration, MIT license, public npm metadata, documentation allowlist, compiled `dist/cli.js`, `CHANGELOG.md` discipline, and exclusion of source tests, automation files, and environment files from the tarball. Artifact generation fails closed when `git status --porcelain` reports uncommitted changes, because a commit-based provenance record cannot honestly identify an artifact built from a dirty checkout.

## Local Release Preparation

Use these commands on a clean branch. They never create a Git tag, a GitHub Release, or an npm registry publication.

| Goal | Command | Result |
|---|---|---|
| Build, test, validate, and package current source | `npm run release:dry-run` | A local `release-artifacts/` directory containing the tarball, checksum, and provenance. |
| Check only package metadata and content | `npm run release:validate` | Confirms the MIT public-npm contract and current Unreleased changelog policy. |
| Prepare the next release version | `npm run release:version -- --version X.Y.Z --date YYYY-MM-DD` | Updates `package.json`, `package-lock.json`, and promotes Unreleased notes into a dated version heading. |
| Validate one intended release | `npm run release:validate -- --release X.Y.Z --tag vX.Y.Z` | Requires matching version, tag format, and dated changelog entry. |
| Build release artifacts for one intended release | `npm run release:artifacts -- --release X.Y.Z --tag vX.Y.Z --output release-artifacts` | Produces the integrity evidence without publishing. |

The version-preparation command requires a higher `X.Y.Z` version and explicit ISO date. It does not select a version, create a tag, or publish a package.

## Artifact Review Workflow

The **Prepare release artifacts** workflow is manual. It validates the selected version and tag, runs locked dependency installation, build and tests, checks artifact integrity, and uploads the tarball, checksum, and provenance record. It can create a **draft** GitHub Release only when the explicit input requests it. It never publishes a package registry version.

## Public npm Publishing Workflow

The **Publish package to npm** workflow is also manual. It accepts an exact committed version and existing matching tag, then requires the operator to type `publish VERSION` exactly. It runs in the GitHub `npm-publication` environment, checks that the tag resolves to the selected source commit, installs locked dependencies, rebuilds and retests, validates the package, and rechecks artifact checksums before publishing.

The workflow uses GitHub Actions OIDC with `id-token: write`, not a stored npm token. It installs npm 11.15 or later, which npm currently requires for trusted publishing. Once configured as npm’s trusted publisher, the public repository and public package receive automatic provenance attestations. [1]

> **Environment protection:** The repository’s `npm-publication` environment is configured with `taljacob2` as its required reviewer. Self-review remains allowed because this is currently a sole-maintainer repository; add an independent reviewer and enable self-review prevention when a second trusted maintainer is available. The workflow is intentionally not an automatic release trigger.

## First Public Version: One-Time Bootstrap

The package does not yet exist on npm. npm’s trusted-publisher configuration requires the package to already exist, write access to that package, npm 11.15 or later, and account-level two-factor authentication. [2] Consequently, the **first** public version is a separate operator-owned bootstrap action.

| Step | Required action | Owner |
|---|---|---|
| 1 | Select the exact first version and date, then run `release:version`, review the resulting changes, commit them, and create the matching `vVERSION` tag. | Maintainer |
| 2 | Perform the first `npm publish --provenance --access public` from the clean, tagged checkout using the `taljacob2` npm account and its interactive authentication. | Maintainer after separate explicit publication confirmation |
| 3 | Configure GitHub Actions as the trusted publisher for the now-existing package: `npm trust github feature-inventor --file publish.yml --repository taljacob2/feature-inventor --environment npm-publication --allow-publish`. | Maintainer with npm 11.15+ and 2FA |
| 4 | Restrict traditional token publishing in npm package settings and retain the workflow as the normal public publish path. | Maintainer |
| 5 | Use the guarded GitHub workflow for later versions, after the exact version, tag, and release approval are prepared. | Maintainer |

The first publish is deliberately **not** automated in this repository. It creates the permanent public package identity and must receive a separate, exact confirmation that names the version and `https://registry.npmjs.org` as the target. The later trusted-publishing workflow contains no `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret.

## Installation and Integrity Verification

After the first public release, users install the CLI with:

```bash
npm install --global feature-inventor
feature-inventor --version
```

Before public publication, a reviewer can test the exact artifact rather than a registry package:

```bash
sha256sum --check checksums.txt
npm install --global ./feature-inventor-X.Y.Z.tgz
feature-inventor --version
```

For packages published with npm provenance, consumers can use `npm audit signatures` to verify registry signatures and available attestations. [3]

## Changelog Discipline

`CHANGELOG.md` begins with `## Unreleased`. Keep user-visible and operator-visible changes there until the maintainer selects an exact version. `release:version` promotes those notes into `## [X.Y.Z] - YYYY-MM-DD`; the validator requires that heading before an intended release is accepted.

## Non-Goals

This policy does not enable GitHub Packages, automatically select versions, automatically tag commits, automatically publish to npm, build standalone binaries, or replace code review. The maintained control points are the pull request, version preparation, tag creation, GitHub environment approval, typed workflow confirmation, and separate first-publication confirmation.

## References

[1]: https://docs.npmjs.com/trusted-publishers/ "npm Docs: Trusted publishing for npm packages"
[2]: https://docs.npmjs.com/cli/v11/commands/npm-trust/ "npm Docs: npm trust"
[3]: https://docs.npmjs.com/generating-provenance-statements/ "npm Docs: Generating provenance statements"

# Releasing Feature Inventor

Feature Inventor currently uses a **validation-only release foundation**. It creates a reproducible npm tarball and integrity evidence, but it does not publish the package to npm, GitHub Packages, or any other package registry. This is intentional: public distribution requires an explicit license, ownership, and support-policy decision.

> **Release boundary:** A release artifact is proof that a particular source revision built, tested, and packaged correctly. It is not permission to publish the package, expose a registry, or alter the project’s distribution policy.

## Current Distribution Policy

| Stage | Supported channel | Purpose | Status |
|---|---|---|---|
| Local evidence | `npm run release:dry-run` | Builds, tests, validates, packages, checksums, and records provenance on one checkout. | Enabled |
| Collaborator review | GitHub Actions artifact | Shares the exact validated tarball, `checksums.txt`, and `provenance.json` from a manually triggered workflow. | Enabled |
| Curated private handoff | Draft GitHub Release | Optionally attaches the already-validated files to a draft release. It is never automatic. | Enabled by an explicit workflow input |
| Private package registry | GitHub Packages | Requires a future deliberate adoption decision and package-name migration. | Disabled |
| Public CLI distribution | npm registry | Requires a license, final package ownership, and a public-release decision. | Disabled |
| Standalone executables | Platform-specific binary builds | Requires a separate packaging and signing design. | Deferred |

The package retains `"private": true`, and the release validator fails if that guard is removed. The repository also contains no `publishConfig` and no command or workflow step that invokes `npm publish`.

## Artifact Contract

A successful artifact run produces exactly one npm tarball and two evidence files.

| File | Purpose | Verification |
|---|---|---|
| `feature-inventor-VERSION.tgz` | Installable npm package for the validated source revision. | Check its SHA-256 value against `checksums.txt`. |
| `checksums.txt` | SHA-256 digest manifest for the tarball. | Run `sha256sum --check checksums.txt` on Linux or macOS, or compare the digest with a Windows SHA-256 tool. |
| `provenance.json` | Machine-readable package version, commit, source ref, validation outcome, checksum, and publication-state record. | Inspect before accepting or sharing an artifact. |

The package validator requires the public CLI entry point, Node.js support declaration, documentation allowlist, compiled `dist/cli.js`, `CHANGELOG.md` discipline, and absence of source tests, automation files, and environment files from the packed tarball. The package is built with `npm pack --ignore-scripts` only after the source has already been built and validated. Artifact generation also fails closed when `git status --porcelain` reports uncommitted changes, because a commit-based provenance record cannot honestly identify an artifact built from a dirty checkout.

## Local Release Preparation

Use the following workflow to prepare evidence on a clean branch. The commands never create a Git tag, a GitHub release, or a package-registry publication.

| Goal | Command | Result |
|---|---|---|
| Build, test, validate, and package the current checkout | `npm run release:dry-run` | A local `release-artifacts/` directory containing the tarball, checksum, and provenance. |
| Run only the metadata and package-content gate | `npm run release:validate` | Confirms current private-package and Unreleased changelog policy. |
| Prepare the next semantic version | `npm run release:version -- --version X.Y.Z --date YYYY-MM-DD` | Updates `package.json`, `package-lock.json`, and promotes the Unreleased changelog notes. |
| Validate a specific intended release | `npm run release:validate -- --release X.Y.Z --tag vX.Y.Z` | Requires matching package version, changelog heading, and tag format. |
| Build artifacts for a specific intended release | `npm run release:artifacts -- --release X.Y.Z --tag vX.Y.Z --output release-artifacts` | Produces the integrity-checked evidence files. |

The version-preparation command requires a higher `X.Y.Z` version than the current package version and an explicit ISO date. It does not choose dates, infer versions, create tags, or change `private`. Before using an artifact release, confirm that the selected tag is new and that the version does not conflict with existing project history.

## GitHub Artifact Workflow

The **Prepare release artifacts** workflow is intentionally available only through manual dispatch. Supply the exact version and matching `vVERSION` tag already committed in `package.json` and `CHANGELOG.md`. It checks that the tag does not yet exist, runs `npm ci`, builds, tests, validates metadata and package contents, creates checksummed artifacts, verifies the checksum, and uploads those evidence files.

The default path ends with an Actions artifact. An operator may explicitly set **Create draft GitHub release** to `true`. Only then does a second job download the same artifact, reverify its checksum, and create a **draft** GitHub Release targeted at the selected commit. The workflow has no package-registry credentials and no registry publish command.

GitHub’s workflow-dispatch mechanism supports manually supplied inputs, which is why this is appropriate for an operator-owned release gate rather than an automatic event-driven publisher. [1]

## Integrity and Installation Verification

A reviewer should verify the evidence before installation. On Linux or macOS, run the checksum command from the artifact directory, then inspect provenance.

```bash
sha256sum --check checksums.txt
cat provenance.json
```

For a temporary local installation test, use the verified file path rather than a registry name.

```bash
npm install --global ./feature-inventor-X.Y.Z.tgz
feature-inventor --version
```

Remove the test installation with `npm uninstall --global feature-inventor` when finished. This install path is intended for trusted collaborators reviewing a downloaded release artifact; it does not establish a public installation channel.

## Changelog Discipline

`CHANGELOG.md` begins with `## Unreleased`. Keep user-visible and operator-visible changes there while work remains unreleased. Before a release artifact is prepared for a version, use `release:version` to create the dated heading `## [X.Y.Z] - YYYY-MM-DD`. The version, matching tag, and dated changelog heading must agree before the workflow accepts an intended release.

The existing historical log is preserved because it documents governed feature work. Future version headings complement that history by giving installers and reviewers one stable release-level summary.

## Explicit Gates Before Registry Publishing

Publication remains disabled until a maintainer deliberately makes every decision in the following table and changes the validator, package metadata, workflow, and documentation in the same reviewed change.

| Decision | Why it is required | Minimum implementation change after approval |
|---|---|---|
| License | Determines what downstream users may legally do with the source and package. | Add the selected `LICENSE` file and package metadata. |
| Package ownership | Defines which maintainer account or organization controls publication and recovery. | Verify registry ownership and two-factor authentication outside the repository. |
| Public identity | Confirms whether `feature-inventor` remains available or a scoped public name is required. | Set the approved final package name and update installation documentation. |
| Distribution channel | Decides public npm, authenticated private registry, or both. | Add a narrowly scoped publish path only for the selected channel. |
| Release authority | Identifies who may turn a draft into a public release or publish a package. | Configure repository permissions and workflow protection accordingly. |
| Support and security policy | Defines where users report defects and security issues after distribution. | Publish and link issue, security, and support guidance. |

**Public npm** is the intended future public CLI channel because it gives normal npm users the familiar installation flow. **GitHub Packages** remains a possible future private-collaborator channel, but GitHub’s npm registry uses scoped package names and requires authentication for package installation, including public packages. [2] A package-name migration and installer configuration would therefore be part of any later GitHub Packages decision.

## Non-Goals of This Foundation

This foundation does not automatically tag commits, create public releases, publish package versions, build standalone binaries, sign artifacts, or decide a license. It also does not replace governed proposals, runtime verification, or pull-request review. It makes release preparation repeatable while preserving those separate controls.

## References

[1]: https://docs.github.com/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_dispatch "GitHub Docs: workflow_dispatch"
[2]: https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-npm-registry "GitHub Docs: Working with the npm registry"

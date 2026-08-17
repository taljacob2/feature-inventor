# Installation and First-Run Onboarding

Feature Inventor is a Node.js CLI that supports **Node 22 or later**. The current distribution foundation is designed to work on Linux, macOS, and Windows because the executable, path handling, cleanup script, and command parsing are implemented in Node rather than shell-specific wrappers.

## Current Installation Paths

The repository is currently package-ready but intentionally remains private in npm metadata. That protects users from depending on an unpublished or unlicensed registry package while release ownership and the public licensing decision are completed.

For development or evaluation, clone the repository and install from source:

```sh
git clone https://github.com/taljacob2/feature-inventor.git
cd feature-inventor
npm install
npm run build
```

You can invoke the built CLI directly:

```sh
node dist/cli.js help
node dist/cli.js overview
```

For a development command available on your PATH, use the npm-managed local link:

```sh
npm link
feature-inventor help
```

`npm link` uses a symlink, so rebuilding after a Git update updates the linked command. Remove it with `npm unlink -g feature-inventor`.

## First Run in a Target Repository

From the root of the repository you want to govern, run:

```sh
feature-inventor init
```

In an interactive terminal, the command detects Git origin and branch values when available, asks for the remaining operator-owned settings, writes `feature-inventor.target.json`, and prints the next safe steps. It never starts an agent, changes source code, creates a proposal, or schedules background work.

The initial manifest uses intentionally conservative defaults:

| Field | Initial value | Rationale |
|---|---|---|
| Human approval | Required | No proposal is authorized merely by initialization. |
| Schedule | `manual` | Initialization never enables background work. |
| Protected paths | Empty | The operator must deliberately declare protected scope. |
| Required checks | One explicit command supplied by the operator | The tool does not guess a repository’s validation command. |
| Indexing | Enabled locally; automatic preparation disabled | Context is available without silently attaching or executing work. |

After initialization, run:

```sh
feature-inventor doctor
feature-inventor overview
feature-inventor plan
```

## Automation-Safe Initialization

Automation must not rely on terminal prompts. Supply every policy-defining value and declare `--non-interactive`:

```sh
feature-inventor init --non-interactive \
  --repository https://github.com/OWNER/REPOSITORY.git \
  --default-branch main \
  --goal "Improve release reliability" \
  --check "npm test" \
  --format json
```

The command rejects missing values, duplicate options, unknown options, and any attempt to overwrite an existing manifest without `--force`. JSON initialization requires `--non-interactive`, ensuring prompts can never contaminate a machine-readable stream.

## Operator Controls

Use `--no-indexing` to initialize a manifest without the optional local indexing policy. Use `--max-files COUNT` to establish the initial review-change cap. Use `--force` only after inspecting an existing manifest and intentionally deciding to replace it.

> `init` writes configuration only. It does not authorize a run. A proposal must still be created explicitly, validated, and reviewed through the governed lifecycle.

## Public npm Release Boundary

The package now has a public executable declaration, Node engine requirement, repository metadata, restricted package files, a runtime TypeScript compiler dependency, and a portable `prepack` build. A public registry release is intentionally deferred until the maintainer chooses a license, changes the npm privacy setting deliberately, verifies package ownership, and establishes release/versioning policy.

At that point, the intended user-facing installation command is:

```sh
npm install -g feature-inventor
```

Native executables and a full-screen terminal UI are later distribution layers. They must preserve this Node/npm path and the scriptable non-interactive CLI as supported first-class interfaces.

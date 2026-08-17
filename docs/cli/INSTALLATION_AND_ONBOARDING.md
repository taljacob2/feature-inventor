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

In an interactive terminal, the command detects Git origin and branch values when available, asks for the remaining operator-owned settings, writes `feature-inventor.target.json`, and prints the next safe steps. It also creates a minimal `ROADMAP.md` only when one is absent, and in a Git checkout it locally ignores generated `.feature-inventor/` artifacts through Git metadata rather than editing the tracked `.gitignore`. It never starts an agent, changes application source code, creates a proposal, or schedules background work.

The initial manifest uses intentionally conservative defaults:

| Field | Initial value | Rationale |
|---|---|---|
| Human approval | Required | No proposal is authorized merely by initialization. |
| Schedule | `manual` | Initialization never enables background work. |
| Protected paths | Empty | The operator must deliberately declare protected scope. |
| Required checks | One explicit command supplied by the operator | The tool does not guess a repository’s validation command. |
| Indexing | Enabled locally; automatic preparation disabled | Context is available without silently attaching or executing work. |
| Roadmap | Empty `ROADMAP.md` scaffold when absent | Planning has a visible operator-owned queue without inventing a candidate. |
| Generated artifacts | Local `.feature-inventor/` Git exclude when available | Commit-pinned snapshots do not make a target checkout appear dirty. |

After initialization, run:

```sh
feature-inventor doctor
feature-inventor docs validate
# Add one reviewed item under ROADMAP.md > Now or Next.
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

The command rejects missing values, duplicate options, unknown options, and any attempt to overwrite an existing manifest without `--force`. It never overwrites an existing `ROADMAP.md`, including when `--force` replaces the manifest. JSON initialization requires `--non-interactive`, ensuring prompts can never contaminate a machine-readable stream.

## Operator Controls

Use `--no-indexing` to initialize a manifest without the optional local indexing policy. Use `--max-files COUNT` to establish the initial review-change cap. Use `--force` only after inspecting an existing manifest and intentionally deciding to replace it.

> `init` writes a target contract and, only when absent, an empty operator roadmap. It does not authorize a run. A proposal must still be created explicitly, validated, and reviewed through the governed lifecycle.

## Public npm Release Boundary

The package has an MIT license, public npm metadata, restricted package files, a runtime TypeScript compiler dependency, reproducible artifact validation, and a manually protected OIDC publication workflow. The first registry version remains deliberately unpublished until the maintainer performs the separately confirmed one-time release bootstrap.

At that point, the intended user-facing installation command is:

```sh
npm install -g feature-inventor
```

Native executables and a full-screen terminal UI are later distribution layers. They must preserve this Node/npm path and the scriptable non-interactive CLI as supported first-class interfaces.

## Shell Completion

Feature Inventor can print completion scripts for Bash, Zsh, Fish, and PowerShell:

```sh
feature-inventor completion bash
feature-inventor completion zsh
feature-inventor completion fish
feature-inventor completion powershell
```

The command only writes the script to standard output. It does not inspect, modify, or source a shell profile. Review the generated script before making it persistent.

| Shell | Test for the current session | Typical persistent installation |
|---|---|---|
| Bash | `source <(feature-inventor completion bash)` | Save the output in your distribution’s Bash completion directory, such as `~/.local/share/bash-completion/completions/feature-inventor`, then open a new shell. |
| Zsh | `source <(feature-inventor completion zsh)` | Save the output as `_feature-inventor` in a directory on `fpath`, then run `autoload -U compinit && compinit` in your Zsh configuration. |
| Fish | `feature-inventor completion fish | source` | Save the output as `~/.config/fish/completions/feature-inventor.fish`; Fish loads this location automatically. |
| PowerShell | `$script = feature-inventor completion powershell; Invoke-Expression $script` | Save the output to a reviewed script file and dot-source it from your PowerShell profile if you choose to load it automatically. |

Completion scripts suggest commands, subcommands, global options, and selected command-specific options. They do not submit forms, create proposals, start runtimes, or alter target repositories.

## Guided Setup Polish

Guided `init` now labels each question with its governance purpose. The confirmation states what was written and explicitly confirms that no runtime, proposal, source change, or schedule was created. The non-interactive path remains unchanged and is the supported route for CI, scripts, and machine-readable JSON output.

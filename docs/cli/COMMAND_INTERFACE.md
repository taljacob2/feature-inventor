# Command Interface Foundation

Feature Inventor exposes a governed command-line interface for one target repository at a time. The command interface is deliberately split into a stable automation surface and an optional progressive visual layer. Human-readable output can improve over time, but command semantics, proposal immutability, evidence gates, and runtime authorization remain outside the presentation layer.

## Entry Points

New users should begin with `feature-inventor init`, `feature-inventor overview`, and `feature-inventor doctor`. `init` creates an explicit local target manifest through a guided interactive flow or a fully explicit non-interactive command; it never starts a runtime or creates a proposal. `overview` is the official orientation command. It summarizes the local queue, recent governed runs, and one next safe action. It neither starts a runtime nor creates a proposal. See [INSTALLATION_AND_ONBOARDING.md](INSTALLATION_AND_ONBOARDING.md) for installation, first-run, and automation details.

The existing `status` command remains a compatibility alias. It preserves the older detailed status renderer and its existing JSON contract. Runtime-specific aliases, including `manus run` and `claude run`, remain available; the runtime-neutral `run --runtime ID --run RUN_ID` command is the primary execution path. `completion` prints a generated script only; installation, sourcing, and profile modification remain explicit operator actions documented in [INSTALLATION_AND_ONBOARDING.md](INSTALLATION_AND_ONBOARDING.md).

| Need | Recommended command |
|---|---|
| Create the local target contract | `feature-inventor init` |
| Print a reviewed shell completion script | `feature-inventor completion bash|zsh|fish|powershell` |
| Understand the repository state | `feature-inventor overview` |
| Validate prerequisites without changes | `feature-inventor doctor` |
| Inspect candidate work | `feature-inventor plan` |
| Create a reviewable proposal | `feature-inventor propose` |
| Run one approved proposal | `feature-inventor run --runtime ID --run RUN_ID` |
| Inspect lifecycle evidence | `feature-inventor journal RUN_ID` |
| Complete evidence and review | `feature-inventor verify`, `review`, and `finalize` |

## Global Presentation Controls

Global controls can appear before or after the command. They are removed before command-specific parsing so existing command grammar remains compatible.

| Control | Meaning |
|---|---|
| `--format human|json|plain` | Select the renderer. `json` is stable machine-oriented output; `plain` is a low-format human fallback. |
| `--json` | Compatibility shorthand for `--format json`. Do not combine it with `--format`. |
| `--color auto|always|never` | Configure future human-color rendering without changing JSON or plain output. |
| `--motion auto|reduce|off` | Configure future optional progress motion. Motion is disabled in JSON and plain modes. |
| `--non-interactive` | Declare that no prompt may be used when future guided commands introduce prompts. |
| `--cwd PATH` | Target a repository without requiring shell-specific directory changes. |

All JSON output remains free of progress redraws and ANSI styling. The CLI detects terminal interactivity, color restrictions, Unicode suitability, width, and reduced-motion preference in a platform-neutral module. Current commands retain their proven renderers while this capability boundary enables later visual upgrades.

## Help and Discoverability

`feature-inventor help` and `feature-inventor --help` display grouped discovery-focused help. `feature-inventor help propose` and `feature-inventor propose --help` provide focused examples. Help is non-mutating and never launches a runtime.

## Compatibility Commitment

The first CLI modernization release preserves existing command names, proposal behavior, runtime adapter routing, index behavior, journal behavior, and JSON result structures. The new command foundation is additive. Compatibility aliases will remain documented through at least the first major public CLI release.

## Full-Screen TUI Status

A full-screen `feature-inventor tui` command is intentionally not included in this foundation. A dashboard may be added after the command core, package distribution, shell completions, non-interactive path, and cross-platform acceptance matrix are stable. It will be optional and will never be the only way to inspect or authorize governed work.

# Command Interface Foundation

Feature Inventor exposes a governed command-line interface for one target repository at a time. The command interface is deliberately split into a stable automation surface and an optional progressive visual layer. Human-readable output can improve over time, but command semantics, proposal immutability, evidence gates, and runtime authorization remain outside the presentation layer.

## Entry Points

New users should begin with `feature-inventor init`, `feature-inventor overview`, and `feature-inventor doctor`. `init` creates an explicit local target manifest through a guided interactive flow or a fully explicit non-interactive command; it never starts a runtime or creates a proposal. `overview` is the official orientation command. It summarizes the local queue, recent governed runs, and one next safe action. It neither starts a runtime nor creates a proposal. `tui` is an optional full-screen human dashboard over the same read-only state; it does not replace `overview` for automation. See [INSTALLATION_AND_ONBOARDING.md](INSTALLATION_AND_ONBOARDING.md) for installation, first-run, and automation details.

The existing `status` command remains a compatibility alias. It preserves the older detailed status renderer and its existing JSON contract. Runtime-specific aliases, including `manus run` and `claude run`, remain available; the runtime-neutral `run --runtime ID --run RUN_ID` command is the primary execution path. When an immutable proposal requires human approval, `run` fails closed until a matching `approve` record has been written and journaled. `completion` prints a generated script only; installation, sourcing, and profile modification remain explicit operator actions documented in [INSTALLATION_AND_ONBOARDING.md](INSTALLATION_AND_ONBOARDING.md).

| Need | Recommended command |
|---|---|
| Create the local target contract | `feature-inventor init` |
| Print a reviewed shell completion script | `feature-inventor completion bash|zsh|fish|powershell` |
| Understand the repository state | `feature-inventor overview` |
| Open the optional full-screen human dashboard | `feature-inventor tui` |
| Validate prerequisites without changes | `feature-inventor doctor` |
| Inspect candidate work | `feature-inventor plan` |
| Create a reviewable proposal | `feature-inventor propose` |
| Record a human reviewer decision for a protected proposal | `feature-inventor approve RUN_ID --reviewer NAME --note TEXT` |
| Run one approved proposal | `feature-inventor run --runtime ID --run RUN_ID` |
| Inspect lifecycle evidence | `feature-inventor journal RUN_ID` |
| Complete evidence and review | `feature-inventor verify`, `review`, and `finalize` |

## Human Approval Contract

`approve` records a reviewer identifier, a review note, and the exact proposal identity: run ID, base commit, manifest hash, and policy hash. The record is written locally as `approval.json` and its digest is appended to the run journal as `approval-recorded`. A protected launch accepts only an approval that matches the immutable proposal and is present in that journal.

Approval is a local attestation, not identity proof or a replacement for pull-request review. Reviewers should follow [HUMAN_REVIEW_GUIDE.md](HUMAN_REVIEW_GUIDE.md) before approving and should still use repository branch protection and independent pull-request review for any source change that will be shared.

## Global Presentation Controls

Global controls can appear before or after the command. They are removed before command-specific parsing so existing command grammar remains compatible.

| Control | Meaning |
|---|---|
| `--format human|json|plain` | Select the renderer. `json` is stable machine-oriented output; `plain` is a low-format human fallback. |
| `--json` | Compatibility shorthand for `--format json`. Do not combine it with `--format`. |
| `--color auto|always|never` | Configure human color rendering, including the optional TUI, without changing JSON or plain output. |
| `--motion auto|reduce|off` | Configure optional progress motion. The current TUI is static and therefore does not animate. Motion is disabled in JSON and plain modes. |
| `--non-interactive` | Declare that no prompt may be used when future guided commands introduce prompts. |
| `--cwd PATH` | Target a repository without requiring shell-specific directory changes. |

All JSON output remains free of progress redraws and ANSI styling. The CLI detects terminal interactivity, color restrictions, Unicode suitability, width, and reduced-motion preference in a platform-neutral module. Current commands retain their proven renderers while this capability boundary enables later visual upgrades.

## Help and Discoverability

`feature-inventor help` and `feature-inventor --help` display grouped discovery-focused help. `feature-inventor help propose`, `feature-inventor propose --help`, `feature-inventor help approve`, `feature-inventor approve --help`, and `feature-inventor help tui` provide focused examples. Help is non-mutating and never launches a runtime.

## Compatibility Commitment

The first CLI modernization release preserves existing command names, proposal behavior, runtime adapter routing, index behavior, journal behavior, and JSON result structures. The new command foundation is additive. Compatibility aliases will remain documented through at least the first major public CLI release.

## Full-Screen TUI

`feature-inventor tui` is an optional keyboard-first governed command center for an interactive human terminal. It presents the same queue, governed-run, approval, and journal state used by `overview` and `journal`, and can hand validated argv to every supported CLI command, including approval, run, watch, recover, stop, verification, review, finalization, scheduling, and runtime aliases. It refuses non-interactive, JSON, and plain modes; use direct CLI commands for those use cases. Read-only inspection commands run directly; lifecycle-changing commands display their exact argv and require a typed `EXECUTE COMMAND` phrase. The TUI invokes no shell, rejects `--cwd` and shell operators, always retains the current target repository, and never bypasses proposal, approval, evidence, or runtime policy checks. See [FULL_SCREEN_TUI.md](FULL_SCREEN_TUI.md) for the complete operating and accessibility guide.

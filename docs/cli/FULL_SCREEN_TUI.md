# Full-Screen TUI

`feature-inventor tui` is an **optional interactive dashboard** for inspecting Feature Inventor state in a terminal. It is a presentation layer over the established CLI contracts, not a second automation engine. It preserves the normal command-line interface for scripts, CI, and users who prefer explicit commands.

## Start and Fallback

Open the dashboard from an interactive human terminal:

```sh
feature-inventor tui
```

The TUI requires a TTY and human-readable output. It intentionally rejects `--non-interactive`, `--format json`, and `--format plain`. In those contexts, use the equivalent scriptable orientation command instead:

```sh
feature-inventor overview --format json
```

The dashboard uses an alternate terminal screen and restores the normal terminal screen when it exits. A terminal of at least **80 columns by 24 rows** presents the full layout. Smaller terminals show a compact resize notice and keep the `Q` exit shortcut available.

## Dashboard Views and Keyboard Controls

| Key | Effect | Safety boundary |
|---|---|---|
| `D` | Open the dashboard. | Read-only. |
| `R` | Open governed runs. | Read-only. |
| Up / Down | Select a governed run. | Read-only. |
| Enter | Open the selected run’s append-only journal summary. | Read-only. |
| Esc | Return from detail, help, or confirmation views. | Cancels pending action text. |
| `U` | Refresh current repository state. | Read-only. |
| `H` or `?` | Open keyboard help. | Read-only. |
| `B` | Start the local index-build confirmation flow. | Requires typing `BUILD INDEX`. |
| `P` | Start the proposal-creation confirmation flow. | Requires typing `CREATE PROPOSAL`. |
| `Q` or Ctrl+C | Exit and restore the normal terminal. | Does not modify repository state. |

The run list displays each run’s lifecycle status, reviewer-approval state, review readiness, and scheduled runtime evidence. The detail view shows only existing append-only journal events. It does not create, alter, or delete journal evidence.

## Explicit Action Boundaries

The first TUI release exposes only two local actions: `index build` and `propose`. Each requires an exact typed phrase, then runs the normal CLI command after leaving the alternate screen. Its ordinary output remains available in terminal scrollback.

> **The TUI never offers runtime launch, reviewer approval, verification recording, review-packet generation, finalization, scheduler start, remote push, pull-request creation, merge, deployment, or publication controls.**

This deliberately keeps high-impact operations in the explicit CLI workflow, where their existing proposal, approval, evidence, and repository protections remain visible. To launch a reviewed proposal, follow the [Human Review Guide](HUMAN_REVIEW_GUIDE.md) and use the documented `feature-inventor run --runtime ADAPTER_ID --run RUN_ID` command.

## Accessibility and Presentation

The TUI supports keyboard-only navigation and uses text labels in addition to color. `--color never` disables color styling, while `--motion reduce` and `--motion off` remain accepted presentation controls. The current interface has no animation, no sound, no image rendering, and no mouse requirement.

The implementation is dependency-free and uses the Node 22 terminal APIs already available to Feature Inventor. This avoids adding a separate UI framework, keeps the published package compact, and keeps the non-interactive CLI behavior unchanged.

## Operational Recommendation

Use the TUI for orientation, queue inspection, governed-run triage, and deliberate handoff into the standard CLI. Use command-line JSON or plain output for automation, CI, scripts, accessibility tooling that does not work with alternate terminal screens, or any workflow that requires reproducible machine-readable results.

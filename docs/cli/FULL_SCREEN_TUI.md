# Full-Screen TUI

`feature-inventor tui` is an **optional interactive governed command center** for a single target repository. It presents the same repository, proposal, approval, journal, and review state as the command-line interface, then hands selected commands back to the established CLI. It does not create a second runtime, a shell, or a bypass around existing governance policy.

## Start and Fallback

Open the command center from an interactive human terminal:

```sh
feature-inventor tui
```

The TUI requires a TTY and human-readable output. It intentionally rejects `--non-interactive`, `--format json`, and `--format plain`. In those contexts, use direct commands such as:

```sh
feature-inventor overview --format json
feature-inventor run --runtime manus --run RUN_ID
```

The TUI uses an alternate terminal screen and restores the normal terminal screen when it exits. A terminal of at least **80 columns by 24 rows** presents the full layout. Smaller terminals show a compact resize notice and keep the `Q` exit shortcut available.

## Dashboard Views and Keyboard Controls

| Key | Effect | Safety boundary |
|---|---|---|
| `D` | Open the dashboard. | Read-only. |
| `C` | Open the governed command center. | Accepts Feature Inventor argv only, never a shell command. |
| `G` | Pre-fill `run --runtime manus --run RUN_ID` for the selected run. | Requires typed confirmation and the existing approval gate. |
| `A` | Pre-fill `approve RUN_ID --reviewer NAME --note TEXT` for the selected run. | Requires completing reviewer identity and rationale, then typed confirmation. |
| `S` | Pre-fill `stop`. | Requires typed confirmation; `stop --cancel` must also be entered deliberately. |
| `R` | Open governed runs. | Read-only. |
| Up / Down | Select a governed run. | Read-only. |
| Enter | Open the selected run’s append-only journal summary. | Read-only. |
| Esc | Return from detail, help, command, or confirmation views. | Cancels pending command text or confirmation. |
| `U` | Refresh current repository state. | Read-only. |
| `H` or `?` | Open keyboard help. | Read-only. |
| `B` | Start the local index-build confirmation flow. | Requires typing `BUILD INDEX`. |
| `P` | Start the proposal-creation confirmation flow. | Requires typing `CREATE PROPOSAL`. |
| `Q` or Ctrl+C | Exit and restore the normal terminal. | Does not modify repository state. |

The run list displays each run’s lifecycle status, reviewer-approval state, review readiness, and scheduled runtime evidence. The detail view shows only existing append-only journal events. It does not create, alter, or delete journal evidence.

## Calling Commands from the TUI

Press `C`, then enter a normal Feature Inventor command **without** the `feature-inventor` prefix. The command center accepts every top-level command recognized by the CLI and passes a validated argv vector to that same CLI after any required confirmation.

| Need | Command-center input |
|---|---|
| Inspect a repository | `overview`, `doctor`, `plan`, `journal --run RUN_ID`, or `recap --all` |
| Build or inspect index data | `index build`, `index status`, `index report`, `index heatmap --by centrality` |
| Create a proposal | `propose` |
| Record human approval | `approve RUN_ID --reviewer NAME --note "Reviewed scope and checks."` |
| Start a runtime | `run --runtime manus --run RUN_ID` or `run --runtime claude --run RUN_ID` |
| Observe or recover a runtime | `watch --run RUN_ID` or `recover --run RUN_ID` |
| Record and complete evidence | `capture --run RUN_ID`, `verify --run RUN_ID --check "npm test"`, `review --run RUN_ID`, or `finalize --run RUN_ID` |
| Request a stop | `stop` or `stop --cancel` |
| Create a schedule handoff | `schedule handoff --run RUN_ID --runtime manus` |

Read-only inspection commands leave the alternate screen, run normally, and return to a refreshed dashboard. Commands that can create evidence, start or stop work, modify lifecycle state, or invoke a runtime first show the exact argv preview and require a typed phrase in the form **`EXECUTE COMMAND`** or **`EXECUTE COMMAND SUBCOMMAND`**. For example, `run --runtime manus --run RUN_ID` requires `EXECUTE RUN`; `stop` requires `EXECUTE STOP`; and `index build` requires `EXECUTE INDEX BUILD` when entered through the command center.

The existing CLI remains authoritative after confirmation. For example, a `run` command still fails until its immutable proposal has matching human approval, verification and finalization commands still require their evidence, and a remote- or provider-backed action still follows its existing repository and runtime policy.

> **The TUI does not invoke a shell.** It tokenizes ordinary quoted command values into an argv vector, rejects shell operators such as `|`, `&&`, and `;`, rejects `--cwd`, and always executes in the target repository that opened the dashboard. It also refuses nested `tui` sessions.

Ordinary CLI output appears in terminal scrollback while the TUI temporarily leaves its alternate screen. When the command finishes, the dashboard returns and refreshes its state. Use the direct CLI when command output needs to remain in view, an operation is designed to be long-running, automation needs structured output, or a terminal accessibility tool does not support alternate screens.

## Accessibility and Presentation

The TUI supports keyboard-only navigation and uses text labels in addition to color. `--color never` disables color styling, while `--motion reduce` and `--motion off` remain accepted presentation controls. The current interface has no animation, no sound, no image rendering, and no mouse requirement.

The implementation is dependency-free and uses the Node 22 terminal APIs already available to Feature Inventor. This keeps the published package compact and preserves the scriptable non-interactive CLI as a first-class interface.

## Operational Recommendation

Use the TUI for orientation, run triage, controlled lifecycle handoff, and interactive work. Use direct command-line JSON or plain output for automation, CI, scripts, long-running observation, accessibility tooling that does not work with alternate terminal screens, or any workflow requiring reproducible machine-readable results.

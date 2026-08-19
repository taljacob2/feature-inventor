# Full-Screen TUI

`feature-inventor tui` is an **optional interactive workspace** for a single target repository. It is designed to make the safe next step obvious for a new operator while preserving the complete Feature Inventor command surface for an experienced one.

The workspace is a presentation and navigation layer over the established CLI. It does not create a second runtime, invoke a shell, or bypass proposal, approval, verification, review, finalization, or repository policy.

## Start and Fallback

Open the workspace from an interactive human terminal:

```sh
feature-inventor tui
```

The TUI requires a TTY and human-readable output. It intentionally rejects `--non-interactive`, `--format json`, and `--format plain`. Use direct CLI commands for scriptable, machine-readable, long-running, or alternate-screen-incompatible work:

```sh
feature-inventor overview --format json
feature-inventor run --runtime manus --run RUN_ID
```

The workspace uses an alternate terminal screen and restores the normal terminal on exit. A terminal of at least **80 columns by 24 rows** shows the full experience. Smaller terminals show a compact resize notice and retain `Q` and Ctrl+C exit behavior.

## A Calm Home for New Operators

The home screen deliberately shows only four visible choices and one **Next safe step**. It does not list every command, run event, or key binding at once.

| Key | Path | What it helps you do |
|---|---|---|
| `1` | Plan an improvement | Inspect the queue, build current repository context, and create an immutable proposal. |
| `2` | Govern a run | Review a run, record approval, launch approved work, observe it, and complete evidence. |
| `3` | Review governed runs | Browse lifecycle state, reviewer readiness, and append-only evidence. |
| `/` | Find any command | Open the searchable command palette for every common and advanced feature. |

The **Next safe step** is derived from existing repository state. It prioritizes a pending approval, then active work, then the first planned improvement, then a health check. It never invents work or performs an action automatically.

## Guided Workflows

The guided views reveal only the steps relevant to the current job.

### Plan an improvement

Press `1`, then select the next numbered step:

| Step | Action prepared | Effect |
|---|---|---|
| `1` | `plan` | Inspect the approved improvement queue. |
| `2` | `index build` | Build a local commit-pinned repository index. |
| `3` | `propose` | Create an immutable proposal and initial journal. No runtime starts. |

### Govern a run

Press `2` to move through run review, approval, launch, observation, verification, review, and finalization. Press `S` at any time to prepare a graceful `stop` request. A cancellation requires the separate explicit `stop --cancel` command.

The run list is available through `3` or `R`. Use Up/Down to select a run and Enter to view its durable evidence. Contextual shortcuts prepare, but never immediately execute, the common lifecycle commands:

| Key | Prepared command |
|---|---|
| `A` | `approve RUN_ID --reviewer NAME --note "Reviewed scope and checks."` |
| `G` | `run --runtime manus --run RUN_ID` |
| `S` | `stop` |

## Search Every Capability

Press `/` to open the **Command Palette**. It groups concise, human-readable actions into **Start here**, **Plan safely**, **Govern a run**, and **Advanced**. Type to filter, use Up/Down to choose a result, and press Enter to continue.

The palette makes common actions discoverable without requiring syntax memorization. It also provides **Enter any Feature Inventor command** for the complete supported CLI surface. Select it or any template with placeholders to open the focused command editor.

The editor accepts a normal Feature Inventor command **without** the `feature-inventor` prefix. For example:

```text
run --runtime manus --run RUN_ID
approve RUN_ID --reviewer NAME --note "Reviewed scope and checks."
verify --run RUN_ID --check "npm test"
review --run RUN_ID
finalize --run RUN_ID
schedule handoff --run RUN_ID --runtime manus
```

Quoted values preserve spaces. The editor tokenizes input into an argv vector and passes it directly to Feature Inventor. It never invokes a shell, rejects shell operators such as `|`, `&&`, and `;`, rejects `--cwd`, prevents nested TUI sessions, and always operates in the repository that opened the workspace.

## Confirmation and Governance

Read-only commands such as `overview`, `doctor`, `plan`, `journal`, `recap`, and index inspection leave the alternate screen, run normally, and return to a refreshed workspace.

Commands that can create evidence, start or stop work, change lifecycle state, or invoke a runtime show their exact argv preview and require a typed phrase in the form **`EXECUTE COMMAND`** or **`EXECUTE COMMAND SUBCOMMAND`**. For example, `run --runtime manus --run RUN_ID` requires `EXECUTE RUN`; `stop` requires `EXECUTE STOP`; and `index build` requires `EXECUTE INDEX BUILD` when started from the editor.

> **TUI confirmation is an additional interaction boundary, not a replacement for governance.** After confirmation, the ordinary CLI remains authoritative. A run still requires a valid proposal and human approval; verification, review, and finalization still require their existing evidence; and runtime, provider, protected-path, and repository policies still apply.

CLI output appears in terminal scrollback while the TUI temporarily leaves its alternate screen. When the command finishes, the workspace returns and refreshes repository state.

## Keyboard and Accessibility

| Key | Effect |
|---|---|
| `D` or Esc | Return home from a guided view, run list, detail, palette, or help. |
| `U` | Refresh repository state. |
| `?` | Open the concise keyboard guide. |
| `Q` or Ctrl+C | Exit and restore the normal terminal. |
| Up/Down and Enter | Navigate lists, palette results, and run details. |

The workspace supports keyboard-only navigation and uses meaningful text labels in addition to color. `--color never` removes color styling. `--motion reduce` and `--motion off` are accepted presentation controls. The interface has no animation, sound, image rendering, or mouse requirement.

## Operational Recommendation

Use the TUI for orientation, guided execution, run triage, and deliberate lifecycle handoff. Use direct command-line JSON or plain output for automation, CI, scripts, long-running observation, terminal accessibility tooling that does not work with alternate screens, or work that requires reproducible machine-readable output.

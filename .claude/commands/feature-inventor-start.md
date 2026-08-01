---
description: Start a real feature-inventor nightly loop run via the Workflow tool
---

Run `workflows/nightly.js` through the `Workflow` tool. This is a real run, not a simulation — it
will research, prioritize, implement, verify, and commit to the `nightly` branch of this repo.

Before invoking:
- Confirm the repo's working tree is clean (`git status --short`) — if not, ask the user whether to
  proceed anyway, since the loop commits on top of whatever is currently checked out.
- Ask the user whether they want non-default `args` (all optional): `maxFeatures` (default `3`),
  `branchName` (default `"nightly"`), `repoRoot` (only needed if this session's working directory
  isn't the feature-inventor repo itself — normally leave unset and let `resolveRepoRoot()` in the
  script detect it).

Then call the `Workflow` tool with `scriptPath` pointing at `workflows/nightly.js` (or `name` if it's
registered as a saved workflow) and pass any `args` gathered above.

Remind the user of the safety boundary while this runs: the loop only ever commits to the disposable
`nightly` branch, never touches `main`/`master`, and never pushes to a remote — a human still needs to
review and merge. When it finishes, point the user at `feature-inventor recap` (or
`/feature-inventor-recap`) to see what happened, and `git log nightly` / `git diff main...nightly` to
review the actual changes before merging anything.

This skill assumes a human is present to answer its confirmation questions above. Confirmed live
(2026-08-02): a `feature-inventor daemon`-spawned headless run reached for this skill and deadlocked
forever waiting for an answer nobody could give — `--dangerously-skip-permissions` bypasses Claude
Code's permission prompts, not this skill's own confirmation step. `feature-inventor daemon`'s spawn
prompt now explicitly tells it to skip this skill and invoke the `Workflow` tool directly instead; if
you're invoking this skill from any other unattended/non-interactive context, do the same.

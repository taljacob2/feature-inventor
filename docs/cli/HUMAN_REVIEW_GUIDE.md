# Human Review Guide

Feature Inventor treats a proposal as a **reviewable plan**, not as permission to modify a repository. A protected proposal requires a reviewer-attested approval record before any supported runtime can launch. The approval is bound to the proposal’s run ID, default-branch commit, manifest hash, and policy hash. If that identity changes, the approval cannot authorize the changed work.

> An approval record is a durable local attestation by the person who has shell access. It does **not** prove organizational identity or replace GitHub pull-request review, branch protection, change-management approval, or access control.

## When Review Is Required

A proposal needs approval before launch when either its frozen target policy has `humanApprovalRequired: true` or its risk policy requires explicit review. The latter applies, for example, when an approved feature is marked with a manual-review risk tag or touches a protected path.

| Approval state | Meaning | Safe next action |
|---|---|---|
| `pending` | The proposal requires a reviewer decision but has no valid approval record. | Review the proposal and approve it, or leave it unexecuted. |
| `approved` | A reviewer record matches the immutable proposal and is recorded in the append-only journal. | Launch only through the governed runtime path, if execution is desired. |
| `invalid` | An approval file is malformed, does not match the proposal, or is absent from the journal. | Do not launch. Create a new proposal or investigate the evidence mismatch. |
| `not-required` | Neither the frozen proposal policy nor its risk record requires pre-launch approval. | Normal runtime and evidence gates still apply. |

## Pre-Launch Review Procedure

First, inspect the proposal and its lifecycle record. Use a run ID returned by `feature-inventor propose`.

```sh
feature-inventor journal RUN_ID
cat .feature-inventor/runs/RUN_ID/proposal.json
```

Confirm that the target repository URL, default branch, and `baseCommit` are expected. Review every queued candidate, the declared remote-push policy, required checks, context-pack reference when present, and the risk-verification record. A reviewer should reject or defer a proposal when its scope is unclear, its required checks are insufficient, its context is stale, or it crosses an unwanted provider, credential, deployment, database, or protected-path boundary.

| Review item | What the reviewer should verify |
|---|---|
| Repository identity | The URL and default branch are the intended target, and the base commit is the one reviewed. |
| Candidate scope | The queue contains only the intended small change; no unrelated candidate is silently bundled. |
| Execution policy | Isolated-worktree and remote-push restrictions are appropriate for the repository. |
| Risk evidence | Manual-review reasons and risk tags are understood, especially external service and data boundaries. |
| Verification | Every required check is meaningful and practical for the intended change. |
| Context | A context pack, if attached, matches the base commit; omitted or overflowed source must be reviewed directly. |

When the reviewer accepts the exact proposal, record the decision with a stable reviewer identifier and a concise rationale:

```sh
feature-inventor approve RUN_ID \
  --reviewer "your-github-handle" \
  --note "Reviewed candidate scope, provider boundary, and required checks."
```

This writes `.feature-inventor/runs/RUN_ID/approval.json` and appends an `approval-recorded` event to `events.jsonl`. It does not start a runtime, create a worktree, modify application source, push a branch, or finalize the run.

The runtime command now fails closed when required approval is missing, invalid, or no longer matches the proposal:

```sh
feature-inventor run --runtime manus --run RUN_ID
```

A proposal may have only one recorded approval. If its base commit, manifest, policy, scope, or required checks need to change, create a **new proposal** and review it again. Do not edit approval files or proposal files to reuse an old decision.

## Post-Execution Review and Finalization

Pre-launch approval authorizes a bounded execution attempt. It does not approve the resulting implementation. After a runtime stops, collect the runtime outcome and record evidence for every proposal-required check.

```sh
feature-inventor verify RUN_ID --check "npm test" --passed --evidence "CI or local command output reviewed on YYYY-MM-DD."
feature-inventor review RUN_ID
```

The generated `review-packet.json` distinguishes `pending`, `blocked`, and `ready-to-finalize` states. Review the isolated worktree diff, runtime result, check evidence, file-count policy, and any risk-specific evidence before finalization. Only then run:

```sh
feature-inventor finalize RUN_ID --confirm
```

Finalization writes append-only lifecycle events locally. It does not merge a branch or bypass the target repository’s normal pull-request and branch-protection process. If a target change should be shared, create a separate review branch and follow that repository’s established review process.

## Review Boundaries and Escalation

Do not approve a proposal solely because it is generated by an AI runtime or because required commands pass. Escalate for a domain owner, security reviewer, or repository maintainer when the work changes authorization, credentials, billing, data retention, deployment, database schema, destructive operations, personal data, safety controls, or external provider behavior.

For GitHub-hosted repositories, use this local gate **in addition to** protected branches and independent pull-request approval. The local approval record proves that a specific Feature Inventor proposal was reviewed; GitHub review proves that the final source change is acceptable to the repository’s maintainers. Both controls serve different purposes.

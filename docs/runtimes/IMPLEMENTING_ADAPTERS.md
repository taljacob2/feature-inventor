# Implementing Runtime Adapters

## Purpose

Feature Inventor is a governed execution platform, not a collection of unrelated agent wrappers. A runtime adapter translates between one execution engine and the platform’s shared run contract. This guide explains how to add or maintain an adapter, including a future adapter for Codex, without changing proposal governance, evidence rules, or finalization behavior.

The authoritative extension boundary is the `RuntimeAdapter` interface in `src/runtimes/types.ts`. Registered adapters are selected through `RuntimeRegistry`; the shared core then owns proposal pinning and governed lifecycle handling.

> **Core rule:** An adapter may translate provider work into a normalized handle and observation. It must not directly write the governed journal, create a review packet, decide review readiness, finalize a run, or broaden a proposal.

## Architecture and ownership

The repository deliberately separates provider mechanics from governed product behavior.

| Layer | Owns | Must not own |
|---|---|---|
| `src/core/` | Proposal and environment validation, normalized lifecycle updates, evidence derivation, review readiness, and finalization gates. | Provider API requests, CLI binaries, provider credentials, or provider-specific status formats. |
| `src/runtimes/types.ts` | The normalized contract shared by every adapter. | Individual provider implementations. |
| `src/runtimes/registry.ts` | Adapter registration, discovery, duplicate prevention, and unknown-runtime errors. | Business policy or journal mutation. |
| `src/runtimes/<provider>.ts` | Provider-specific preflight, launch translation, optional passive observation, and normalized result translation. | Final review decisions and direct journal writes. |
| `src/cli.ts` | User-facing parsing and compatibility aliases. | Duplicated provider lifecycle orchestration. |

The execution path is intentionally uniform:

```text
propose
  -> immutable RunProposal
  -> run --runtime ID --run RUN_ID
  -> shared GovernedRunService
  -> registered RuntimeAdapter
  -> normalized RunHandle / RuntimeObservation
  -> append-only journal
  -> runtime-result.json
  -> review packet
  -> explicit local finalization
```

## Before implementing an adapter

An adapter should be added only when the provider can satisfy the existing governed contract. Do not create a special exception path simply because a provider has weaker controls.

| Requirement | Minimum behavior |
|---|---|
| **Proposal pinning** | The provider must receive and honor the exact approved base commit and bounded candidate queue. |
| **Isolation** | When the proposal requires isolation, the provider must execute in a dedicated workspace, worktree, or equivalent isolated environment. |
| **Structured result** | The provider, or the adapter around it, must return a valid shared `runtime-result.json` artifact. |
| **Verification evidence** | Required commands must be executed and their factual outcomes returned in the result artifact. |
| **Remote safety** | Pushes, pull requests, merges, releases, and deployments must be forbidden unless a future explicitly governed capability allows them. |
| **Recovery** | An asynchronous provider must expose enough state to produce idempotent observations tied to a stable provider event ID. |

If a candidate provider cannot meet one of these requirements, leave it unregistered. A clear refusal is safer and easier to maintain than a partial adapter.

## The adapter contract

Every adapter implements `RuntimeAdapter`.

```ts
export interface RuntimeAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: RuntimeCapabilities;

  preflight(context: RuntimeLaunchContext): Promise<void>;
  launch(context: RuntimeLaunchContext): Promise<RuntimeLaunchResult>;
  observe?(context: RuntimeObserveContext): Promise<RuntimeObservation>;
}
```

### Stable ID and capabilities

Use a lowercase, hyphenated ID such as `codex`, `claude`, or `manus`. IDs are registry-owned strings rather than a hard-coded core union, so a new provider does not require editing generic domain types.

Capabilities are security declarations, not marketing labels. They are checked by the core before launch.

| Capability | Meaning |
|---|---|
| `isolatedWorktree` | The adapter can satisfy a proposal that requires an isolated workspace. |
| `asynchronousObservation` | The provider may continue after launch and supports passive observation. |
| `structuredResult` | The adapter can produce a result compatible with the shared runtime-result schema. |
| `localRepositoryAccess` | The provider uses a local checkout rather than only a remote/provider workspace. |
| `remoteEffects` | Declare `forbidden`, `explicit-only`, or `unsupported`; do not silently widen this claim. |

### Preflight

`preflight` validates provider-specific requirements after the core has loaded the immutable proposal and checked repository identity and base commit. Typical checks include an API key, installed CLI binary, required connector ID, or a provider feature needed for structured output.

A preflight must be fast and fail before the provider creates a task, worktree, session, or remote side effect. It must never modify the target repository.

### Launch

`launch` translates the normalized request into provider work and returns a `RuntimeLaunchResult`.

A `RunHandle` gives the core one durable identity for the execution. For local runtimes it normally includes a worktree path and branch. For remote runtimes it normally includes the provider task ID and task URL. The handle must not contain secrets.

A synchronous runtime can return a final `RuntimeObservation` immediately. An asynchronous runtime should return `observation: null` after creating its handle; its `observe` implementation performs later passive polling.

### Observe

`observe` is optional because some local runtimes complete synchronously. It must be passive: it may fetch status, logs, or structured results, but it must not send messages, approve confirmations, provide credentials, retry a blocked tool call, or mutate a remote repository.

Every observation should include a stable `sourceEventId` when the provider exposes one. The governed journal uses this to prevent duplicate recovery events.

## Step-by-step implementation workflow

### 1. Create a provider module

Create `src/runtimes/<provider>.ts`. Keep provider request payloads, executable invocations, and response parsing inside this file. Do not import journal-writing helpers into it.

```ts
import type { RuntimeAdapter } from "./types.js";

export function createCodexAdapter(): RuntimeAdapter {
  return {
    id: "codex",
    displayName: "Codex",
    capabilities: {
      isolatedWorktree: true,
      asynchronousObservation: false,
      structuredResult: true,
      localRepositoryAccess: true,
      remoteEffects: "forbidden",
    },
    async preflight(context) {
      // Verify provider availability and reject unsupported policy requests.
    },
    async launch(context) {
      // Create or select only the proposal-pinned workspace.
      // Invoke the provider without permission-bypass or remote-write options.
      // Validate and return a normalized handle and observation.
      throw new Error("Implement provider launch");
    },
  };
}
```

This example is intentionally incomplete. A provider adapter is complete only after it is registered, conformance-tested, and able to produce the shared result artifact.

### 2. Register the adapter centrally

Add the provider to `src/runtimes/builtins.ts` if it is a first-party runtime. This is the only place that should know which first-party adapters are included by default.

```ts
export function createBuiltInRuntimeRegistry(): RuntimeRegistry {
  return new RuntimeRegistry()
    .register(createClaudeAdapter())
    .register(createManusAdapter())
    .register(createCodexAdapter());
}
```

Do not add another `if (runtime === "codex")` path to the core service or CLI. The generic command is already available:

```bash
feature-inventor run --runtime codex --run RUN_ID
```

### 3. Use the proposal exactly as persisted

The `RunProposal` is the approved boundary. Use its queue, required checks, policy, base commit, manifest hash, and policy hash exactly as stored. Do not recalculate priority, query a new backlog, substitute the latest branch tip, or append unrelated candidate work.

For a local adapter, confirm the base commit before creating the worktree. For a remote adapter, include the commit and repository identity in the provider request and require the runtime result to report the actual checked-out commit.

### 4. Produce the shared result artifact

Use `src/runtime-result.ts` as the single artifact definition. A valid result reports:

| Field group | Purpose |
|---|---|
| Identity | Run ID, approved base commit, and actual checked-out commit bind work to the reviewed proposal. |
| Workspace | Worktree path and dedicated branch demonstrate isolation. |
| Candidate outcome | Title, shipped/abandoned/blocked outcome, and factual summary. |
| Verification | Each command and factual pass, fail, or not-run outcome. |
| Change evidence | Local commit SHA, patch summary, and blockers. |
| Remote effects | `remotePushed: false` and no review URL for the current governed paths. |

The adapter must validate the result against the proposal before presenting it to the core. A provider’s natural-language success message is not evidence.

### 5. Implement passive observation only when needed

For an asynchronous provider, add `observe`. Translate provider status into the normalized states `started`, `waiting`, `completed`, `failed`, or `awaiting-review`. Preserve provider event IDs and timestamps in the observation metadata.

The observation method is a read operation. If a provider reports an action awaiting human confirmation, return `waiting` or `awaiting-review`. Never approve it programmatically.

The Manus adapter is the reference asynchronous implementation. Its `observe` method performs one read-only task-status request, translates the provider event into a normalized `RuntimeObservation`, and preserves the provider source event ID. `GovernedRunService` converts that observation into the journal event, so the adapter itself cannot finalize a run or write a duplicate lifecycle transition. A future asynchronous adapter should follow this shape.

## Conformance requirements

Add provider tests and extend the shared conformance suite. A new adapter is acceptable only when all of the following are demonstrated.

| Test | Expected outcome |
|---|---|
| Registry registration | The adapter ID is discoverable; duplicate IDs and unknown IDs are rejected. |
| Proposal/environment match | A mismatched origin or moved base commit blocks launch before provider work. |
| Capability enforcement | A provider that cannot isolate a workspace or produce structured results is rejected when policy requires those capabilities. |
| Bounded launch | The provider receives only the immutable queue and feature limit from the proposal. |
| Remote-effect refusal | A claimed push, pull request, merge, or review URL fails closed unless a future core policy explicitly supports it. |
| Result validation | A malformed, mismatched, or missing runtime result blocks evidence-backed finalization. |
| Observation idempotency | Repeated polling of the same provider event cannot append duplicate journal transitions. |
| Evidence gate | Review readiness and finalization continue to require the shared runtime result and passing required checks. |

Provider tests should mock the external API or CLI. The normal test suite must not create real provider tasks, spend API usage, create remote branches, or depend on an operator credential.

## Maintaining the boundary

When changing the core or an adapter, use this decision table.

| Change request | Correct location |
|---|---|
| Add a provider API field or parse provider output | Provider adapter module. |
| Add a provider capability | `RuntimeCapabilities` and conformance tests. |
| Change proposal or finalization policy for all providers | Core governance model. |
| Add a provider task monitor | Provider adapter observation implementation. |
| Add a new first-party runtime | Provider module, built-in registry registration, tests, and this guide. |
| Add a recurring scheduler | Scheduler layer that consumes an existing handoff; never inside an adapter. |

Do not let a provider-specific convenience bypass an invariant. If one engine cannot meet a core rule, document it as unsupported rather than weakening the rule for every adapter.

## Codex implementation checklist

Before adding Codex, complete the following in order:

1. Verify the available Codex execution interface can use an exact commit and isolated workspace.
2. Verify it can run required commands and return factual outcomes.
3. Decide whether it is synchronous or needs passive observation.
4. Implement `src/runtimes/codex.ts` with remote effects forbidden by default.
5. Produce and validate the shared `runtime-result.json` artifact.
6. Register it in `src/runtimes/builtins.ts`.
7. Add provider tests and pass the shared conformance suite.
8. Add its supported capabilities and limitations to `ARCHITECTURE.md` and this guide.

Only after these steps are complete should `feature-inventor run --runtime codex --run RUN_ID` be treated as supported.

## Quick review checklist

Before merging any adapter change, confirm the following statements are all true:

- The adapter did not add a provider conditional to core lifecycle orchestration.
- The adapter does not mutate the journal directly.
- The adapter does not finalize a run.
- The adapter uses the immutable proposal without recomputing scope.
- The adapter cannot silently create a remote side effect.
- The result artifact validates against the proposal.
- The test suite uses mocks rather than a live provider.
- The documentation explains any provider-specific limitation.

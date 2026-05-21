# Design: SW-8.4A Terminal Lifecycle Contract MVP

## Technical Approach

Add one thin lifecycle contract above existing terminal seams. The contract accepts an already-resolved SW-8.2D durable binding, asks provider adapters for runtime evidence/handles, executes bounded lifecycle methods, and returns one normalized result shape where ownership stays durable and runtime ids stay evidence only.

## Architecture Decisions

| Decision           | Choice                                                                                                  | Alternatives considered                                          | Rationale                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Ownership entry    | `open`/`attach`/`restore` require a resolved binding with `classification` + `workspace_id` + `run_id`  | Let lifecycle resolve from `terminalId`/`panelId`; add new table | Smallest safe seam. SW-8.2D already owns durable truth.              |
| Runtime separation | Return `{ binding, runtime, outcome }` with runtime ids nested under `runtime` only                     | Flatten runtime ids into top-level response                      | Prevents `terminalId`/`panelId`/session ids from becoming canonical. |
| Adapter scope      | Keep contract in one new module; adapters stay thin over `ttyServer`, `sessionStore`, `nativeVteBridge` | Rewrite PTY/native stacks; add provider abstraction tree         | MVP stays bounded and testable.                                      |

## Data Flow

```text
caller
  -> resolveAgentRuntimeBinding(...)     durable truth only
  -> terminalLifecycleContract.method(binding, request)
       -> runtime lookup (tty/session/native evidence)
       -> provider adapter execute or degrade
       -> normalized lifecycle result
```

## File Changes

| File                                                                 | Action | Description                                                                     |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `openspec/changes/sw-8-4a-terminal-lifecycle-contract-mvp/design.md` | Create | Technical design artifact                                                       |
| `src/lib/terminal/terminalLifecycleContract.js`                      | Create | Contract entrypoint, method guards, normalized outcomes                         |
| `src/lib/terminal/terminalLifecycleContract.test.js`                 | Create | Contract matrix tests with mocked binding/runtime adapters                      |
| `src/lib/terminal/ttyServer.js`                                      | Modify | Export tiny PTY runtime lookup/execute helpers without changing ownership rules |
| `src/lib/terminal/sessionStore.js`                                   | Modify | Expose read-only persisted session evidence helper for `restore`/`heartbeat`    |

`localDb.resolveAgentRuntimeBinding()` remains the durable lookup owner; no schema change.

## Interfaces / Contracts

```js
type LifecycleMethod = 'open' | 'attach' | 'focus' | 'resize' | 'close' | 'restore' | 'heartbeat';

terminalLifecycleContract[method]({
  binding,        // SW-8.2D result; required for every method
  provider,       // 'pty' | 'native-vte'
  runtimeHint,    // optional terminalId/panelId/session ids, never ownership
  payload,        // cols/rows/focus options/reason
}) => {
  outcome: 'ok' | 'degraded' | 'rejected',
  reason: string,
  binding: { classification, workspace_id, run_id },
  runtime: {
    provider,
    availability: 'live' | 'restorable' | 'missing' | 'stale' | 'unsupported',
    handle_ref: string | null,
    evidence: object | null,
  },
}
```

Method boundaries:

- `open`: requires durable `bound|stale`; MAY create/resume runtime handle; never writes durable state.
- `attach`: requires durable binding + existing live handle; NEVER spawns.
- `focus`/`resize`/`close`: handle-scoped only; if no live handle, return degraded.
- `restore`: requires durable binding; MAY reuse matching `sessionStore`/PTY/native evidence; if evidence missing or mismatched, degrade.
- `heartbeat`: evidence-only freshness/liveness read; NEVER opens, restores, focuses, or mutates ownership.

## Degraded Outcomes

When durable binding exists but no live runtime handle/panel exists, return:

- `outcome: 'degraded'`
- `binding`: preserved durable workspace/run
- `runtime.availability: 'missing' | 'stale' | 'unsupported'`
- `runtime.handle_ref: null`
- stable reasons like `runtime_handle_missing`, `runtime_handle_stale`, `runtime_restore_unavailable`

This keeps the contract truthful: owned durably, unavailable at runtime.

## Module Ownership

| Concern                    | Owner                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Durable binding lookup     | `src/lib/db/localDb.js` via SW-8.2D resolver                                              |
| Live runtime handle lookup | `ttyServer` PTY map; native VTE probe/registry; `sessionStore` only as persisted evidence |
| Lifecycle policy + guards  | `terminalLifecycleContract.js`                                                            |
| Provider execution         | `ttyServer` PTY helpers and existing native bridge hooks                                  |

## Testing Strategy

| Layer           | What to Test                                              | Approach                                                                           |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unit            | Entry guards for each method                              | Mock binding objects; reject runtime-only ids                                      |
| Unit            | Degraded outcomes with durable binding but missing handle | Mock PTY/native lookup to return none/stale                                        |
| Unit            | `open` vs `attach` vs `restore` semantics                 | Mock adapter functions; assert spawn only on `open`, never on `attach`             |
| Unit            | Guardrails against ownership inflation                    | Assert runtime ids never change returned binding and never satisfy missing binding |
| Integration/E2E | None for MVP                                              | No real PTYs, no native panels                                                     |

## Migration / Rollout

No migration required.

## Open Questions

- [ ] None.

## Non-Goals

No UI work. No provider expansion. No deep native rewrite. No new durable table. No promotion of runtime ids, panel ids, PTY ids, or session rows into ownership truth.

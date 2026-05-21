# Apply Progress: SW-8.4A Terminal Lifecycle Contract MVP

## Status

- Change: `sw-8-4a-terminal-lifecycle-contract-mvp`
- Mode: Strict TDD
- Scope synced to implemented/tested reality on disk after verify artifact drift

## Completed Work

### Phase 1 — Contract foundation

- ✅ Durable binding guard/result-shape tests added for `open|attach|restore|heartbeat`
- ✅ Thin lifecycle contract created with normalized `{ outcome, reason, binding, runtime }`
- ✅ Test fixtures and frozen-boundary assertions extracted

### Phase 2 — PTY adapter seam

- ✅ PTY seam tests added for runtime lookup plus `open` vs `attach`
- ✅ `ttyServer.closeSession.test.js` now includes direct missing-handle close evidence showing no replacement handle is synthesized
- ✅ `ttyServer` exports read-only PTY runtime helpers used by the contract

### Phase 3 — Evidence seams for `restore|heartbeat`

- ✅ `sessionStore` read-only persisted evidence helper implemented and tested
- ✅ `nativeVteBridge` JS-only native evidence helper implemented and tested

### Phase 4 — Final contract wiring

- ✅ Contract matrix expanded to `open|attach|focus|resize|close|restore|heartbeat`
- ✅ Contract wired to `ttyServer`, `sessionStore`, and `nativeVteBridge`
- ✅ Runtime status/reason mapping refactored into tiny local helpers

### Phase 5 — Verify follow-up

- ✅ Verify established the code matched the slice
- ✅ This artifact sync repairs stale `tasks.md` and missing `apply-progress.md`

## Strict-TDD Evidence

| Batch        | Focus                                                             | RED evidence                                                                                                                                 | GREEN evidence                                                             |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------- |
| 1            | `terminalLifecycleContract` foundation                            | `npm test -- src/lib/terminal/terminalLifecycleContract.test.js` failed because `terminalLifecycleContract.js` did not exist                 | Same focused file passed `13/13`                                           |
| 2            | PTY seam in `ttyServer`                                           | `npm test -- src/lib/terminal/ttyServer.test.js` failed because `readPtyRuntime`, `openPtyLifecycle`, and `attachPtyLifecycle` did not exist | Same focused file passed `21/21`                                           |
| 2.2          | Missing-handle close evidence in `ttyServer.closeSession.test.js` | Added focused missing-session close assertion to prove no replacement handle is synthesized for absent PTY state                             | `npm test -- src/lib/terminal/ttyServer.closeSession.test.js` passed `2/2` |
| 3            | Persisted evidence seam in `sessionStore`                         | `npm test -- src/lib/terminal/sessionStore.test.js` failed because `readPersistedSessionEvidence` did not exist                              | Same focused file passed `14/14`                                           |
| 4            | Native evidence seam in `nativeVteBridge`                         | `npm test -- src/lib/terminal/__tests__/nativeVteBridge.test.js` failed because `readNativeVteRuntimeEvidence` did not exist                 | Same focused file passed `13/13`                                           |
| Final wiring | Full lifecycle contract matrix                                    | `npm test -- src/lib/terminal/terminalLifecycleContract.test.js` failed because `focus                                                       | resize                                                                     | close` methods and seam wiring were missing | Same focused file passed `25/25` |

## Notes

- Durable binding remained top-level truth across all batches.
- Runtime evidence stayed nested under `runtime` and never became ownership truth.
- No UI, MCP, route, ownership-table, or Rust/Tauri rewrite scope was added.
- This file records actual apply evidence only; it does not invent unobserved code/test work.

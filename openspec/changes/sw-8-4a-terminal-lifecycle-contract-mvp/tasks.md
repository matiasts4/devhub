# Tasks: SW-8.4A Terminal Lifecycle Contract MVP

## Phase 1: Contract foundation (smallest safe batch)

- [x] 1.1 RED — `src/lib/terminal/terminalLifecycleContract.test.js`: add failing guard/result-shape tests for `open|attach|restore|heartbeat`, requiring durable `binding.classification/workspace_id/run_id`, rejecting runtime-only ids, and keeping runtime ids nested under `runtime`.
- [x] 1.2 GREEN — `src/lib/terminal/terminalLifecycleContract.js`: create the thin lifecycle contract with normalized `{ outcome, reason, binding, runtime }` results and no ownership writes or resolver logic.
- [x] 1.3 REFACTOR — `src/lib/terminal/terminalLifecycleContract.test.js`: extract tiny binding/runtime fixtures and explicit boundary assertions blocking SW-8.3A UI, SW-8.5A orchestration, and any new ownership table assumptions.

## Phase 2: PTY adapter seam

- [x] 2.1 RED — `src/lib/terminal/ttyServer.test.js`: add failing tests for read-only PTY runtime lookup plus `open` vs `attach` behavior, proving spawn/resume is allowed only for `open` and never from runtime-only hints.
- [x] 2.2 RED — `src/lib/terminal/ttyServer.closeSession.test.js`: add failing degraded-outcome tests for `focus|resize|close` when no live PTY handle exists, with no synthesized replacement handle.
- [x] 2.3 GREEN — `src/lib/terminal/ttyServer.js`: export the smallest PTY lifecycle helpers for runtime lookup/execute so the contract can query or act on live handles without changing durable ownership.

## Phase 3: Evidence seams for restore/heartbeat

- [x] 3.1 RED — `src/lib/terminal/sessionStore.test.js`: add failing tests for a read-only persisted-session evidence helper used by `restore|heartbeat`, including missing/stale evidence outcomes.
- [x] 3.2 GREEN — `src/lib/terminal/sessionStore.js`: expose the smallest read-only evidence helper; keep `sessionStore` as persisted evidence only.
- [x] 3.3 RED — `src/lib/terminal/__tests__/nativeVteBridge.test.js`: add failing tests for normalized native lifecycle evidence and unsupported/stale degradation used by `restore|focus|resize|close`.
- [x] 3.4 GREEN — `src/lib/terminal/nativeVteBridge.js`: add tiny native lifecycle helpers or normalizers needed by the contract; no provider expansion, no deep native rewrite.

## Phase 4: Contract wiring matrix

- [x] 4.1 RED — `src/lib/terminal/terminalLifecycleContract.test.js`: extend to full method matrix covering `open|attach|focus|resize|close|restore|heartbeat`, degraded reasons, heartbeat evidence-only behavior, and binding immutability.
- [x] 4.2 GREEN — `src/lib/terminal/terminalLifecycleContract.js`: wire `ttyServer`, `sessionStore`, and `nativeVteBridge` helpers into method dispatch with stable degraded reasons like `runtime_handle_missing`, `runtime_handle_stale`, and `runtime_restore_unavailable`.
- [x] 4.3 REFACTOR — `src/lib/terminal/terminalLifecycleContract.js`: collapse repeated reason/availability mapping into tiny local helpers without widening file scope.

## Phase 5: Focused verification

- [x] 5.1 VERIFY — Run targeted unit tests only: `src/lib/terminal/terminalLifecycleContract.test.js`, `src/lib/terminal/ttyServer.test.js`, `src/lib/terminal/ttyServer.closeSession.test.js`, `src/lib/terminal/sessionStore.test.js`, `src/lib/terminal/__tests__/nativeVteBridge.test.js`.
- [x] 5.2 VERIFY — Confirm diff stays inside lifecycle-contract files/seams, does not add `src/lib/db/localDb.js` changes unless a read-only helper is strictly required, and does not touch SW-8.3A UI, SW-8.5A orchestration, or any new ownership table/schema.

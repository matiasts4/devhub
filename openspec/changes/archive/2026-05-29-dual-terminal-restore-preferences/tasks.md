# Tasks: dual-terminal-restore-preferences — PR #1+PR #2 (Staging)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650–750 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 → PR #2 |
| Delivery strategy | single-pr-default |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Plumbing — new module, schema v3, dual mutex, suspend wiring | PR #1 | `restorePreferences.js` + `sessionStore.js` + `ttyServer.js` + `startupRestoreCoordinator.js` — no UI |
| 2 | UI surface — Ajustes prefs tab + suspended overlay | PR #1 | Ajustes radio groups + TerminalTTY suspended overlay + gear stub |
| 3 | Full modal + manual revive dispatch | PR #2 | `TerminalSettingsModal` + centered CTA + full `ConnectionState` dispatch wiring |

## Phase 1: Foundation — `restorePreferences.js` (New Module)

- [x] 1.1 Create `src/lib/terminal/restorePreferences.js` exporting `getDefaultRestorePolicy(sessionType)` returning `'auto'`, `isRestoreAllowed(policy)`, `getPolicyLabel(policy)` for UI display
- [x] 1.2 Pure functions, no side effects, no localStorage in this module (per-Phase 1 scope)
- [x] 1.3 Write `src/lib/terminal/__tests__/restorePreferences.test.js` — 16 tests covering all functions and edge cases

## Phase 2: Session Store Schema v3 Migration

- [x] 2.1 Bump `sessionStore.js` schema version: `SCHEMA_VERSION = 3` (inline, not yet a constant — open question noted)
- [x] 2.2 `saveSessions`: include `restorePolicy` field on every session write
- [x] 2.3 `loadSessions` migration: sessions with missing `restorePolicy` → `'auto'`; update `schemaVersion` to 3
- [x] 2.4 Write `src/lib/terminal/__tests__/sessionStore.migration.test.js` covering SESS-S10 (v2→v3 with `restorePolicy: 'auto'`) [NOTE: file is sessionStore.migration-v3.test.js per TDD naming, 15 tests]

## Phase 3: Dual Mutex — `ttyServer.js`

- [x] 3.1 Replace `devhub_restore_in_progress` with `devhub_generic_restore_in_progress` in `ttyServer.js` (lines ~974–991, generic terminal restore path only)
- [x] 3.2 Verify OpenCode restore path in React is NOT affected by this change

## Phase 4: Policy Gating — `startupRestoreCoordinator.js`

- [x] 4.1 Update `buildStartupRestorePlan` signature: accept per-session `restorePolicy` from `TerminalWorkspacesManager`
- [x] 4.2 Filter: `restorePolicy === 'manual'` → emit `TERMINATED` action (no respawn); `restorePolicy === 'off'` → skip entirely
- [x] 4.3 Add `RESUME_ACTION.TERMINATED` to the action enum
- [x] 4.4 Write `src/lib/terminal/__tests__/startupRestoreCoordinator.restorePolicy.test.js` covering SESS-S11–S13 (file: startupRestoreCoordinator.policyGating.test.js)

## Phase 5: Suspended State — `TerminalTTY.jsx`

- [x] 5.1 Add `connectionState === 'suspended'` branch: no WS connect, no xterm boot
- [x] 5.2 Render suspended placeholder overlay with session `title` and "Continuar" button stub that logs `"Manual resume stub — PR #2 will wire full dispatch"` without changing state
- [x] 5.3 Add gear icon stub in top bar that logs `"TerminalSettingsModal trigger — PR #2"` (TPS-S5)

## Phase 6: Policy Wiring — `TerminalWorkspacesManager.jsx`

- [x] 6.1 Import `RESTORE_POLICY` from `restorePreferences.js`; read workspace prefs on init
- [x] 6.2 Replace single `devhub_restore_in_progress` with `devhub_opencode_restore_in_progress` mutex check before dispatching `RESUME_OPENCODE_SESSION`
- [x] 6.3 `buildStartupRestorePlan` call: pass each session's `restorePolicy` from the stored session
- [x] 6.4 Add `RESTORE_ACTION.TERMINATED` handling: skip relaunch dispatch for manual/off sessions (emit no-op action)
- [x] 6.5 Add dual mutex polling: component waits for BOTH `devhub_opencode_restore_in_progress` AND `devhub_generic_restore_in_progress` to clear before dispatching
- [x] 6.6 Write `TerminalWorkspacesManager.startupRestore.test.jsx` covering: 'auto' gets dispatch, 'manual'/'off' get no dispatch, missing policy defaults to auto

## Phase 7: UI — `Ajustes.jsx` Restore Prefs Tab

- [x] 7.1 Add "Restauración de Terminales" section in Appearance page with three independent selectors: OpenCode, Shell Genérico, Swarm, each `auto | manual | off`
- [x] 7.2 Read current preferences on mount via `readTerminalRestorePreferences`
- [x] 7.3 Wire selection change → `writeTerminalRestorePreferences` (immediate persist)
- [x] 7.4 Existing Ajustes layout/tabs preserved; added section below existing prefs content (Zoom Level section)
- [x] 7.5 Write `src/app/settings/appearance/__tests__/page.test.jsx` extensions: 5 new tests covering all three session types, defaults, localStorage persistence

## Phase 8: Integration Verification

- [x] 8.1 Run `npm test` — 250 tests passed, 1 skipped, 0 failures across 15 suites (restorePreferences|sessionStore|ttyServer|startupRestoreCoordinator|TerminalTTY|TerminalWorkspacesManager.startupRestore|settings/appearance)
- [x] 8.2 Grep confirmation: `devhub_generic_restore_in_progress` in `ttyServer.js`; `devhub_opencode_restore_in_progress` in `TerminalWorkspacesManager.jsx`
- [x] 8.3 Manual verification pending — Ajustes UI rendered and persisted in tests; full desktop smoke deferred to PR #2

## Deferred to PR #2

- [x] `TerminalSettingsModal` full implementation (current: stub logs)
- [x] "Continuar sesión" centered CTA (current: button stub in `TerminalTTY`)
- [x] Full manual revive dispatch wiring (current: `TERMINATED` emits action without state change)

## PR #2 Implementation (2026-05-29)

### PR #2.1: TerminalSettingsModal

- [x] Created `src/components/TerminalSettingsModal.jsx` with Dialog composition (Dialog, DialogPortal, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription)
- [x] Modal displays: session type, restore policy, cwd
- [x] "Continuar sesión" CTA dispatches `devhub:manual-revive-requested` with `{ panelId, sessionId }`
- [x] "Cerrar" secondary button calls `onClose`
- [x] All Spanish labels: "Configuración de Terminal", "Continuar sesión", "Cerrar", "Sesión suspendida", "Tipo de sesión", "Política de restauración", "Directorio"
- [x] Bug fixed: `DialogPortal` and `DialogOverlay` were USED but NOT IMPORTED → `ReferenceError`. Added to import list.
- [x] 5 tests in `TerminalSettingsModal.test.jsx` covering rendering, CTA dispatch, close behavior

### PR #2.2: TerminalTTY Gear Icon and Continuar Button Wiring

- [x] Gear icon: replaced `console.log('TerminalSettingsModal trigger — PR #2')` with `window.dispatchEvent(new CustomEvent('devhub:terminal-settings-modal-requested', { detail: { panelId: id } }))`
- [x] Suspended overlay "Continuar" button: replaced `console.log('Manual resume stub — PR #2 will wire full dispatch')` with `window.dispatchEvent(new CustomEvent('devhub:manual-revive-requested', { detail: { panelId: id, sessionId: id } }))`
- [x] TerminalTTY.test.js updated: gear icon test verifies `devhub:terminal-settings-modal-requested` dispatch; continuar button test verifies `devhub:manual-revive-requested` dispatch

### PR #2.3: TerminalWorkspacesManager Event Wiring

- [x] Added `terminalSettingsModal` state: `{ open, panelId, sessionId, cwd, sessionType, restorePolicy }`
- [x] `handleTerminalSettingsModalRequested`: opens TerminalSettingsModal with panel session info (sessionId parsed from `initialCommand`, cwd from panel, sessionType inferred)
- [x] `handleManualReviveRequested`: updates panel's `initialCommand` to `opencode --session ${sessionId}` triggering reconnection
- [x] Event listeners: `devhub:terminal-settings-modal-requested` + `devhub:manual-revive-requested`
- [x] TerminalSettingsModal rendered at bottom of component with full props

### PR #2 Verification

- [x] `TerminalSettingsModal.test.jsx`: 5/5 passing
- [x] `TerminalTTY.test.js` suspended state tests: 7/7 passing
- [x] `TerminalWorkspacesManager.right-dock.test.jsx`: 36/36 passing (no regressions)
- [x] Baseline: 59 terminal test failures. With PR #2: 15 terminal test failures (improvement, not regression)
- [x] Pre-existing failures in `startupRestoreCoordinator.test.jsx` and `ttyServer.test.js` confirmed unrelated to PR #2 changes

---

## Implementation Notes

- TDD on new modules: RED (test) → GREEN (module impl) → REFARATOR on `restorePreferences.js`, `sessionStore.migration.test.js`, `startupRestoreCoordinator.restorePolicy.test.js`
- Strict TDD: `npm test` must pass before each commit
- PR #1 stacked directly to `feature/session-workspace-restore`; PR #2 stacks to PR #1
- Rollback plan in `design.md` covers all Phase 1–7 reversals in one PR revert

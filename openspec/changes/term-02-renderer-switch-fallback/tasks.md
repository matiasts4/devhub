# Tasks: TERM-02 Renderer Switch Fallback

## Phase 1: Pure Renderer Foundation

- [x] 1.1 RED: Create `src/components/__tests__/terminalRendererPreferences.test.js` for storage sanitize, workspace default + panel `inherit` resolution, stale workspace/panel cleanup, and baseline `xterm` fallback.
- [x] 1.2 GREEN: Create `src/components/terminal/terminalRendererPreferences.js` with renderer storage key helpers, read/write sanitizers, and `resolveRequestedRenderer({ workspaceId, panelId, prefs })`.
- [x] 1.3 RED: Create `src/components/__tests__/terminalRendererCapabilities.test.js` for `xterm` always-ready behavior, experimental not-ready probes, deterministic fallback metadata, and recovery copy rules.
- [x] 1.4 GREEN: Create `src/components/terminal/terminalRendererCapabilities.js` with renderer catalog, capability probe stub, `resolveRendererSelection`, and fallback/recovery label helpers.

## Phase 2: TerminalTTY Effective Renderer

- [x] 2.1 RED: Extend `src/components/__tests__/TerminalTTY.test.js` for requested-vs-effective renderer exports, fallback-banner visibility, reset affordance copy, and same-effective-mode no-churn guardrails.
- [x] 2.2 GREEN: Update `src/components/TerminalTTY.jsx` to accept requested renderer props, derive one effective renderer from pure helpers, keep `xterm` visible on fallback, and render inline recovery UI.
- [x] 2.3 REFACTOR: Tighten `src/components/TerminalTTY.jsx` lifecycle/effect dependencies so requested-mode changes that still resolve to `xterm` do not recreate terminal, socket, or viewport state.

## Phase 3: Manager Persistence and UI Wiring

- [x] 3.1 RED: Expand `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` for renderer selector behavior on active panel/workspace, per-panel persistence, and one-click reset to `xterm` from fallback UI.
- [x] 3.2 RED: Expand `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` for reload/reopen restore of requested experimental mode while the live panel still reopens on fallback `xterm`.
- [x] 3.3 GREEN: Update `src/components/TerminalWorkspacesManager.jsx` to hydrate/sanitize renderer prefs, wire selector controls for active panel/workspace, pass `requestedRendererMode` and reset callback into `TerminalTTY`, and persist separate renderer state without bloating `devhub_terminal_state`.

## Phase 4: Verification and Cleanup

- [x] 4.1 REFACTOR: Keep new manager/TTY assertions behavioral — selected mode, visible fallback message, usable terminal surface, and reset recovery — without remount-count or implementation-coupled checks.
- [x] 4.2 VERIFY: Run `npm test -- terminalRendererPreferences.test.js terminalRendererCapabilities.test.js TerminalTTY.test.js TerminalWorkspacesManager.panel-subtabs.test.jsx TerminalWorkspacesManager.reopen.test.jsx` and confirm every TERM-02 spec scenario is covered.
- [x] 4.3 CLEANUP: Add or update concise inline comments only in `src/components/terminal/terminalRendererPreferences.js`, `src/components/terminal/terminalRendererCapabilities.js`, and `src/components/TerminalTTY.jsx` where fallback semantics are non-obvious.

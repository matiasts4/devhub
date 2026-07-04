# Delta for terminal-renderer-default

## REMOVED Requirements

### Requirement: VTE native terminal renderer

(Reason: VTE is deprecated in favor of xterm.js + waveterm-style decoupled PTY.)
(Migration: Remove `src-tauri/src/native_vte.rs`, `src/lib/terminal/nativeVteBridge.js`, `nativeVteLayoutLifecycle.js`, VTE branches in `src/components/TerminalTTY.jsx`, and the `vte-experimental` renderer option. Keep browser GTK/WebKitGTK dependencies intact.)

### Requirement: Survivor recovery event burst

(Reason: Replaced by persistent PTY + rehydration; recovery bursts hide the real bug.)
(Migration: Delete `SURVIVOR_RECOVER_DELAYS_MS`, `SWITCH_SURVIVOR_RECOVER_DELAYS_MS`, `scheduleSurvivorRecoverAfterClose`, and the `devhub:terminal-survivor-recover` event from `src/components/terminal/nativeLayoutSync.js` and `src/components/TerminalWorkspacesManager.jsx`.)

### Requirement: Auto-kill grace timers for hidden v2 panels

(Reason: v2 panels keep PTY alive via sidecar ownership, not grace timers.)
(Migration: `DEFAULT_AUTO_KILL_GRACE_MS` and `TUI_AUTO_KILL_GRACE_MS` in `src/lib/terminal/ttyServer.js` remain for legacy v1 paths only; v2 subscribers MUST NOT trigger auto-kill on disconnect.)

### Requirement: Bounded retry loops and black-panel workarounds

(Reason: Workarounds are no longer needed once the sidecar owns PTY state.)
(Migration: Remove GPU-release-on-hide, forced repaint nudges, and catch-up bursts gated only by survivor recovery in the v2 code path.)

## MODIFIED Requirements

### Requirement: Terminal renderer selection

The renderer list SHALL contain only xterm renderers (`xterm`, `xterm-canvas`, `xterm-webgl`).
(Previously: `vte-experimental` was an available renderer mode.)

#### Scenario: Panel opens with default renderer

- GIVEN a panel has no saved renderer preference
- WHEN it mounts
- THEN it MUST default to an xterm renderer
- AND the VTE path MUST NOT be attempted

#### Scenario: Legacy VTE preference is ignored

- GIVEN a persisted renderer preference equals `vte-experimental`
- WHEN the panel loads
- THEN the system MUST resolve it to `xterm-webgl` or `xterm`
- AND MUST NOT call native VTE IPC commands

## ADDED Requirements

### Requirement: v2 renderer path gating

The system SHALL route a panel through the v2 lifecycle only when `terminal-engine-v2` is enabled for that panel.

#### Scenario: v2 flag off

- GIVEN a panel has `terminal-engine-v2=false`
- WHEN it mounts, hides, or switches workspace
- THEN it MUST use the legacy v1 lifecycle
- AND VTE removal MUST NOT break its behavior

#### Scenario: v2 flag on

- GIVEN a panel has `terminal-engine-v2=true`
- WHEN it mounts
- THEN it MUST subscribe to the sidecar ring buffer
- AND it MUST follow destroy-only-on-close semantics

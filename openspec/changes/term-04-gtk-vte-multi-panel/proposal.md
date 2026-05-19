# Proposal: TERM-04 GTK/VTE Multi-Panel Native Split View

## Intent

TERM-03 proved only a single active native lease. That is insufficient because split view requires two or more GTK/VTE panels visible at the same time in one DevHub window. TERM-04 upgrades the spike into correctness-first multi-panel behavior while preserving deterministic `xterm` fallback and recovery.

## Scope

### In Scope
- Support simultaneous visible GTK/VTE panels in split view, scoped by panel id.
- Replace active-panel-only bridge/registry semantics with per-panel open, show, hide, focus, resize, detach, and close.
- Preserve TERM-02/TERM-03 requested-vs-effective renderer contract and deterministic per-panel fallback/recovery.

### Out of Scope
- Ghostty/libghostty, external terminals, unstable multiwebview, or a whole-engine rewrite unless design proves unavoidable.
- Non-Linux native renderer expansion.

## Capabilities

### New Capabilities
- `terminal-native-vte-multi-panel`: Define same-window GTK/VTE concurrency for multiple visible terminal panels with panel-scoped lifecycle.

### Modified Capabilities
- `terminal-renderer-selection`: `vte-experimental` MUST resolve per panel without single-active exclusivity.
- `terminal-renderer-fallback`: Fallback/recovery MUST remain deterministic for each panel without blanking sibling native panels.

## Approach

Evolve TERM-03 via shared overlay + multi-panel registry, not a ground-up rewrite. Rust keeps one window host but tracks many visible native panels by panel id and geometry; JS bridge becomes panel-scoped instead of active-panel-only. Failures stay local: one panel can recover to `xterm` without collapsing other visible native panels.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/TerminalTTY.jsx` | Modified | Multi-panel native lifecycle, visibility, recovery UX |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Split-view ownership, panel persistence, activation model |
| `src/lib/terminal/nativeVteBridge.js` | Modified | Panel-scoped bridge contract |
| `src/components/terminal/terminalRendererCapabilities.js` | Modified | Per-panel effective renderer and recovery rules |
| `src-tauri/src/native_vte.rs` | Modified | Remove exclusive visibility, manage registry/geometry/focus |
| `src-tauri` + web terminal modules | Modified | Package boundary touched by native bridge integration |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrong geometry/hit-testing breaks input | Med | Explicit panel bounds ownership and visibility assertions |
| Panel unmount closes live session incorrectly | Med | Separate hide/detach/close lifecycle states |
| Multi-panel focus/resize races | High | Panel-id routing and deterministic registry updates |

## Rollback Plan

Feature-flag TERM-04 multi-panel semantics off, restore TERM-03 single-active behavior, and keep all requested `vte-experimental` panels on deterministic `xterm` fallback until corrected.

## Dependencies

- TERM-03 GTK/VTE spike baseline
- Linux GTK/VTE runtime inside current Tauri shell

## Success Criteria

- [ ] Two or more split panels can show GTK/VTE simultaneously in one window.
- [ ] Native failure in one panel recovers that panel deterministically without blanking others.
- [ ] No final solution depends on libghostty, external terminals, or unstable multiwebview.
- [ ] TERM-04 remains a bounded delta from TERM-03, not an unjustified engine rewrite.

# Proposal: TERM-02 Renderer Switch Fallback

## Intent

Make renderer choice explicit and recoverable before any native renderer ships. TERM-02 adds persisted selection plus readiness-gated fallback so users never get stranded away from xterm.

## Scope

### In Scope
- Add explicit renderer selection for terminal panels/workspaces.
- Persist experimental renderer states/flags without shipping TERM-03/04 runtimes.
- Auto-fallback to `xterm` when an experimental renderer is unavailable or not ready.
- Expose a visible control to switch back to `xterm`.
- Preserve room for tests around selection, persistence, fallback, and recovery.

### Out of Scope
- Implementing native VTE, native host, Ghostty, or any TERM-03/04 runtime.
- Opening external terminal windows or overlay/child-window terminals.
- Reworking PTY/session transport beyond renderer selection boundaries.

## Capabilities

### New Capabilities
- `terminal-renderer-selection`: Persist and apply explicit renderer mode per terminal workspace/panel with `xterm` baseline semantics.
- `terminal-renderer-fallback`: Gate experimental renderer modes behind readiness checks and recover visibly to `xterm` on failure.

### Modified Capabilities
- None.

## Approach

Add a narrow renderer-preference layer beside existing workspace persistence, not inside terminal transport. `TerminalWorkspacesManager` owns selector UI and persisted state; `TerminalTTY` resolves the effective renderer from requested mode plus readiness. Experimental modes remain flags only; if readiness is missing or false, runtime stays on `xterm` and shows a clear switch-back affordance without remount storms.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Renderer selector UI, persistence wiring, visible xterm recovery |
| `src/components/TerminalTTY.jsx` | Modified | Effective renderer resolution and fallback guardrails |
| `src/components/terminal/*renderer*` | New | Renderer state/readiness helpers |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Selection/fallback helper coverage |
| `src/components/__tests__/TerminalWorkspacesManager*.test.jsx` | Modified | Persistence, visible recovery, selector behavior |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Renderer toggle causes remount churn | Med | Keep mode resolution in small helpers; avoid unstable effect deps |
| Experimental mode looks selectable but is unusable | High | Require explicit readiness gate; fallback to `xterm` deterministically |
| Persisted bad mode locks user out | Med | Always render visible switch-back to `xterm` |

## Rollback Plan

Remove renderer preference state/UI and force all panels back to `xterm`. Ignore stored experimental flags during rollback and sanitize to baseline on load.

## Dependencies

- Existing workspace persistence in `TerminalWorkspacesManager.jsx`
- xterm baseline contract from TERM-01 docs

## Success Criteria

- [ ] Users can explicitly pick `xterm` or an experimental renderer state from terminal UI.
- [ ] Persisted experimental selections fall back automatically to `xterm` when readiness is not proven.
- [ ] Users always have a visible way to switch back to `xterm`.
- [ ] No native renderer implementation or external terminal window is required for TERM-02.
- [ ] Behavioral tests cover selection, persistence, fallback, and visible recovery.

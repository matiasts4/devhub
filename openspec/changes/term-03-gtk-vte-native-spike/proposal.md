# Proposal: TERM-03 GTK VTE Native Spike

## Intent

After TERM-02, DevHub can remember a native renderer request but still always lands on `xterm`. TERM-03 asks one narrow question: can Linux/Tauri host a same-window GTK VTE panel inside the existing renderer-selection contract, without stranding users or opening an external terminal?

## Scope

### In Scope
- Add a Linux-only `vte-experimental` readiness path that plugs into TERM-02 requested/effective renderer resolution.
- Spike one active panel only, same window only, with minimal open/focus/resize/close bridge evidence.
- Keep `xterm` as hard fallback and visible recovery path when native capability is absent or fails.
- Capture evidence required to judge whether native same-window rendering is viable.

### Out of Scope
- Multi-panel native rendering, workspace restore hardening, or TERM-04 rollout work.
- Ghostty/libghostty, external windows, overlay/child-window terminals.
- Reverting or broadening current TERM-02 working-tree changes.

## Capabilities

### New Capabilities
- `terminal-native-vte-spike`: Prove or reject a Linux-only GTK VTE in-panel renderer slice with explicit lifecycle boundaries and same-window evidence.

### Modified Capabilities
- `terminal-renderer-selection`: `vte-experimental` selection MUST continue through the TERM-02 requested renderer path rather than bypassing panel/workspace preference logic.
- `terminal-renderer-fallback`: Effective renderer MUST fall back to `xterm` whenever native VTE capability is unavailable, unsupported, or unstable at runtime.

## Approach

GTK VTE is first because it is the best-fit native Linux widget already aligned with the roadmap: true terminal widget, same-window intent, less speculative than Ghostty. Keep imperative native lifecycle isolated at the Tauri/Rust boundary; React keeps owning requested state, effective mode resolution, and recovery UI.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Preserve TERM-02 selection/reset flow for native spike |
| `src/components/TerminalTTY.jsx` | Modified | Resolve native-vs-xterm view model and fallback UX |
| `src/components/terminal/terminalRendererCapabilities.js` | Modified | Add Linux/VTE readiness semantics |
| `src-tauri/src/lib.rs` | Modified | Host minimal GTK VTE bridge lifecycle |
| `docs/25_Terminal_Renderer_Robusto_Roadmap.md` | Modified | Align TERM-03 evidence expectations |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Same-window GTK embedding is not viable in current Tauri shell | High | Treat as spike; success is evidence, not shipment |
| Native lifecycle churn blanks active terminal | Med | Keep one active panel and hard fallback to `xterm` |
| Linux-only path leaks into broader renderer contract | Med | Reuse TERM-02 model; gate by capability/platform |

## Rollback Plan

Disable native VTE readiness, keep `vte-experimental` non-ready, and route every panel back through existing `xterm` effective rendering without changing stored requested preferences.

## Dependencies

- TERM-02 renderer selection/fallback contract already in progress
- Linux GTK/VTE availability in Tauri runtime

## Success Criteria

- [ ] One active Linux panel can show a same-window GTK VTE prompt without opening another window.
- [ ] Focus, input, resize, panel switch, and close are demonstrated on the native path.
- [ ] Any native failure or unsupported environment falls back deterministically to `xterm`.
- [ ] Requested/effective renderer semantics remain intact; no bypass around TERM-02 state model.
- [ ] Evidence is strong enough to say either “TERM-03 viable” or “reject and stay on xterm” with proof.

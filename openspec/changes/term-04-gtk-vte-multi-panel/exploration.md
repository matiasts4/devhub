# Exploration: TERM-04 GTK/VTE multi-panel visible native terminals

### Initial State at Exploration Time
- TERM-03 is a same-window, single-active native lease spike.
- `TerminalTTY.jsx` only opens native GTK/VTE for the active panel and hides inactive native panels.
- `native_vte.rs` keeps a single active-panel metadata pointer, but the Linux registry already stores multiple panel hosts in a map.
- The current Rust behavior is still exclusive: `registry_show_only_panel()` hides every other panel, so multiple visible native panels are not supported yet.

2026-05-17 continuation note: this section records the pre-implementation finding. The current partial implementation has started replacing those exclusive helpers in `src-tauri/src/native_vte.rs`, but TERM-04 still requires native desktop smoke proof before it can be considered complete.

### Affected Areas
- `src/components/TerminalTTY.jsx` — panel lifecycle, visibility, focus, resize, unmount behavior.
- `src/components/TerminalWorkspacesManager.jsx` — split-view activation model and panel persistence.
- `src/lib/terminal/nativeVteBridge.js` — bridge contracts need panel-scoped multi-panel semantics.
- `src-tauri/src/native_vte.rs` — registry, layout ownership, visibility, focus, resize, close.
- `src/components/terminal/terminalRendererCapabilities.js` — preserve requested/effective fallback contract.
- `openspec/changes/term-03-gtk-vte-native-spike/*` — keep TERM-03 as baseline; do not mutate its single-panel scope.

### Approaches
1. **Shared overlay + multi-panel registry** — keep one GTK host overlay, but make Rust track many live terminal panels and show/hide each panel independently by panel id.
   - Pros: smallest architectural delta, preserves same-window embedding, fits current registry shape.
   - Cons: hard focus/hit-testing/resize coordination, more state transitions to reason about.
   - Effort: High

2. **Per-panel native host slots** — model each visible split cell as its own GTK layout/terminal child within the same window host.
   - Pros: clearer lifecycle per panel, easier to reason about visibility and resizing.
   - Cons: more invasive Rust refactor, higher widget-management complexity.
   - Effort: High

3. **Single-active lease with rapid switching** — keep the TERM-03 exclusive lease model and swap the native host between panels on demand.
   - Pros: minimal code change.
   - Cons: violates the explicit multi-visible requirement; not acceptable as final architecture.
   - Effort: Low

### Recommendation
Use **Approach 1** as the change delta for a new TERM-04. The registry already has the right storage shape to evolve into multi-visible native panels; the real work is removing exclusivity from visibility/focus management and making the JS bridge panel-scoped instead of active-panel-only.

TERM-03 should remain the historical spike. TERM-04 should supersede it in scope, but stay backward-compatible with TERM-02 renderer selection, TERM-03 fallback semantics, and the same window/no-external-terminal/no-Ghostty constraints.

### Risks
- Overlay hit-testing can steal clicks outside terminal bounds if panel geometry is wrong.
- Workspace/panel unmounts can accidentally close live terminals unless lifecycle is split between “hide”, “detach”, and “close”.
- Focus and resize routing can thrash when several native panels coexist unless each panel owns explicit visibility and geometry state.
- Recovery must stay deterministic: unsupported/failing native panels still need xterm fallback without blanking other visible native panels.

### Ready for Proposal
Yes — the next step is a TERM-04 proposal/spec that defines multi-visible panel semantics, panel-scoped bridge APIs, and the exact compatibility boundary with TERM-03.

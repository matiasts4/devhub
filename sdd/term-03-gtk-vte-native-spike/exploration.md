## Exploration: TERM-03 GTK VTE Linux in-app native renderer spike

### Current State
DevHub terminal rendering is still web-owned: `TerminalWorkspacesManager.jsx` selects a requested renderer per workspace/panel, but `TerminalTTY.jsx` always resolves to `xterm` today because `terminalRendererCapabilities.js` marks native modes as not ready. The Rust/Tauri side currently boots the app shell and sidecar/runtime plumbing only; there is no native terminal widget bridge yet.

### Affected Areas
- `src/components/TerminalWorkspacesManager.jsx` — renderer selection, active-panel wiring, reset/fallback entry point.
- `src/components/TerminalTTY.jsx` — current in-panel terminal runtime; fallback surface and resize/focus behavior.
- `src/components/terminal/terminalRendererCapabilities.js` — capability gating for experimental modes.
- `src-tauri/src/lib.rs` / `src-tauri/tauri.conf.json` — native-window/runtime boundary and Linux packaging assumptions.
- `docs/25_Terminal_Renderer_Robusto_Roadmap.md` — TERM-03 scope and acceptance constraints.

### Approaches
1. **Capability-gated probe only** — keep GTK VTE as a selectable intent with `xterm` as live renderer until a real native bridge exists.
   - Pros: safest; no false promise; fits current TERM-02 model.
   - Cons: no same-window native evidence yet.
   - Effort: Low.

2. **Minimal same-window GTK VTE spike** — add a Linux-only native renderer path for one active panel with explicit open/focus/resize/close bridge and hard `xterm` fallback.
   - Pros: directly tests the TERM-03 hypothesis; produces real evidence.
   - Cons: highest integration risk; likely needs new Rust/GTK bridge work outside current React-only runtime.
   - Effort: High.

3. **External/native-window workaround** — mount VTE in a separate native window or overlay-like child path.
   - Pros: easier to prototype.
   - Cons: violates the same-window constraint; not acceptable for TERM-03.
   - Effort: Medium.

### Recommendation
Do **Option 2**, but only as a narrow Linux-only spike behind explicit capability gating and with `xterm` as the unrecoverable fallback. Reuse TERM-02’s requested-vs-effective renderer model; do not bypass it. The spike should focus on one active panel, same-window embedding proof, and a minimal bridge for resize/focus/open/close.

### Risks
- Tauri/WebKitGTK window integration may not expose a clean place to host a GTK VTE widget without deeper native work.
- Linux-only assumptions may break packaging/dev parity; installed app behavior can differ from `tauri dev`.
- Without build/runtime execution, evidence remains architectural until a later verification phase.

### Ready for Proposal
Yes — the next step should be a tightly scoped proposal/spec for a Linux-only same-window VTE spike with fallback-first semantics.

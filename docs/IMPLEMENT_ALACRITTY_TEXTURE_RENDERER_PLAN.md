# Implementation Plan: Alacritty-Texture Renderer Mode (Additive New "Otro Tipo de Vista")

**Goal**: Add a completely new terminal renderer option called `alacritty-texture` (or `alacritty-headless`) as a high-fidelity headless view. 
- Uses `alacritty_terminal` crate as the engine (different from VTE widget).
- Renders the terminal grid to pixels/texture (using pango/cairo for consistency with existing font rendering).
- Exposes frames via Tauri events (reuse `terminal:frame` + rgba format).
- JS consumer reuses the existing `<canvas>` + `paintRgbaFrame` path (already in TerminalTTY for texture modes).
- **Additive only**: Does NOT remove or change default behavior of `vte-experimental` (native widget), `xterm`, or the existing `canvas` stub. New mode is opt-in for experimentation, especially for pizarra terminal surfaces.
- Allows user to try it in pizarra cards (pure web canvas view → perfect layering with browser surfaces, no native VTE widget fighting z-order in GTK overlay), while keeping full TUI fidelity (better than current stub).
- If it "se ve mal", easy rollback by just not selecting the new mode.

**Context / Why this option**:
- Solves pizarra superposition ("pasar el browser por encima") because the *view* for the terminal is a web `<canvas>` inside the pizarra card (DOM stacking controls everything). The "terminal" (engine + PTY + state) runs headless in Rust.
- Still "alta fidelidad" via a real, production terminal engine (used in Zed, Horizon canvas-of-terminals, etc.).
- Keeps existing native VTE widget for main workspace (where overlay integration + carve + raises are wanted).
- Matches user's request: "no sería eliminar lo que ya se tiene sino que crear una nueva opción para ver cómo se ve esta nueva ... si es que se ve mal, volver a las otras".

**Non-goals for this plan**:
- Do not improve suspend visuals (per prior constraint).
- Do not touch xterm path.
- Do not make this the default yet.
- Initial renderer can be basic (pango cells) – polish later.
- Focus on Linux first (current native focus).

**Key Tradeoffs**:
- New deps: alacritty_terminal + portable-pty (or nix for PTY).
- Duplication of "terminal host" API (open/resize/write/close + frame emit). Can be refactored later into a trait if both VTE-widget and alacritty live long-term.
- Rendering work: must implement cell grid rasterization (but reuse pango font from current VTE code for visual consistency).
- PTY: independent of VTE's spawn_sync.

**Overall Phases** (sequential, each shippable/testable independently where possible):

## Phase 0: Preparation & Research Validation (1-2 days)
- Confirm user choice and this plan.
- Add the research doc reference if needed.
- Update renderer capabilities mentally: new mode will be "always ready" on supported platforms (like xterm/canvas), label "Alacritty (texture / pizarra high-fid)".
- Decide on exact mode name: `'alacritty-texture'` (clear it is texture-based for pizarra).
- Decide on event: reuse `'terminal:frame'` (with same `{panelId, format:'rgba', width, height, data: base64}` shape) so JS paint code works unchanged.
- Decide on bridge: new file `src/lib/terminal/alacrittyBridge.js` (or extend nativeVteBridge if small; prefer new for isolation).
- Rust: new module `src-tauri/src/alacritty_terminal_host.rs` (parallel to native_vte.rs).
- Tauri commands: `alacritty_open`, `alacritty_resize`, `alacritty_write` (or paste), `alacritty_close`, `alacritty_probe` (simple for now).
- In lib.rs: register the new handlers (additive).
- Cargo.toml: add under [dependencies]:
  ```
  alacritty_terminal = "0.26"
  portable-pty = "0.9"
  ```
  (portable-pty for cross-platform PTY; on Linux it uses the right thing. base64 already present for frame encoding.)
- Run `cargo check` after adding to validate.
- Update AGENTS.md or docs if any new convention.

**Deliverable**: Plan approved + deps added + skeleton files compiling.

## Phase 1: Rust Engine Host (Core – PTY + Term + State)
- Create `src-tauri/src/alacritty_terminal_host.rs`.
- Struct `AlacrittyTerminalHost` (or per-panel registry like NativeVteRegistry).
  - Holds `portable_pty::PtyPair`, child process, `alacritty_terminal::Term`, reader thread or async for PTY output.
  - Config: shell (reuse logic from native_vte: zsh -i or $SHELL -l), cwd, initial_command.
  - Size: cols/rows (from bounds or explicit).
- Functions:
  - `open_alacritty_terminal(request: AlacrittyOpenRequest) -> Result<...>` : spawn PTY, create Term with size, start reader that feeds bytes to Term and triggers "dirty".
  - `resize(...)`: Term::resize + resize PTY.
  - `write_input(panel_id, bytes or text)`: write to PTY master.
  - `close(...)`: kill child, cleanup.
  - Internal: on PTY data, `term.process(input)`, mark dirty, perhaps notify via channel.
- Registry (global or per-app like vte): `HashMap<String, AlacrittyTerminalHost>`.
- Since frames need to be emitted from main thread? Use tauri::async_runtime or spawn_blocking, but emit via AppHandle.
- For frame generation: when dirty (or on timer/ request), call a `render_to_rgba(&self) -> Option<(u32,u32, Vec<u8>)>`.
  - Implement basic renderer:
    - Use `pango::FontDescription` + `pango::Layout` + `cairo::ImageSurface` (deps already there via gtk).
    - Iterate Term grid: for each cell get c, fg, bg, flags (bold etc via attrs).
    - Draw bg rect, then text with color.
    - Handle cursor.
    - Basic for start (no ligatures, no complex graphics yet).
    - Convert surface to bytes (cairo write or direct).
  - Reuse font resolution logic if possible (copy from native_vte or make shared util).
- Threading: alacritty_terminal recommends event loop; use std::thread for PTY reader + crossbeam or flume channel to main for dirty notifications.
- Emit: `app.emit("terminal:frame", json!({ "panelId": id, "format": "rgba", "width": w, "height": h, "data": base64::encode(&buf) }))`.
- Handle child exit similar to VTE.
- Errors: similar reasons (open-failed, etc.), reuse or extend fallback reasons.

**Files touched**: new alacritty_terminal_host.rs, edit Cargo.toml, edit src-tauri/src/lib.rs (add mod, commands), perhaps share some spawn_argv logic (move common shell building to a util).

**Test**: Unit tests for spawn, basic resize, input (like existing VTE tests). Smoke bin if useful.
**Cargo check** after each substep.

## Phase 2: Tauri Commands & State Exposure
- In native style:
  - `#[tauri::command] pub fn alacritty_open(app: AppHandle, request: AlacrittyOpenRequest) -> AlacrittyOpenResponse`
  - Similar for resize, write/paste (text or bytes), close, probe (return ready:true for now, or check platform).
- Request/Response structs: similar to NativeVte* (panel_id, bounds or cols/rows, cwd, initial_command, session_id?).
- Use execute_main_thread_job pattern if needed for GTK, but since this host is pure (no widget), can be more async-friendly.
- Store hosts in a new `AlacrittyTerminalState` managed by tauri (like NativeVteState).
- Events: emit "terminal:frame" (reuse) + perhaps "alacritty-event" for other things (exit, etc.).
- Make sure multiple panels supported, keyed by panel_id (same ids as before, so pizarra surfaces can use same panelId).

**Files**: edit lib.rs (add to invoke_handler list, manage state), the host file.

## Phase 3: JS Bridge Layer
- New file: `src/lib/terminal/alacrittyBridge.js` (modeled after nativeVteBridge.js).
  - `export async function openAlacrittyPanel(payload)`
  - `resizeAlacrittyPanel`, `writeAlacrittyPanel` (or paste), `closeAlacrittyPanel`.
  - `subscribeAlacrittyEvents` if separate, but since we reuse 'terminal:frame', maybe just the open etc.
  - isAlacrittyRuntimeAvailable() – for now true on desktop.
- Export from a index or use directly.

**Files**: new bridge, perhaps update terminal imports.

## Phase 4: Renderer Capabilities & Selection (JS)
- Edit `src/components/terminal/terminalRendererCapabilities.js`:
  - Add `'alacritty-texture'` to TERMINAL_RENDERER_MODES.
  - Add label: `'alacritty-texture': 'Alacritty (texture / pizarra high-fid)'`
  - In getTerminalRendererCapability and runtime version: for the new mode, return ready: true (or based on platform, like xterm).
  - Update normalize, labels, fallback copy if needed (new mode shouldn't fallback to xterm unless error).
- In resolveRendererSelection etc.: it will just work since we treat it like 'canvas' (always ready).

**Files**: the capabilities file.

## Phase 5: TerminalTTY Consumer Support (Reuse + Minor Extensions)
- The heavy lifting for view is already there from previous texture work:
  - `isCanvasMode` logic, canvasRef, paintRgbaFrame (handles rgba base64 perfectly), init stub canvas, useEffect for listening 'terminal:frame'.
  - Key forwarding via paste (we can make it call the right bridge based on mode later).
- Changes needed:
  - Extend branching: introduce `isAlacrittyTextureMode = rendererViewModel.effectiveMode === 'alacritty-texture'`
  - `shouldBootAlacritty = isAlacrittyTextureMode && !suspended`
  - In dispose, clear canvas etc.
  - In onmessage / output handling: if alacritty mode, **ignore** the WS data path (alacritty host doesn't use the old WS PTY; it has its own). The frames come only from Rust events.
  - For input: in handleCanvasKeyDown (or general), dispatch to the correct bridge:
    - If alacritty mode: call writeAlacrittyPanel({panelId: id, text}) or bytes.
  - Boot logic: in the big useEffect that decides xterm/native/canvas, add case for alacritty: do NOT open WS session (the /api/terminal/session), instead rely on the Rust host being opened from outside (CanvasTerminal or creator).
  - The canvas will be shown for this mode too (z-20 etc.).
- Make paintRgbaFrame work for the mode (it already checks isCanvasMode, so either rename/generalize to isTextureMode or treat alacritty-texture as triggering the canvas path).

**Important**: When using this mode, the creation of the "panel" must come from the Rust side (alacritty_open), not the old web PTY creation. So the caller (pizarra) must explicitly open it with the new bridge.

**Files**: TerminalTTY.jsx (add branches, conditionals for the new mode, input routing). Keep backward for other modes.

## Phase 6: Pizarra / CanvasTerminal Integration (The "Try in Pizarra" Path)
- In `src/components/pizarra/CanvasTerminal.jsx`:
  - Allow `requestedRendererMode` to be `'alacritty-texture'` (prop already there).
  - Do NOT force 'vte-experimental' when this mode is requested.
  - On mount / bounds change: if mode === 'alacritty-texture', call `openAlacrittyPanel({ panelId: terminalId, cwd, initialCommand, bounds: contentBounds })`.
  - Use ref to avoid re-open (like the previous offscreen one).
  - Call resizeAlacrittyPanel on resize (during live and on commit).
  - For raise? Not needed (no native widget).
  - For suspend/visibility: since it's texture, probably never suspend the host (the engine keeps running), only the view. The isLiveDragging can still be used to perhaps pause frame emits if wanted, but for now, keep engine live.
  - Render the TerminalTTY with the requested mode (it will show the canvas consumer).
  - Header label will show the mode (update if needed).
- In pizarra creation paths (PizarraPane, tool palette, command bar, TWM carried surfaces):
  - Allow surfaces to carry `requestedRendererMode: 'alacritty-texture'`.
  - Add UI somewhere (tool, settings, or per-terminal menu) to choose "Alacritty texture view" when adding terminal to pizarra. (For MVP of plan: support via code/prop first, UI later.)
- For carried terminals from workspace: when registering to pizarra, respect or override the renderer if user wants to try the new view.

**Files**: CanvasTerminal.jsx, PizarraPane.jsx (and related pizarra files), possibly TWM.jsx for surface registry.

## Phase 7: TWM / General Terminal Creation Support
- In `src/components/TerminalWorkspacesManager.jsx` and related (createPanel, grid, restore, etc.):
  - Support passing/ storing `requestedRendererMode: 'alacritty-texture'` on panels.
  - When creating for pizarra context, default or allow the new mode.
  - The native sync / avoid rects etc. may not apply the same (since no native widget for this mode), so condition some effects on the mode.

**Files**: TWM.jsx and terminal creation utils.

## Phase 8: Polish, Fallbacks, Selection UI, Verification
- Make sure if open fails for alacritty, it can fallback gracefully (like other modes do to xterm).
- Add basic probe (platform check).
- Initial frame: after open, force a render or wait for first dirty.
- Cursor / selection: basic in renderer (v1 can be minimal).
- Input: support more keys (arrows etc.) in the canvas key handler.
- Performance: dirty only on actual change, throttle frames.
- Selection of mode: add to renderer capabilities UI if exists, or a simple switch in pizarra terminal add (e.g. in swarm wizard or palette).
- Tests: extend existing TTY tests or pizarra tests for the new mode (mock the bridge).
- Docs: update the research doc or add example in README.
- Verify: cargo check, tauri dev, create pizarra terminal with new mode, type, resize, drag browser over it, confirm no superposition + TUI looks good (colors, cursor at least).
- Easy fallback: just change the requestedRendererMode on the shape back to 'vte-experimental'.

**Files**: various tests, docs, perhaps a small UI toggle.

**Rollback strategy**: Since additive, removing the mode name from lists, or just not using it in creation, reverts everything. The Rust host code can stay or be feature-flagged.

**Dependencies added**:
- Rust: alacritty_terminal, portable-pty
- JS: none new (tauri event already used).

**Risks & Mitigations**:
- Rendering looks different from VTE: start with pango using same font desc as current VTE; iterate with user feedback.
- PTY differences (env, signals): copy the argv/env building from native_vte (build_native_spawn_argv etc.).
- Threading / lifetime leaks: use proper cleanup on close, like dispose in TTY.
- Only for pizarra initially: the mode can be used in normal TWM too if requested (texture view everywhere), but start scoped.
- Binary size / compile time: alacritty_terminal is reasonable.

**Timeline Estimate** (additive work):
- Phase 0-2 (Rust core + commands): 3-5 days
- Phase 3-5 (JS + TTY): 2-3 days
- Phase 6-7 (Pizarra/TWM wiring): 2 days
- Phase 8 (polish + verify): 2-3 days
Total ~ 2 weeks part-time, with checkpoints after each phase where user can test the partial (e.g. after Rust, a terminal that "opens" and emits placeholder frames).

**Verification Steps** (after each phase + final):
- `cargo check`
- tauri dev
- In pizarra: add terminal, set renderer to alacritty-texture (via dev tools or temp code), see canvas appear, type commands, see output (even if basic render at first), resize card, drag browser surface over it – confirm no native terminal widget is "showing through".
- Compare fidelity: run a TUI-heavy thing (ls --color, vim, htop, etc.).
- Switch back to vte-experimental on same surface → seamless.
- Check no breakage to existing terminals (normal ws, other pizarra with vte or stub).

**Next after plan approval**: Start Phase 0 (add deps + skeletons), then implement Rust host first (core value).

This plan is designed so each phase can be reviewed/ tested incrementally, and the whole thing is behind the choice of mode, so safe to experiment.

References: previous research doc `docs/ALTERNATIVE_TERMINAL_VIEWS_RESEARCH.md`, current code in CanvasTerminal (forces native), TerminalTTY (canvas consumer + isCanvasMode), native_vte (pattern for host + commands), capabilities.js.

Ready to execute when you say "go" or pick a phase to start. Which part first, or any adjustment to the plan?
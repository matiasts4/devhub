# Alternative Terminal View Types Research (for Pizarra + High-Fidelity TUIs)

**Date**: 2026-06 (deep investigation requested by user)
**Context**: DevHub uses Tauri + GTK4 on Linux. Primary terminal is native VTE widget (via zoha-vte, which wraps the C libvte used by GNOME Terminal) for main workspace panels. This gives excellent TUI fidelity (OpenCode, Grok Build, Zed, etc.).

**Problem for Pizarra**:
- Pizarra surfaces (terminal cards + browser cards) live in web/DOM (canvas/Konva stacking for z-order, drag, etc.).
- To show "native" terminal content in a pizarra card, we currently have two paths:
  1. Direct native VTE widget: Position/raise/resize the real VTE widget in the shared GTK overlay to cover the card's content rect (header is web chrome). Good fidelity, but native VTE widget and native browser (WebKit) widgets compete in GTK overlay z-order/paint. User reports superposition when dragging browser surfaces "over" terminal cards in pizarra ("la terminal se sigue superponiendo").
  2. "canvas" mode (current "externo"): Basic WS PTY + stripAnsi + 2d canvas text drawer inside the pizarra card. Pure web → perfect DOM layering with browser surfaces. But low fidelity (no colors, no proper cursor/scrollback/attrs, breaks TUIs). User explicitly rejects anything xterm-like or basic for this reason.

User constraints (repeated):
- "xterm no es opcion ya que rompe todas las vistas de las tui", "se ve mal las TUI".
- Prefer "utilizar la terminal nativa".
- For pizarra overlays: need view that allows arbitrary web surfaces on top without forcing suspend or visual breakage.
- "quiero que continues con la mejor opcion sin intentar aun lo de mejorar la suspension", "no hay nada aparte de el native vte y xterm que pueda utilizar?" → wants deeper research into "otro tipo de terminal" / "otro tipo de vista".

**Current Renderer Modes** (see `src/components/terminal/terminalRendererCapabilities.js`):
- `vte-experimental`: GTK VTE widget (native, high fidelity, used in main ws + carve for web popups).
- `xterm`: xterm.js (web, forbidden for pizarra TUIs).
- `canvas`: Basic stub for pizarra (web view, low fidelity).

The "nuevo tipo" work (offscreen VTE + texture) was an attempt at #3 using the *same* VTE engine but headless + export.

## Deep Research: Other Options for "Otro Tipo de Terminal / Vista"

I investigated via:
- `cargo tree`, `cargo search`, Cargo.lock, local cargo registry scan.
- rg across source + registry for parsers/renderers.
- web_search for real-world usage in similar "terminal on canvas / infinite board / embedded in app" projects (Zed, Horizon, iced_term, gpui-terminal).
- Analysis of current PTY (VTE spawn_sync inside widget) and rendering (pango + GTK overlay).
- Knowledge of Rust terminal ecosystem (alacritty, wezterm, etc.).

### 1. Best Concrete Alternative: `alacritty_terminal` + Custom Renderer (Strongly Recommended New "Tipo de Vista")

**Crate**: `alacritty_terminal` (v0.26+ as of search). "Library for writing terminal emulators". Decoupled from any UI/widget.

**Why this is "otro tipo"**:
- Not the GTK VTE widget.
- Not xterm.js or basic canvas stub.
- It's a full, production-grade, headless terminal *engine* (VT parser, grid, scrollback, selection, SGR attrs, cursor, mouse, OSC, etc.).
- Alacritty itself (the fast GPU terminal) is built on it. Many apps embed it.

**Real-world precedent (very close to pizarra use case)**:
- **Zed editor**: Uses `alacritty_terminal` for their terminal integration (including "headless" for persistent sessions across restarts via `Term::snapshot`). They have `gpui-terminal` wrapper. "VTE-compliant terminal powered by alacritty_terminal". Supports full emulation + custom rendering.
- **Horizon** (GPU-accelerated terminal board on infinite canvas): "multiple terminal sessions as freely positioned, resizable panels on a canvas". Stack: Rust + egui/wgpu + `alacritty_terminal` for VT parsing + PTY + event loop. Per-frame: drain PTY → update Term grid → render to egui. Exactly the "pizarra of terminals" pattern.
- `iced_term`: Iced widget powered by it.
- Other: `emux-term`, etc.

**How it would work here (for pizarra "vista")**:
- Add dep: `alacritty_terminal = "0.26"` (and `portable-pty = "0.9"` or `nix` for PTY spawning, since we won't use VTE's spawn).
- New Rust "host" (similar to NativeVtePanelHost): `AlacrittyTextureHost` or in a new `src-tauri/src/alacritty_terminal_host.rs`.
  - Owns PTY (master/slave via portable-pty), `alacritty_terminal::Term`, event loop/thread to read PTY and `term.process` incoming bytes.
  - On updates (or on demand / timer / commit-like), "render" the current view of the grid to pixels:
    - Reuse existing font (pango + the monospace they already resolve for VTE).
    - Use `cairo::ImageSurface` + `pango::Layout` / `pango::FontDescription` to draw each cell (fg/bg, bold/italic/underline via attrs, cursor).
    - Or modern: add `cosmic-text` for better layout/ligatures.
    - Produce `gdk::Texture` (or raw RGBA bytes).
  - Expose commands: open (spawn shell), resize (Term::resize + PTY), write input (to PTY), close.
  - Emit Tauri events: "terminal:frame" { panelId, format: "rgba" | "texture", width, height, data: base64 or bytes } on dirty updates. Or a "snapshot" command for initial.
- In JS:
  - New mode in `TERMINAL_RENDERER_MODES`: e.g. `'alacritty-texture'` or `'headless-emulator'`.
  - Label: "Alacritty (texture / pizarra high-fidelity)".
  - In TerminalTTY: when this mode, render `<canvas>`, listen for frames, `putImageData` (or drawImage if png).
  - Input: key handlers → send to bridge (new `writeAlacritty` or reuse generalized write).
  - For pizarra: `CanvasTerminal` can use this mode (or default to it for "otro tipo"). Pure web canvas inside card → **zero native widget z-fighting** with browser surfaces. Perfect arbitrary overlays in pizarra while using a real high-fidelity engine.
- For main workspace: Keep `vte-experimental` (widget) for best integration with existing overlay, carve, raises, native browser coexistence, etc. Or make this new mode available everywhere.
- PTY note: Current native path uses VTE's internal spawn. For this, we'd manage PTY in Rust (portable-pty is cross-platform, works on Linux with the zsh/bash they use). The existing node sidecar PTY can be an alternative backend.

**Pros**:
- True alternative engine (not "just another view of the same VTE").
- Excellent TUI fidelity (Alacritty is praised for it; used in serious editors).
- Natural for texture/canvas view → solves pizarra superposition without suspend or widget tricks.
- Headless by design (no GTK widget required for the view).
- Can snapshot state easily (Zed does this for persistence).
- Performance: Can be GPU if we later add wgpu, but cairo/pango is fine and reuses existing stack.

**Cons / Tradeoffs**:
- Work to implement renderer (cell-by-cell drawing, font metrics, attr mapping, sixel/graphics if wanted, selection highlight, etc.). Not trivial (Zed/Horizon invested in it), but incremental: start with basic grid + pango cells, match current VTE look.
- Need separate PTY management (small crate).
- Duplication of some "terminal host" logic (open/resize/input/close) unless we abstract a common `TerminalHost` trait.
- Adding deps increases binary size slightly (but alacritty_terminal is focused).
- Initial fidelity may need tuning to match libvte exactly on edge cases (but Alacritty is very complete).

**Implementation sketch cost**: Medium. Could start with a new mode that falls back, add the host behind a feature flag or always (Linux only for now).

### 2. Pure `vte` Parser Crate + Same Custom Renderer (Lighter Variant of #1)

- Crate: `vte = "0.15"` (the parser, "Parser for implementing terminal emulators"). Note: different from zoha-vte (the widget binding).
- You implement the `vte::Perform` / handler trait for print, control chars, CSI, etc., building your own `Grid` / screen buffer (like a mini alacritty_terminal).
- Then same rendering to cairo texture as above.
- Pros: Smaller dep than full alacritty_terminal if you only need core VT.
- Cons: You re-implement more (alacritty_terminal already has the grid, selection, etc. battle-tested).
- From search: This is what many custom emulators start with. `vte-graphics` fork exists for sixel etc.

This is "implementing otro tipo" from scratch on the parser.

### 3. Enhance / Complete Current VTE Offscreen + Real Snapshot (Not "Otro Engine", but "Otro Vista" of the Best Engine)

- We already have the skeleton (offscreen creation in native_vte.rs, contents-changed hook, emit "terminal:frame", canvas consumer in TTY + pizarra).
- Current stub is placeholder (solid + bar for "live" proof).
- To make it real: Implement proper pixel export.
  - Use `gtk::Snapshot` + `terminal.snapshot(...)` (or upcast to Widget).
  - `snapshot.to_paintable(...)` → downcast to `gdk::Texture`.
  - `texture.download(&mut buf, stride)` for raw RGBA.
  - Or use `cairo::ImageSurface` + force draw if snapshot needs realized widget.
  - For detached/offscreen: May need a hidden `gtk::Window` + `Fixed` as "snapshot host" to ensure allocation/realization without showing to user (common pattern).
  - Throttle emits (RAF or dirty flag + 30-60fps cap).
- Pros: Uses the *exact same* high-fidelity VTE engine as main native panels (best TUI compat). No new parser/renderer bugs. Texture export solves layering perfectly for pizarra (web canvas consumer).
- Cons: Still "based on VTE", not a wholly different engine. Snapshot perf (copying pixels) may need optimization vs live widget.
- Status in code: The structure + guards (to avoid GTK move_ crashes on non-child) + size handling for offscreen + improved stub size from last_bounds are in place. Just needs the real snapshot impl (and perhaps the hidden host window for robustness).

This matches "otro tipo de vista" (headless texture view vs live widget view) of the native VTE.

### 4. Other / Less Viable Options Found
- **WezTerm's termwiz**: Similar to alacritty_terminal, full model for custom UIs. Good, but less "drop-in examples" in canvas apps than alacritty.
- **par-term-emu-core-rust**: "Comprehensive terminal emulator library in Rust with Python bindings". Sounds full-featured (VT100/220/320). Could be another engine option if alacritty doesn't fit.
- **ratatui / tui-rs backends**: These are for *building* TUIs, not embedding arbitrary shells. Not suitable (you'd be running the shell inside ratatui, losing the real $SHELL experience).
- **System embedding hacks** (X11 window ID of a real terminal into GTK, or sub-webview with terminal page): Terrible (brittle, no control, perf, security, cross-platform death on Linux-only GTK focus).
- **Improve xterm.js canvas renderer**: Forbidden by user.
- **Custom from raw PTY + your own ANSI state machine**: Possible but you end up reinventing vte/alacritty (error-prone for real TUIs with complex escapes, OSC, mouse, etc.).
- **GPU via wgpu + alacritty style**: Future optimization if we go the alacritty route (Horizon does this).

**No "magic third widget"** like a drop-in "VteTexture" or "headless-vte-widget" that paints without participating in overlay z. The C libvte is widget-oriented; the view is the widget.

### Recommendation for This Project
1. **Short term (to unblock pizarra without "externo" user doesn't want + without xterm)**: Use the direct native VTE *widget* for pizarra terminal surfaces (as the latest change did). Improve raise coordination if superposition persists (listen to pizarra surface z changes → reorder *all* pizarra natives in the overlay by desired paint order).
2. **For a true "otro tipo de vista" (decoupled, texture-first, perfect for pizarra layering while high fidelity)**: Prototype `alacritty_terminal` as new mode `'alacritty-texture'`.
   - Start in Rust: new host that owns Term + PTY.
   - Renderer: pango/cairo to Texture (reuse font logic from current VTE).
   - Expose same open/resize/write/close + frame events.
   - Wire in capabilities, TTY canvas consumer (already prepared), pizarra.
   - Can coexist with VTE widget (use widget where overlay integration matters; texture where pure web pizarra layering matters).
3. **Parallel / fallback**: Finish the real snapshot in the existing offscreen VTE path (it's "using native VTE" in a different *view* mode). Low risk, high compatibility.

This gives users (and pizarra) options:
- `vte-experimental` (widget, native integration).
- `alacritty-texture` (new engine, texture view, great for canvas/pizarra).
- `canvas` (basic fallback, or the stub for the above until renderer done).

**Next if you want to proceed on one**:
- Tell me which option (alacritty new engine, finish VTE snapshot, or widget + z-coordinator).
- I can add the dep, stub the host struct, update capabilities, etc.
- Tradeoff note: Adding a second engine increases maintenance (two PTY paths, two render paths), but gives exactly the "otro tipo" flexibility for different views (main vs pizarra).

Sources: cargo searches, registry inspection, GitHub projects (Zed, Horizon), crate docs via search, current codebase analysis.

This is deeper than previous (explored real usage in canvas-like UIs, concrete crates, integration path with existing pango/GTK/PTY, pros/cons vs current VTE widget and the basic canvas).

If you have a specific "some other one" in mind (e.g. a particular crate or approach you saw), tell me the name and I'll dig specifically into it.
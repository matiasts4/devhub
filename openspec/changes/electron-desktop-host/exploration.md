# Exploration: electron-desktop-host

## Exploration: Migrate DevHub desktop shell Tauri → Electron with native browser embed

### Current State

DevHub product logic (Next/React SPA, sidecar + node-pty, multi-terminals, swarm, Pizarra) is **shell-agnostic**. The desktop host is Tauri 2 (`src-tauri/`).

**Native browser dock** is implemented only on **Linux** via WebKitGTK overlay in `src-tauri/src/native_browser.rs`. On **Windows/macOS**, every native browser command returns `unsupported-platform` (`unsupported_platform_reason()`), and the UI falls back to **iframe** (X-Frame-Options breaks many real sites). Pack D (WebView2 HWND child) was abandoned for thrash/z-order; Electron is the chosen path, not a Pack D retry.

**JS bridge** (`src/lib/browser/nativeBrowserBridge.js`) sniffs `window.__TAURI_INTERNALS__` and `invoke`s:

| Command                              | Purpose                       |
| ------------------------------------ | ----------------------------- |
| `native_browser_probe`               | Capability probe              |
| `native_browser_open`                | Open panel host               |
| `native_browser_load_url`            | Navigate                      |
| `native_browser_reload`              | Reload                        |
| `native_browser_resize`              | Bounds update (rAF-coalesced) |
| `native_browser_focus` / `raise`     | Focus/z-order                 |
| `native_browser_set_visibility`      | Show/hide                     |
| `native_browser_selector_command`    | Inspect/select overlay        |
| `native_browser_select_all` / `copy` | Edit ops                      |
| `native_browser_close`               | Destroy panel                 |

Events: Tauri event `native-browser-event` → DOM `devhub:native-browser-event`. Avoid-rects via `devhub:register-avoid-rect`.

**Other Tauri invoke surface** (`lib.rs` generate_handler + plugins):

- Clipboard: `read_system_clipboard_text`, `read_system_clipboard_image`, `write_clipboard_image_to_temp_file`
- Voice: `voice_*` (toggle, settings, start/stop, speak)
- Dispatch: `dh_dispatch_action`
- Plugins: shell, dialog, notification
- Window APIs used from JS: `@tauri-apps/api/window`, `webviewWindow`, titlebar minimize/maximize/close
- Runtime: `window.__TAURI_INTERNALS__` / `__TAURI__` sniffs (browser, terminal renderer prefs, ProjectHub)

**Sidecar / packaging** (in `lib.rs`): extract/install `standalone.zip`, spawn Node server + sidecar ports (dev 4001 / prod 4000), zombie cleanup, tray, single-instance, window recovery. Product UI loads Next standalone or dev URL.

Prior analysis: `docs/analisis-migracion-electron.md` (E0–E4, 10–16 weeks full parity). Option A (zip prune / xterm warm) remains orthogonal.

### Affected Areas

- `src-tauri/**` — current host; keep as rollback; do not delete in phase 1
- `src/lib/browser/nativeBrowserBridge.js` — primary adapter target
- `src/components/workspace/useNativeBrowserSurface.js` — bounds, avoid-rects, open recovery
- `src/components/workspace/WorkspaceBrowserPane.jsx` — pane + optional WebviewWindow
- `src/components/pizarra/PizarraBrowserSurface.jsx` — Pizarra native/iframe path
- `src/components/TitleBar.jsx`, `PageHeader.jsx` — window controls
- `src/lib/terminal/terminalClipboard.js` — system clipboard invokes
- `src/lib/voice/*`, `ZedVoiceSettings.jsx` — voice invokes
- `src/views/ProjectHub.jsx`, `Ajustes.jsx` — dialog plugin + Tauri sniff
- `package.json` scripts — `tauri:*`; add Electron scripts alongside
- New tree `desktop/electron/` (recommended) — main/preload/browser host

### Approaches

1. **Electron-first Windows host + desktop adapter layer** — New Electron main/preload under `desktop/electron/`; unified `desktopBridge` (or extend `nativeBrowserBridge`) that prefers Electron IPC, falls back to Tauri, then fail-closed web. Tauri retained for Linux rollback and dual packaging until Electron verified.
   - Pros: Solves Windows native browser; clean security model; JS-only host; product stack untouched
   - Cons: Shell rewrite; dual maintain temporarily; larger installer
   - Effort: High (phased E0–E4)

2. **Dual shell forever (feature-flag host)** — Ship both Tauri and Electron indefinitely with shared adapters only.
   - Pros: Platform flexibility (keep GTK on Linux)
   - Cons: Ongoing dual cost; two packaging pipelines; split QA
   - Effort: High ongoing

3. **Pack D retry (WebView2 HWND in Tauri)** — Rejected by product decision.
   - Pros: No host rewrite
   - Cons: Historical thrash; not chosen
   - Effort: Medium–High risk

4. **Electron browser-helper process only** — Keep Tauri shell, spawn Electron for browser dock.
   - Pros: Smaller surface
   - Cons: Fragile process/window parenting; dual Chromium/WebView2; not recommended in analysis
   - Effort: Medium, high operational risk

### Recommendation

**Approach 1: Electron-first on Windows** with a thin **desktop-bridge adapter** so React call sites change minimally. Keep `src-tauri` for rollback until Electron E1+ smoke is green. Primary product win: **WebContentsView** dock browser on Windows (not iframe). Overlays cannot use pure CSS z-index over WebContentsView — design must use hide/bounds/avoid-rects/view-stack.

Do **not** rewrite Next, sidecar, multi-terminals, swarm, or Pizarra logic. Option A work stays orthogonal.

### Risks

- Overlay/z-order regressions (Pack D class of bugs) on dock resize and modals
- Dual packaging confusion until Tauri is demoted
- Installer size growth (Chromium + standalone)
- Incomplete invoke parity (voice, multi-window, dialog) if E0 scope creeps
- `__TAURI__` sniffs scattered in UI (must map to `isDesktopHost()` / Electron flag)

### Ready for Proposal

**Yes.** Capabilities: `electron-shell-host`, `desktop-bridge-adapter`, `electron-native-browser`, `electron-browser-overlays`, `electron-packaging`. Success criteria: Windows dock opens real site (XFO), terminal session via sidecar works, installer/smoke path defined.

### Orchestrator notes

- Artifact store: hybrid
- Branch: `feature/electron-desktop-host`
- Task subagent tool unavailable this session — exploration written inline from live code + graphify

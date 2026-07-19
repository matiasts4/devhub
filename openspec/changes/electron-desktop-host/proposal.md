# Proposal: electron-desktop-host

## Intent

Make **Electron** the primary **Windows** desktop host for DevHub so the right-dock / Pizarra browser can use a real **WebContentsView** (Chromium child) instead of iframe fallback. Keep product logic (Next SPA, sidecar node-pty, multi-terminals, swarm, Pizarra) unchanged. Keep Tauri as rollback until Electron is verified.

## Why now

- On Windows, `native_browser_*` returns `unsupported-platform`; users get iframe (XFO blocks many sites).
- Pack D WebView2 HWND was abandoned; product chose Electron, not Pack D retry.
- Analysis exists (`docs/analisis-migracion-electron.md`, E0–E4). User approved evaluation of full experience including native browser.
- Option A (zip prune / xterm warm) is orthogonal and must not block this change.

## Scope

### In scope

1. Electron main/preload/BrowserWindow host scaffold (`desktop/electron/`).
2. Desktop bridge adapter: fail-closed web; Electron IPC preferred; Tauri path retained.
3. Native browser via WebContentsView: open/load/resize/focus/visibility/close, partitions, events.
4. Overlay contract: modal hide, avoid-rects, bounds sync (no pure CSS z-index over WCV).
5. Sidecar + Next load path from Electron main (dev URL and packaged standalone).
6. Packaging path (electron-builder/NSIS) and dual scripts (Electron primary Windows; Tauri still buildable).
7. Phased delivery E0–E4 with ~400 LOC review units / chained PR slices.

### Out of scope

- Rewriting TWM, TerminalTTY, swarm, Pizarra business logic.
- Deleting `src-tauri` in phase 1.
- Full Linux host cutover (may keep Tauri/GTK longer).
- Option A cold-path work as a dependency.
- Pixel-clone of OpenCode Desktop (reference only).

## Capabilities

### New capabilities

- **`electron-shell-host`** — Main process, preload, BrowserWindow, single-instance, tray, lifecycle, load UI.
- **`desktop-bridge-adapter`** — Unified desktop API over Electron IPC (invoke-compatible shapes where practical).
- **`electron-native-browser`** — WebContentsView dock browser: open/load/resize/focus/visibility/close, partitions, events.
- **`electron-browser-overlays`** — Modal hide, avoid-rects, Pizarra/right-dock bounds sync with WCV stack.
- **`electron-packaging`** — electron-builder/NSIS, spawn Next standalone + sidecar, dual packaging scripts.

### Modified capabilities (existing product specs)

- Browser preview lifecycle / pane surfaces gain Electron-ready runtime detection (delta only; product behavior preserved).
- Clipboard / titlebar / dialogs rebind through adapter over time (E1+).

## Approach (summary)

Scaffold Electron host → adapter for existing bridges → fixed-rect WCV spike (E0) → shell parity (E1) → full dock + overlays (E2) → voice/multi-window (E3) → packaging/hardening (E4). Rollback: ship Tauri builds from `src-tauri` until Electron verified.

## Success criteria

1. Windows: browser dock opens a real site that sets X-Frame-Options (not iframe-only).
2. Terminal session works (sidecar PTY + existing UI) under Electron.
3. Installer/smoke path documented and runnable for E0 (dev) then E1+ (packaged).
4. Web/browser mode remains fail-closed (no crash when Electron APIs absent).
5. `src-tauri` still builds for rollback.

## Assumptions

1. Windows-first; Electron becomes primary Windows host after E0 green.
2. Adapter minimizes React churn; prefer matching existing payload shapes.
3. Overlays must hide or reflow WCV; CSS alone is insufficient.
4. Dual maintain ends when Electron passes packaging + regression suite (E4).

## Rollback

- Continue releasing Tauri via existing `tauri:build` / `src-tauri`.
- Feature-detect host; do not remove Tauri packaging scripts until explicit cutover decision.
- No force-push; no rewrite of baseline `34cd8dae` history.

## Risks

| Risk                          | Mitigation                                                        |
| ----------------------------- | ----------------------------------------------------------------- |
| Overlay thrash (Pack D class) | Explicit hide/bounds/avoid-rect design; E2 QA matrix              |
| Scope creep beyond E0         | Apply only E0 in first implementation batch                       |
| Dual packaging confusion      | Docs + npm scripts naming (`electron:dev` vs `tauri:dev`)         |
| Installer size                | Accept Chromium cost; document; prune zip via Option A separately |

## Ready for specs

Yes — proceed to delta specs for the five new capabilities.

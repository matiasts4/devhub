# Apply progress: electron-desktop-host

**Branch:** `feature/electron-desktop-host`  
**Last updated:** 2026-07-18  
**Delivery:** E0–E4 host + SPA adapters + DOM webview dock browser

---

## Executive summary

| Batch  | Intent                                          | Status                                                     |
| ------ | ----------------------------------------------- | ---------------------------------------------------------- |
| **E0** | Spike MVP host + bridge + browser surface       | **Done**                                                   |
| **E1** | Shell parity + packaging runtime + NSIS config  | **Done**                                                   |
| **E2** | Overlays, workspace hide/show, dock integration | **Done** (manual visual QA for human)                      |
| **E3** | Voice + multi-window + Linux decision           | **Done** (voice engine deferred by design; Web Speech TTS) |
| **E4** | Docs, cutover, QA matrix, smoke, window restore | **Done**                                                   |

**Tasks:** 45/45 · **Apply:** complete · **Verify:** PASS WITH WARNINGS · **Production cutover:** not started (W1–W8)

---

## Batch E0 — Spike MVP

### Status: Complete

| Task    | Notes                                                      |
| ------- | ---------------------------------------------------------- |
| E0.1.\* | `desktop/electron` main, window, preload, sidecar, README  |
| E0.2.\* | `desktopRuntime` + `desktopBridge` + `nativeBrowserBridge` |
| E0.3.\* | Browser registry/IPC + DOM `<webview>` path in SPA         |
| E0.4.\* | bounds + bridge + pool unit tests                          |
| E0.5.\* | sidecar helper, smoke-e0, `electron:up`                    |

---

## Batch E1 — Shell parity

### Status: Complete

| Task                  | Evidence                                                   |
| --------------------- | ---------------------------------------------------------- |
| Titlebar IPC          | `ipc/shell.js` window_minimize/maximize/…                  |
| Single-instance       | `main.js` requestSingleInstanceLock                        |
| Tray                  | `tray.js`                                                  |
| Dialog open           | shell dialog_open                                          |
| Clipboard text/image  | shell clipboard handlers + SPA adapters                    |
| Runtime extract/spawn | `packaging/runtime.js`                                     |
| electron-builder      | `electron-builder.yml`, `electron:pack` / `electron:build` |

### Open (operator)

- NSIS install/uninstall smoke on clean PC

---

## Batch E2 — Full browser dock

### Status: Complete

| Task                                  | Evidence                                                   |
| ------------------------------------- | ---------------------------------------------------------- |
| DOM webview dock                      | `ElectronWebviewBrowser` + `electronWebviewPool`           |
| Warm session across workspace         | In-place park; no reload on re-activate when URL unchanged |
| Copy / select-all                     | webContents / guest APIs                                   |
| Selector                              | `selector-deferred` stub (documented)                      |
| Avoid-rects / hideAll / showWorkspace | `browser/*` registry retained for compat                   |
| Partition policy                      | `persist:devhub-browser-${projectId}`                      |

### Open (operator)

- qa-matrix BR-_ / OV-_ human sign-off

---

## Batch E3 — Voice + multi-window

### Status: Complete (with documented deferrals)

| Task              | Evidence                                                              |
| ----------------- | --------------------------------------------------------------------- |
| Voice IPC surface | `voice.js` — enabled/settings; engine/speak `voice-deferred-electron` |
| Multi-window      | `multiWindow.js`                                                      |
| Linux decision    | Electron primary Windows; keep Tauri Linux until Electron Linux smoke |

---

## Batch E4 — Hardening

### Status: Complete

| Deliverable                   | Path                                      |
| ----------------------------- | ----------------------------------------- |
| Cutover gates                 | `cutover-checklist.md`                    |
| QA matrix                     | `qa-matrix.md`                            |
| Operator guide                | `docs/electron-desktop-host.md`           |
| Embed model                   | `browser-embed-model.md`                  |
| Structural smoke              | `desktop/electron/scripts/smoke-full.cjs` |
| Window restore / crash reload | `windowState.js`                          |
| Verify report                 | `verify-report.md`                        |

---

## Risk / dual-shell

- Keep `src-tauri` for Linux + Windows rollback.
- Stop Tauri **Windows** builds only after cutover gates W1–W8.
- Voice deferred: SPA Web Speech is the Electron TTS path.

---

## Checkpoint commit

```text
feat(electron): complete desktop host migration (E0–E4)
```

Do not mark production cutover complete until qa-matrix critical path + NSIS smoke pass.

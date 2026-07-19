# Tasks: electron-desktop-host

Legend: **(P)** parallelizable · **(S)** sequential · **[ ]** pending · **[x]** done · **[~]** partial

**Evidence date:** 2026-07-18 (re-read after parallel E1–E3 landings)

---

## Review Workload Forecast

- Estimated full change: large (well over 400 LOC across E0–E4)
- **Chained PRs recommended: Yes**
- **400-line budget risk: High**
- **Decision needed before apply: No**
- First apply slice: **E0** (landed); E1–E3 code streams landed in parallel; E4 docs/smoke this batch

---

## E0 — Spike MVP

### E0.1 Electron scaffold **(P)**

- [x] E0.1.1 Create `desktop/electron/` tree: `main.js`, `window.js`, `preload.js`, `sidecar.js`
- [x] E0.1.2 BrowserWindow factory: `contextIsolation`, no `nodeIntegration`, load `DEVHUB_ELECTRON_URL` or default localhost:3000
- [x] E0.1.3 Root `package.json` scripts: `electron:dev`, `electron:start`; `electron` devDependency
- [x] E0.1.4 README snippet `desktop/electron/README.md`

### E0.2 Preload + desktop bridge **(P)**

- [x] E0.2.1 Preload `contextBridge` → `window.devhubDesktop`
- [x] E0.2.2 `src/lib/desktop/desktopBridge.js` + `desktopRuntime.js` (Electron → Tauri → web)
- [x] E0.2.3 Wire `nativeBrowserBridge.js` through desktopBridge
- [x] E0.2.4 Unit tests: runtime detection + fail-closed web shapes

### E0.3 WebContentsView browser host **(P)**

- [x] E0.3.1 `registry.js` + `ipc.js`: open/load/resize/visibility/close
- [x] E0.3.2 Fixed default rect + IPC resize; partition `persist:devhub-browser-dock`
- [x] E0.3.3 Emit navigation/fail events to renderer
- [x] E0.3.4 Document overlay hide via visibility command

### E0.4 Bounds/IPC unit tests **(P)**

- [x] E0.4.1 `bounds.js` clamp/normalize + Jest tests
- [x] E0.4.2 IPC payload contract fixtures (open/resize/close shapes)

### E0.5 Sidecar + smoke **(S)**

- [x] E0.5.1 Sidecar attach/spawn helper
- [x] E0.5.2 Smoke script `smoke-e0.cjs` + npm script
- [x] E0.5.3 Manual verification notes in apply-progress

---

## E1 — Shell parity

### E1.1 Window chrome & OS integration **(S)**

- [x] E1.1.1 Titlebar minimize/maximize/close IPC — `ipc/shell.js` / `shell.js` window\_\* handlers
- [x] E1.1.2 Single-instance lock — main + second-instance focus
- [x] E1.1.3 Tray icon + show/quit — `tray.js` wired from main
- [x] E1.1.4 Dialog open (folder/file) — shell dialog_open handlers
- [x] E1.1.5 Clipboard text/image IPC — read/write text + image temp file in shell IPC

### E1.2 Runtime packaging path **(S)**

- [x] E1.2.1 Extract/locate standalone.zip — `packaging/runtime.js`
- [x] E1.2.2 Spawn Next standalone + sidecar from packaged mode — `packaging/runtime.js` + main ensureRuntime
- [x] E1.2.3 electron-builder NSIS config — `electron-builder.yml` + `electron:pack`/`electron:build` scripts; installer operator smoke deferred to human

---

## E2 — Full browser dock

### E2.1 Bridge completeness **(S)**

- [x] E2.1.1 Multi-panel registry + raise/focus (+ SPA DOM webview primary path)
- [x] E2.1.2 Selector/copy/select-all — copy/selectAll implemented; selector returns `selector-deferred` (documented)
- [x] E2.1.3 Partition policy — `persist:devhub-browser-${projectId}` / dock default
- [x] E2.1.4 Pizarra + right-dock integration — workspace warm park, host effects hook (manual visual QA still in qa-matrix)
- [x] E2.1.5 Warm webview pool — no full reload on workspace re-activate when URL unchanged

### E2.2 Overlays **(S)**

- [x] E2.2.1 Modal → hide intersecting WCVs — visibility + hideAll path in registry
- [x] E2.2.2 Avoid-rect strategy — `browser/avoidRects.js` + `setAvoidRects`
- [x] E2.2.3 Workspace switch hide/show — `hideAll` / `showWorkspace` in registry + IPC

---

## E3 — Voice + multi-window

- [x] E3.1 Voice engine handlers — `voice.js` stable shapes; Piper/STT deferred; SPA Web Speech TTS path kept
- [x] E3.2 Extra BrowserWindow parity — `multiWindow.js` present and routed
- [x] E3.3 Linux host decision — recorded in cutover-checklist (Electron Win primary; keep Tauri Linux until Electron Linux smoke)

---

## E4 — Hardening

- [x] E4.1 Crash recovery / window restore — `windowState.js` bounds persist + render-process-gone reload
- [x] E4.2 Regression suite — `regression-checklist.md` + `qa-matrix.md` + smoke scripts (UI automation later)
- [x] E4.3 Packaging docs + cutover checklist — operator guide + cutover-checklist
- [x] E4.4 Stop-building-Tauri-Windows decision record — **deferred** with gates W1–W8

### E4 extras

- [x] QA matrix `qa-matrix.md`
- [x] Structural smoke `desktop/electron/scripts/smoke-full.cjs`
- [x] Regression checklist `desktop/electron/scripts/regression-checklist.md`
- [x] verify-report + apply-progress E0–E4 notes
- [x] Analysis status section in `docs/analisis-migracion-electron.md`
- [x] `package.json` script `electron:smoke` → smoke-full

---

## Parallel apply map (historical E0)

| Agent | Paths                       | Tasks |
| ----- | --------------------------- | ----- |
| A     | main/window/sidecar/scripts | E0.1  |
| B     | preload + src/lib/desktop   | E0.2  |
| C     | browser/\*                  | E0.3  |
| D     | bounds + tests              | E0.4  |

## Work unit commits (suggested)

1. `feat(electron): E0 host + WebContentsView`
2. `feat(electron): E1 shell/tray/clipboard/dialog + packaging runtime`
3. `feat(electron): E2 avoid-rects / hideAll / showWorkspace`
4. `feat(electron): E3 multi-window + voice deferred stubs`
5. `docs(electron): E4 cutover, QA matrix, operator guide, smoke-full`

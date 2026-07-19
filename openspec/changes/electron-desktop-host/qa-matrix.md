# QA matrix: Electron desktop host

**Branch:** `feature/electron-desktop-host`  
**Date:** 2026-07-18  
**Host under test:** Electron (`desktop/electron`) + SPA + sidecar  
**Baseline compare:** Tauri Windows (iframe browser) / Tauri Linux (GTK browser)

Fill **Result** with `PASS` | `FAIL` | `SKIP` | `BLOCKED` and notes.

**Implementation note (2026-07-18):** Host code for shell, DOM webview dock browser + warm pool, overlays, packaging config, and multi-window is present. Voice engine and selector inspect remain deferred. Rows still need **operator Result** fill-in; do not treat code presence as PASS.

---

## 1. Browser dock

| ID    | Scenario                       | Steps                                                                                                     | Expected                                              | Impl readiness       | Result        | Notes |
| ----- | ------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------- | ------------- | ----- |
| BR-01 | **XFO / frame-busting site**   | Open panel via `native_browser_open` with a site that sets `X-Frame-Options: DENY` or CSP frame-ancestors | Content renders in WebContentsView (not blank iframe) | E0 code              |               |       |
| BR-02 | example.com open               | Probe → open `https://example.com` fixed bounds                                                           | `opened: true`; view visible                          | E0                   |               |       |
| BR-03 | Load URL                       | `native_browser_load_url` to second URL                                                                   | Navigates; `navigated`/`loaded` events                | E0                   |               |       |
| BR-04 | Reload                         | `native_browser_reload`                                                                                   | Page reloads                                          | E0                   |               |       |
| BR-05 | **Multi-panel**                | Open two panelIds with different bounds/URLs                                                              | Both views present; independent nav                   | E0 registry          |               |       |
| BR-06 | Resize                         | Drag dock / call `native_browser_resize` repeatedly                                                       | Bounds track; minimal thrash; clicks still work       | E0                   |               |       |
| BR-07 | Focus / raise                  | Focus panel B then A                                                                                      | Input goes to raised panel                            | E0 raise/focus       |               |       |
| BR-08 | Visibility hide                | `set_visibility` visible:false                                                                            | View zero-bounds / hidden; not destroyed              | E0                   |               |       |
| BR-09 | Visibility show                | visible:true + bounds                                                                                     | Restores without reload required                      | E0                   |               |       |
| BR-10 | Close                          | `native_browser_close`                                                                                    | View removed; re-open works                           | E0                   |               |       |
| BR-11 | Partition                      | Two panels same partition share cookies                                                                   | Session persists across open (profile)                | E0 partition         |               |       |
| BR-12 | Fail-load                      | Open invalid URL / offline                                                                                | `fail-load` event; no host crash                      | E0                   |               |       |
| BR-13 | Selector / copy                | selector_command, copy, select_all                                                                        | copy/selectAll work; selector deferred                | E2 stub              | SKIP selector |       |
| BR-14 | **Workspace switch no-reload** | Load site → switch workspace → return                                                                     | Same URL restores without full page reload            | pool + surfaceActive |               |       |

---

## 2. Overlays / workspace / Pizarra

| ID    | Scenario             | Steps                                               | Expected                                                                    | Impl readiness                   | Result | Notes |
| ----- | -------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------- | ------ | ----- |
| OV-01 | **Modal hide**       | Open browser panel; open app modal over dock region | Browser hidden via visibility IPC before modal; no click-through to site    | E0 visibility; full auto hide E2 |        |       |
| OV-02 | Modal dismiss        | Close modal                                         | Browser shown again at prior bounds                                         | E2 contract                      |        |       |
| OV-03 | Avoid-rects          | Floating chrome over dock                           | Panel clipped/resized around rects                                          | E2 code                          |        |       |
| OV-04 | **Workspace switch** | Browser open → switch workspace → return            | Hidden on leave; restored on return (or explicit hide_all / show_workspace) | E2 code                          |        |       |
| OV-05 | Pizarra + dock       | Resize Pizarra / right dock with browser open       | Bounds sync; no z-order dead zone                                           | E2 integration                   |        |       |
| OV-06 | Right-dock browser   | Open browser in right dock layout                   | Fits dock; survives layout toggle                                           | E2                               |        |       |

---

## 3. Terminal

| ID    | Scenario                  | Steps                                                 | Expected                                    | Impl readiness       | Result | Notes |
| ----- | ------------------------- | ----------------------------------------------------- | ------------------------------------------- | -------------------- | ------ | ----- |
| TM-01 | **Terminal session**      | Sidecar healthy; open Terminales; create session      | PTY live; input/output                      | Shell-agnostic (E0+) |        |       |
| TM-02 | Multi-split               | 2–4 splits                                            | All panes usable                            | Product stack        |        |       |
| TM-03 | Swarm grid                | Start small multi-agent layout                        | No persistent black panels                  | Product stack        |        |       |
| TM-04 | Workspace switch + TTY    | Switch away/back with session open                    | Session continues; minimal glyph corruption | Product stack        |        |       |
| TM-05 | **Clipboard paste image** | Copy image OS clipboard → paste path used by terminal | Image lands via host IPC (parity Tauri)     | E1 clipboard code    |        |       |
| TM-06 | Clipboard text            | Copy/paste text OS ↔ terminal                         | Works                                       | E1 / browser APIs    |        |       |

---

## 4. Shell / OS integration

| ID    | Scenario               | Steps                                                   | Expected                               | Impl readiness | Result | Notes |
| ----- | ---------------------- | ------------------------------------------------------- | -------------------------------------- | -------------- | ------ | ----- |
| SH-01 | Cold start             | `pnpm electron:dev` with UI up                          | SPA loads                              | E0             |        |       |
| SH-02 | Preload bridge         | DevTools: `devhubDesktop.isElectron`                    | true                                   | E0             |        |       |
| SH-03 | **Titlebar**           | Min / max / close / unmaximize                          | Window chrome matches product TitleBar | E1 code        |        |       |
| SH-04 | Single-instance        | Launch second Electron                                  | First focused; no second main app      | E1 code        |        |       |
| SH-05 | **Tray**               | Tray icon show / quit                                   | Restores window; quit clean            | E1 code        |        |       |
| SH-06 | **Dialog open folder** | Invoke folder picker (same call sites as plugin-dialog) | Path returned to renderer              | E1 code        |        |       |
| SH-07 | Dialog open file       | File picker                                             | Path returned                          | E1 code        |        |       |
| SH-08 | Notify                 | Show notification                                       | OS notification (if permitted)         | E1 code        |        |       |
| SH-09 | desktop_ping           | invoke `desktop_ping`                                   | `{ ok, host: 'electron' }`             | E0             |        |       |

---

## 5. Dual-shell & packaging

| ID    | Scenario            | Steps                                     | Expected                 | Impl readiness      | Result | Notes |
| ----- | ------------------- | ----------------------------------------- | ------------------------ | ------------------- | ------ | ----- |
| PK-01 | Tauri still runs    | `pnpm tauri:dev`                          | App starts               | Dual-shell          |        |       |
| PK-02 | Scripts coexist     | package.json has electron + tauri scripts | Both present             | E0                  |        |       |
| PK-03 | Packaged Electron   | Install NSIS; offline launch              | SPA+sidecar from package | E1.2 config+runtime |        |       |
| PK-04 | Rollback Tauri ship | `pnpm tauri:build` Windows                | Artifact builds          | Packaging           |        |       |

---

## 6. Voice / multi-window (E3)

| ID    | Scenario         | Steps                        | Expected                               | Impl readiness | Result                | Notes |
| ----- | ---------------- | ---------------------------- | -------------------------------------- | -------------- | --------------------- | ----- |
| VC-01 | Voice engine     | Start/stop/speak             | Accept deferred or Web Speech fallback | E3 deferred    | SKIP or note deferred |       |
| MW-01 | Extra URL window | Open secondary BrowserWindow | Loads URL; close lists                 | E3 code        |                       |       |

---

## 7. Structural automation (CI-friendly)

| ID    | Command                                        | Expected                              |
| ----- | ---------------------------------------------- | ------------------------------------- |
| AU-01 | `node desktop/electron/scripts/smoke-full.cjs` | exit 0                                |
| AU-02 | `node desktop/electron/scripts/smoke-e0.cjs`   | prints checklist; optional `--strict` |
| AU-03 | Jest desktop + nativeBrowserBridge tests       | all pass                              |

---

## Sign-off

| Role              | Name | Date | Verdict                                         |
| ----------------- | ---- | ---- | ----------------------------------------------- |
| Implementer       |      |      |                                                 |
| Operator / QA     |      |      |                                                 |
| Cutover authority |      |      | Blocked until E1+ gates (see cutover-checklist) |

### Critical path for “Electron Windows usable demo”

Must PASS: **BR-01, BR-02, BR-05, BR-08, TM-01, SH-01, SH-02, AU-01**.

### Critical path for “stop Tauri Windows builds”

Must PASS full matrix rows without E3 if voice not required; plus packaging PK-03 and cutover gates W1–W8.

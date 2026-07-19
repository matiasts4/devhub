# DevHub Electron desktop host — operator guide

**Branch:** `feature/electron-desktop-host`  
**Status:** E0–E4 host implementation complete; production cutover **not** done (see cutover gates)  
**OpenSpec:** `openspec/changes/electron-desktop-host/`

Product UI, Next, sidecar, and terminals stay the same; only the desktop shell changes on Windows.

---

## 1. Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Electron main (desktop/electron/main.js)                   │
│  ├── BaseWindow + SPA WebContentsView (webviewTag)          │
│  │     preload → window.devhubDesktop (contextBridge)       │
│  ├── DOM <webview> dock browser (SPA) + warm pool           │
│  ├── browser/registry.js (legacy / compat WCV path)         │
│  ├── sidecar.js → health check / optional spawn node-pty    │
│  └── ipcMain 'desktop:invoke' → browser / shell / voice     │
└─────────────────────────────────────────────────────────────┘
         │ HTTP/WS                          │ IPC events
         ▼                                  ▼
   sidecar (PTY)                    native-browser-event
         │
         ▼
   Terminales UI (xterm) — shell-agnostic
```

| Layer          | Path                                             | Role                          |
| -------------- | ------------------------------------------------ | ----------------------------- |
| Main entry     | `desktop/electron/main.js`                       | App lifecycle, IPC            |
| Window         | `desktop/electron/window.js`                     | BaseWindow + SPA view         |
| Preload        | `desktop/electron/preload.js`                    | `devhubDesktop.invoke` / `on` |
| Channels       | `desktop/electron/channels.js`                   | Shared command names          |
| Browser (main) | `desktop/electron/browser/*`                     | Compat registry + bounds      |
| Browser (SPA)  | `ElectronWebviewBrowser` + `electronWebviewPool` | Default dock embed            |
| Sidecar        | `desktop/electron/sidecar.js`                    | Health + optional spawn       |
| Adapter        | `src/lib/desktop/*`                              | Electron → Tauri → web        |
| Product bridge | `src/lib/browser/nativeBrowserBridge.js`         | Uses desktop adapter          |

**Security:** `contextIsolation: true`, `nodeIntegration: false`; allow-listed invoke only. SPA enables `webviewTag` for dock guests.

**Dual-shell:** Tauri remains under `src-tauri/`. Runtime detection prefers Electron when `window.devhubDesktop.isElectron === true`.

---

## 2. Prerequisites

- Node 20+ and pnpm
- Root install with `electron` devDependency
- If Electron binary missing:

```bash
node node_modules/electron/install.js
```

---

## 3. Run — development

### One command (recommended)

```powershell
pnpm electron:up
```

Starts **Next (:3100) + sidecar (:4001) + Electron**. Ctrl+C stops all three.

### Split terminals

```powershell
pnpm dev
# → http://127.0.0.1:3100

$env:SIDECAR_PORT = "4001"
node sidecar-backend/server.js

pnpm electron:dev
```

### Confirm host + browser

SPA DevTools:

```js
window.devhubDesktop.isElectron === true;
await window.devhubDesktop.invoke('desktop_ping', {});
```

Open a **Browser** space panel — native Chromium guest (`<webview>`), not iframe.

---

## 4. Environment variables

| Variable                        | Default                      | Meaning                                 |
| ------------------------------- | ---------------------------- | --------------------------------------- |
| `DEVHUB_ELECTRON_URL`           | `http://127.0.0.1:3100`      | SPA origin                              |
| `DEVHUB_UI_URL`                 | (fallback)                   | Alternate UI URL                        |
| `DEVHUB_UI_PORT`                | `3100`                       | Port used by `electron:up` for Next     |
| `SIDECAR_PORT`                  | `4001` dev / `4000` packaged | Sidecar health port                     |
| `DEVHUB_ELECTRON_SPAWN_SIDECAR` | unset                        | Set `1` to spawn sidecar when unhealthy |

---

## 5. Run — packaged

Config: `desktop/electron/electron-builder.yml`  
Runtime extract/spawn: `desktop/electron/packaging/runtime.js`

```bash
pnpm electron:pack    # dir output
pnpm electron:build   # Windows NSIS
```

Operator must still run install/uninstall smoke on a clean PC before cutover.

---

## 6. Workspace / session behavior

- Switching **applications** (alt-tab) does not destroy browser guests.
- Switching **workspaces** keeps warm guests when shells stay mounted; the guest should not full-reload if the URL is unchanged.
- Closing a browser panel or LRU pool eviction can free a guest (max 8 warm entries).

---

## 7. Deferred features

| Feature            | Behavior                                       |
| ------------------ | ---------------------------------------------- |
| Selector inspect   | `selector-deferred`                            |
| Piper / STT voice  | `voice-deferred-electron` (SPA Web Speech TTS) |
| Linux primary host | Stay on Tauri until Electron Linux smoke       |

---

## 8. Cutover

See `openspec/changes/electron-desktop-host/cutover-checklist.md` gates **W1–W8**.  
Do **not** stop Tauri Windows builds until those gates are green.

## 9. Rollback

Use Tauri packaging (`pnpm tauri:dev` / `tauri:build`). Electron sources can remain in-tree; dual-shell detection is runtime-based.

## 10. Related artifacts

- OpenSpec change: `openspec/changes/electron-desktop-host/`
- Embed model: `browser-embed-model.md`
- QA matrix: `qa-matrix.md`
- Smoke: `pnpm electron:smoke`

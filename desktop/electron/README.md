# DevHub Electron host

Windows-first desktop host using Electron.

**Browser model:** Chromium `<webview>` **inside the SPA DOM**
(`webviewTag: true` on the host SPA WebContentsView).

Warm cache (`src/lib/browser/electronWebviewPool.js`):

- Up to 8 panel webviews kept warm across workspace switches (in-place park; no guest destroy)
- Serialized `loadURL` (avoids `ERR_ABORTED (-3)` from stacked navigations)
- Re-activate reuses the same element + session without reload when URL unchanged

**E0** — cold start, preload bridge, native browser probe/open.  
**E1** — shell parity: tray, single-instance, window chrome IPC, clipboard, dialogs, notifications, runtime packaging path, electron-builder NSIS config.

## Prerequisites

- Node 20+ / pnpm (repo package manager)
- Next dev server (or set `DEVHUB_ELECTRON_URL`)
- Optional: sidecar on `SIDECAR_PORT` (default **4001** in dev)

Electron is a root **devDependency**. Binary install if missing:

```bash
node node_modules/electron/install.js
```

For packaging installs:

```bash
pnpm add -D electron-builder
# or: npm i -D electron-builder
```

## Run (dev)

**Default browser under Electron is native DOM `<webview>`, not iframe.**  
**UI port is `3100`** (same as `pnpm dev` / Tauri `devUrl`) — not 3000.

### One command (recommended)

```powershell
pnpm electron:up
```

Starts **Next (:3100) + sidecar (:4001) + Electron**. Ctrl+C stops all three.

### Or 3 terminals

```powershell
# A
pnpm dev
# → http://127.0.0.1:3100

# B
$env:SIDECAR_PORT = "4001"
node sidecar-backend/server.js

# C
pnpm electron:dev
```

### Confirm native browser

SPA DevTools:

```js
window.devhubDesktop.isElectron; // true
```

Open a Browser panel — native surface (not iframe).

### Env overrides

| Variable                        | Default                          | Meaning                                       |
| ------------------------------- | -------------------------------- | --------------------------------------------- |
| `DEVHUB_ELECTRON_URL`           | `http://127.0.0.1:3100`          | SPA origin (matches `pnpm dev`)               |
| `DEVHUB_UI_URL`                 | (same)                           | Alias for SPA origin                          |
| `DEVHUB_UI_PORT`                | `3100`                           | Port used by `electron:up` for Next           |
| `SIDECAR_PORT`                  | `4001` (dev) / `4000` (packaged) | Sidecar health/port                           |
| `DEVHUB_ELECTRON_SPAWN_SIDECAR` | unset                            | Set `1` to try spawning sidecar from repo     |
| `DEVHUB_STANDALONE_ZIP`         | auto                             | Force path to `standalone.zip`                |
| `DEVHUB_STANDALONE_DIR`         | userData/standalone              | Extract / locate directory                    |
| `DEVHUB_RESOURCES_PATH`         | auto                             | Override resources root                       |
| `DEVHUB_ELECTRON_PACKAGED`      | unset                            | Force packaged mode for runtime helpers (`1`) |

## E1 shell features

### Single-instance

`app.requestSingleInstanceLock()` — second launch focuses the existing window and exits.

### Tray

System tray with **Show** / **Quit**. Icon resolution order:

1. `src-tauri/icons/32x32.png`
2. `src-tauri/icons/icon.png`
3. `public/logo-square.png`
4. `src-tauri/icons/icon.ico`

Double-click tray icon shows the main window.

### Window IPC

| Command                  | Result shape (typical)     |
| ------------------------ | -------------------------- |
| `window_minimize`        | `{ ok }`                   |
| `window_maximize`        | `{ ok, maximized: true }`  |
| `window_unmaximize`      | `{ ok, maximized: false }` |
| `window_toggle_maximize` | `{ ok, maximized }`        |
| `window_close`           | `{ ok }`                   |
| `window_is_maximized`    | `{ ok, maximized }`        |
| `window_show`            | `{ ok }`                   |
| `window_hide`            | `{ ok }`                   |

Subscribe: `window.devhubDesktop.on('window-event', handler)` → maximize/unmaximize/minimize/restore/show/hide/focus/blur.

### Clipboard

| Command                              | Notes                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `read_system_clipboard_text`         | `string \| null`                                                                 |
| `write_system_clipboard_text`        | payload `{ text }` → `{ ok }`                                                    |
| `read_system_clipboard_image`        | `{ base64, mimeType }` (also `data` / `mime_type` aliases) or `null`             |
| `write_clipboard_image_to_temp_file` | payload `{ dataBase64?, extension? }` or uses clipboard image → temp path string |

### Dialog

```js
await window.devhubDesktop.invoke('dialog_open', {
  directory: false,
  multiple: false,
  filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
  title: 'Open file',
});
// → { canceled: boolean, paths: string[] }
```

### Notifications

```js
await window.devhubDesktop.invoke('notify_request_permission');
// → { ok, permission: 'granted'|'denied', supported }

await window.devhubDesktop.invoke('notify_show', {
  title: 'DevHub',
  body: 'Hello from Electron',
});
// → { ok }
```

On Windows, notifications show without a separate permission prompt. On macOS, `notify_request_permission` calls Electron’s permission API when available.

### Runtime packaging path

```js
await window.devhubDesktop.invoke('runtime_status');
await window.devhubDesktop.invoke('runtime_ensure');
```

**Dev** (`app.isPackaged === false`): returns `{ mode: 'dev', uiUrl, sidecar, standalone }` — does **not** require Next standalone or zip extract.

**Packaged**: locates `standalone.zip` under `process.resourcesPath` (see layout below), extracts to `userData/standalone` when missing or zip is newer, and reports sidecar entry candidates.

#### Packaged resource layout

```text
<install>/
  DevHub.exe
  resources/
    app.asar            # desktop/electron + package metadata
    resources/          # extraResources from src-tauri/resources
      standalone.zip
      devhub-server.cjs # optional
```

`desktop/electron/packaging/runtime.js` resolves:

- resources → `process.resourcesPath` (+ `resources/` subfolder)
- extract → `app.getPath('userData')/standalone`
- UI → `DEVHUB_ELECTRON_URL` or packaged origin when configured

Unit tests (no Electron window):

```bash
node desktop/electron/packaging/runtime.test.js
```

## Packaging (electron-builder)

Config: [`electron-builder.yml`](./electron-builder.yml) (also referenced from root scripts).

```bash
pnpm electron:pack    # unpackaged dir under dist/electron
pnpm electron:build   # NSIS installer (Windows x64)
```

Main entry: `desktop/electron/main.js` via `extraMetadata.main` (does not force package.json `"main"` for Next).

`extraResources` copies `src-tauri/resources/**` into the installer resources tree.

## Smoke scripts

```bash
pnpm electron:smoke-e0   # E0 preflight
pnpm electron:smoke-e1   # E1 channels + packaging + scripts
node desktop/electron/scripts/smoke-e1.cjs --strict
```

### Manual DevTools checklist (E1)

```js
window.devhubDesktop.isElectron === true;
await window.devhubDesktop.invoke('desktop_ping');
await window.devhubDesktop.invoke('window_is_maximized');
await window.devhubDesktop.invoke('write_system_clipboard_text', { text: 'e1' });
await window.devhubDesktop.invoke('read_system_clipboard_text');
await window.devhubDesktop.invoke('notify_show', { title: 'E1', body: 'ok' });
await window.devhubDesktop.invoke('runtime_status');
await window.devhubDesktop.invoke('dialog_open', {});
```

## Layout

```text
desktop/electron/
  main.js                 # app entry, single-instance, IPC router, tray
  preload.js              # contextBridge → window.devhubDesktop
  window.js               # BrowserWindow factory (frame true, contextIsolation)
  tray.js                 # system tray Show/Quit
  sidecar.js              # health / optional spawn
  channels.js             # IPC names + command catalogs
  ipc/
    index.js              # routeInvoke (browser | shell | voice stub | multi-window stub)
    shell.js              # window / clipboard / dialog / notify / runtime
  packaging/
    runtime.js            # standalone.zip locate/extract + status
    runtime.test.js       # node assert tests
  browser/                # WebContentsView registry (E0+)
  electron-builder.yml    # NSIS packaging
  scripts/
    smoke-e0.cjs
    smoke-e1.cjs
```

## Security

- `contextIsolation: true`
- `nodeIntegration: false`
- Sandboxed preload; allow-listed `invoke` / `on` only
- No unrestricted Node in the renderer

## Optional modules (E3)

`main` / `ipc` soft-require `./voice` and `./multiWindow`. If missing, voice and multi-window commands return `{ reason: 'not-implemented' }` without crashing.

## Rollback

Tauri remains under `src-tauri/` (`pnpm tauri:dev` / `tauri:build`). Do not delete it while Electron is coexisting.

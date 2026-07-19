# Design: electron-desktop-host

## Goals

1. Electron as primary **Windows** desktop host.
2. Native dock browser via **WebContentsView** (real sites, partitions).
3. Minimal product-logic churn: adapter over existing bridges.
4. Tauri retained for rollback; dual packaging until E4 cutover.

## Non-goals

- Pixel clone of OpenCode Desktop.
- Rewriting terminals/swarm/Pizarra.
- Deleting `src-tauri` in phase 1.
- CSS-only overlays over native browser.

## Process model

```text
┌─────────────────────────────────────────────────────────────────┐
│ Electron main                                                   │
│  - BrowserWindow (SPA)                                          │
│  - WebContentsView registry (panelId → view, bounds, partition) │
│  - ipcMain handlers (desktop + browser)                         │
│  - spawn/monitor sidecar (Node)                                 │
│  - tray / single-instance (E1+)                                 │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ preload (contextBridge)     │ child process
                ▼                             ▼
┌───────────────────────────┐    ┌──────────────────────────────┐
│ Renderer (Next/React SPA) │    │ Sidecar (node-pty, HTTP/WS)  │
│  desktopBridge adapter    │    │  /api/terminal/*  /tty       │
│  nativeBrowserBridge      │    └──────────────────────────────┘
│  xterm / Pizarra / swarm  │
└───────────────────────────┘
```

**Security (mandatory):**

| Setting            | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| `nodeIntegration`  | `false`                                                        |
| `contextIsolation` | `true`                                                         |
| `sandbox`          | `true` preferred where compatible                              |
| Preload            | allow-listed `invoke` / `on` only                              |
| Navigation         | deny unexpected `window.open`; optional webRequest hooks later |

## Directory layout (new)

```text
desktop/electron/
  package.json              # optional local deps or root-owned
  main.js                   # entry
  preload.js
  window.js                 # BrowserWindow factory
  sidecar.js                # spawn/health
  browser/
    registry.js             # panelId → WebContentsView
    ipc.js                  # native browser IPC
    bounds.js               # rect math, clamp, coalesce helpers
  ipc/
    desktop.js              # generic invoke router
  scripts/
    dev.cjs
    smoke-e0.cjs
```

Root `package.json` adds:

- `electron:dev` — launch Electron against Next dev URL
- `electron:start` — launch against built standalone
- E1+: `electron:build` / electron-builder config

## Tauri command → Electron IPC mapping

| Tauri / bridge today                 | Electron channel (proposed)         | Notes                       |
| ------------------------------------ | ----------------------------------- | --------------------------- |
| `native_browser_probe`               | `desktop:native-browser:probe`      | Return ready + capabilities |
| `native_browser_open`                | `desktop:native-browser:open`       | Create WCV                  |
| `native_browser_load_url`            | `desktop:native-browser:load`       | `loadURL`                   |
| `native_browser_reload`              | `desktop:native-browser:reload`     |                             |
| `native_browser_resize`              | `desktop:native-browser:resize`     | setBounds                   |
| `native_browser_focus`               | `desktop:native-browser:focus`      | focus webContents           |
| `native_browser_raise`               | `desktop:native-browser:raise`      | z-order among views         |
| `native_browser_set_visibility`      | `desktop:native-browser:visibility` | hide/show                   |
| `native_browser_selector_command`    | `desktop:native-browser:selector`   | E2                          |
| `native_browser_select_all` / `copy` | `desktop:native-browser:edit`       | E2                          |
| `native_browser_close`               | `desktop:native-browser:close`      | destroy                     |
| event `native-browser-event`         | `desktop:native-browser:event`      | preload → DOM               |
| `read_system_clipboard_*`            | `desktop:clipboard:*`               | E1                          |
| window minimize/maximize/close       | `desktop:window:*`                  | E1                          |
| dialog plugin                        | `desktop:dialog:open`               | E1                          |
| notification plugin                  | `desktop:notify`                    | E1                          |
| `voice_*`                            | `desktop:voice:*`                   | E3                          |

**Adapter algorithm:**

```text
invokeDesktop(cmd, payload):
  if window.devhubDesktop?.isElectron → ipcRenderer.invoke(map(cmd), payload)
  else if __TAURI_INTERNALS__ → tauri.invoke(cmd, { request: payload })  // existing shape
  else → failureShape
```

Prefer keeping `nativeBrowserBridge.js` as the public API; swap its transport internals to call the adapter.

## WebContentsView lifecycle

```text
probe → open(panelId, url, bounds, partition?)
     → load / reload
     → resize* (coalesced)
     → visibility / focus / raise
     → close → remove from contentView + delete registry entry
```

**Bounds:** CSS pixels relative to window content; main converts with `window.getContentBounds()` and devicePixelRatio as needed (validate on Windows DPI).

**Partitions:** `persist:devhub-browser-${panelId}` or shared `persist:devhub-browser-dock` — default isolate from SPA partition (`persist:devhub-spa` if SPA also uses custom session later). E0 may use one shared dock partition.

## Overlay strategy (critical)

WebContentsView is a **native child surface**. React cannot paint above it with z-index.

| Situation                    | Strategy                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modal / sheet                | `visibility: false` on intersecting panels; restore on close                                                                                            |
| Workspace switch             | Hide all panels not owned by active workspace                                                                                                           |
| Pizarra chrome / avoid-rects | Existing `devhub:register-avoid-rect` → bridge passes rects; main hides or sets bounds to non-intersecting region (E2 full; E0 hide-all for modal flag) |
| Dock split drag              | Continuous resize only; do not destroy view                                                                                                             |
| DevTools for dock            | Optional `openDevTools` on panel webContents (debug flag)                                                                                               |

**Never** attempt Pack D-style HWND reparent thrash.

## Dual-maintain strategy

| Phase       | Tauri                              | Electron                  |
| ----------- | ---------------------------------- | ------------------------- |
| E0          | Primary for daily Linux/dev        | Spike Windows host        |
| E1–E2       | Rollback + Linux native browser    | Windows primary candidate |
| E3–E4       | Optional Linux-only or freeze      | Primary Windows packaging |
| Post-verify | Stop shipping Tauri Windows builds | Electron default          |

Stop building Tauri when: installer smoke green, browser dock QA matrix green, voice/clipboard parity accepted, and maintainers approve cutover.

## Phases E0–E4 → design groups

| Phase  | Design focus                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **E0** | Scaffold main/preload; load UI; sidecar attach; one terminal; one WCV fixed/IPC rect; unit tests bounds/IPC shapes; smoke script |
| **E1** | Tray, single-instance, dialogs, clipboard, titlebar, standalone.zip extract, NSIS smoke                                          |
| **E2** | Full browser bridge, multi-panel, partitions, Pizarra/right-dock, overlay matrix tests                                           |
| **E3** | Voice IPC, multi-window BrowserWindow, Linux smoke decision                                                                      |
| **E4** | Packaging hardening, docs, regression suite, cutover checklist                                                                   |

## Testing strategy

- **Unit:** bounds math, payload normalization, adapter runtime detection (no Electron needed).
- **Contract:** IPC channel names + request/response fixtures.
- **Manual/smoke E0:** `electron:dev` + Next + sidecar; open example.com; create terminal session.
- **E2+:** Playwright where possible on SPA; native WCV needs Electron spectron-like or custom smoke.

## Open questions

1. Shared vs per-panel partition default for dock cookies?
2. When to freeze Tauri Linux GTK browser vs unify Electron on Linux?
3. electron-builder target list (NSIS only first vs portable)?

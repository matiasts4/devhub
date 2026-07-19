# Electron dock browser — embed model

**Date:** 2026-07-18  
**Change:** `electron-desktop-host`

## Primary path (Windows Electron)

```
BaseWindow
  └── SPA WebContentsView (webviewTag: true)
        └── React dock / space panel
              └── <webview> guest (partitioned Chromium session)
```

| Concern                 | DevHub policy                                                                  |
| ----------------------- | ------------------------------------------------------------------------------ |
| Browser widget          | Chromium `<webview>` inside the SPA DOM                                        |
| Warm cache              | `electronWebviewPool` — up to 8 guests by panel key                            |
| Inactive workspace      | Keep guest attached under keep-alive shell; mark parked in-place (no reparent) |
| Unmount                 | Move guest to off-screen park host (session retained until LRU eviction)       |
| Navigation              | Serialized `loadURL`; skip no-ops and placeholder dock-state races             |
| App blur/focus          | No hide/show thrash of browser surfaces                                        |
| Legacy main-process WCV | `browser/registry.js` retained for IPC/compat; SPA default is DOM webview      |

## Secondary path (Linux Tauri)

WebKitGTK native overlay via existing Tauri commands. Electron is not the primary Linux host until an explicit Linux smoke pass.

## Non-goals (this change)

- Selector inspect automation (`selector-deferred`)
- Native Piper/STT voice engine (`voice-deferred-electron`; SPA Web Speech TTS remains)
- Production cutover / stopping Tauri Windows builds (see `cutover-checklist.md` gates W1–W8)

# Operator notes: workspace-browser-wave-aligned

## Build flags

| Variable                           | Effect                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| _(unset)_                          | **Lite browser** — iframe default, no native GTK probe                               |
| `NEXT_PUBLIC_BROWSER_NATIVE_GTK=1` | Linux Tauri may use legacy WebKitGTK overlay when user/runtime requests `native-gtk` |

Rebuild desktop app after changing env (Next embeds `NEXT_PUBLIC_*` at build time).

## Manual QA

### Windows (Tauri)

1. Open project → show right dock → Browser.
2. Navigate to `http://127.0.0.1:<app-port>/` (DevHub itself) — should load in iframe or proxy as classified.
3. Navigate to `http://localhost:5173` (or local dev app) — should use preview-proxy if origin differs.
4. Enable edit mode on proxied localhost — selector arms or shows explicit unsupported (not blank native spinner).

### Linux default (lite)

1. Same as Windows; confirm no persistent "Preparando native" overlay.
2. `htop`/process list: avoid extra heavy WebKitGTK browser process when only iframe is used.

### Linux legacy native (opt-in)

1. Build with `NEXT_PUBLIC_BROWSER_NATIVE_GTK=1`.
2. Toggle runtime to native if UI exposed, or persist `native-gtk` in dock state.
3. Confirm overlay browser still resizes with dock.

## Wave parity checklist (browser only)

- [ ] Home / pinned URL
- [ ] Minimal toolbar
- [ ] Full-bleed preview
- [ ] Favorites strip
- [ ] `open_url` / Zed still focuses dock (unchanged)

Not in scope: `wsh web open`, block grid layout, Electron webview.

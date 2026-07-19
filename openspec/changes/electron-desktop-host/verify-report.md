# Verify report: electron-desktop-host

**Date:** 2026-07-18  
**Verdict:** **PASS WITH WARNINGS** (implementation complete; production cutover pending human gates)

## Automated evidence

| Check                                                      | Result                       |
| ---------------------------------------------------------- | ---------------------------- |
| Jest desktop + browser + pool + clipboard + voice adapters | **PASS** (run at checkpoint) |
| `node desktop/electron/packaging/runtime.test.js`          | **PASS**                     |
| `pnpm electron:smoke` / `smoke-full.cjs`                   | **PASS** (structural)        |
| SDD tasks                                                  | **45/45 complete**           |

## Spec coverage (summary)

| Capability                | Code status                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| electron-shell-host       | Implemented: main, tray, single-instance, window controls, recovery         |
| desktop-bridge-adapter    | Implemented: Electron → Tauri → web fail-closed                             |
| electron-native-browser   | Implemented: DOM `<webview>` primary + pool; main-process registry retained |
| electron-browser-overlays | Implemented: avoid-rects, hideAll, showWorkspace, SPA host effects          |
| electron-packaging        | Implemented: runtime extract path, electron-builder.yml, operator docs      |

## Known deferred / warnings

1. **Voice Piper/STT** — returns `voice-deferred-electron`; Windows TTS uses Web Speech in SPA.
2. **Selector inspect** — `selector-deferred` (copy/selectAll work).
3. **NSIS install on clean PC** — not run in CI; scripts present.
4. **Human qa-matrix** — operator must sign off critical rows.
5. **Tauri Windows cutover** — gates W1–W8 in cutover-checklist; dual shell retained.
6. **Linux host** — remains Tauri until Electron Linux smoke.

## Operator runbook (dev)

```powershell
pnpm electron:up
# Next :3100 + sidecar :4001 + Electron
```

Confirm:

```js
window.devhubDesktop.isElectron === true;
```

## Rollback

`src-tauri` unchanged; `pnpm tauri:dev` / `tauri:build` remain valid.

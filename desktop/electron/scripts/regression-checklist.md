# Electron host — regression checklist

**Branch:** `feature/electron-desktop-host`  
**Scope:** Manual + structural smoke before cutover or after shell/browser changes  
**Related:** [qa-matrix.md](../../../openspec/changes/electron-desktop-host/qa-matrix.md), [smoke-full.cjs](./smoke-full.cjs)

Run structural smoke first (no UI required):

```bash
node desktop/electron/scripts/smoke-full.cjs
# or: npm run electron:smoke
# fallback: npm run electron:smoke-e0
```

Unit tests (bridge / bounds):

```bash
npx jest src/lib/desktop/__tests__ --runInBand
# include native browser bridge when changed:
npx jest src/lib/browser/__tests__/nativeBrowserBridge.test.js --runInBand
```

---

## Preflight

| #   | Check                                                                                        | Pass? |
| --- | -------------------------------------------------------------------------------------------- | ----- |
| P1  | `pnpm install` / electron binary present (`node node_modules/electron/install.js` if needed) |       |
| P2  | Next UI up (`pnpm dev` or `DEVHUB_ELECTRON_URL`)                                             |       |
| P3  | Sidecar healthy on `SIDECAR_PORT` (default 4001 dev)                                         |       |
| P4  | `smoke-full` exit 0                                                                          |       |
| P5  | Desktop unit tests green                                                                     |       |

---

## Shell (Electron main window)

| #   | Scenario                                   | Expected                                         | Pass? |
| --- | ------------------------------------------ | ------------------------------------------------ | ----- |
| S1  | Cold start `pnpm electron:dev`             | Window loads SPA; no crash                       |       |
| S2  | `window.devhubDesktop.isElectron === true` | true                                             |       |
| S3  | `desktop_ping`                             | `{ ok: true, host: 'electron' }`                 |       |
| S4  | Second process start                       | Soft single-instance: first window focused (E0+) |       |
| S5  | Titlebar min/max/close                     | **E1** — skip or note not-implemented            |       |
| S6  | Tray show/quit                             | **E1** — skip until implemented                  |       |
| S7  | Dialog open folder                         | **E1** — skip until implemented                  |       |
| S8  | Clipboard text + image paste in terminal   | **E1** — skip until implemented                  |       |

---

## Native browser dock

| #   | Scenario                                | Expected                                 | Pass? |
| --- | --------------------------------------- | ---------------------------------------- | ----- |
| B1  | `native_browser_probe`                  | `ready: true`, host electron             |       |
| B2  | Open `https://example.com` fixed bounds | WebContentsView visible                  |       |
| B3  | Site with X-Frame-Options / DENY        | Renders (not iframe blank)               |       |
| B4  | Two panels different panelIds           | Both registered / visible                |       |
| B5  | Resize bounds                           | View moves without thrash                |       |
| B6  | Visibility false then true              | Hide without destroy; show restores      |       |
| B7  | Raise/focus                             | Focused panel receives input             |       |
| B8  | Close panel                             | View removed; no leak                    |       |
| B9  | Modal over dock                         | **E2** hide via visibility / avoid-rects |       |
| B10 | Workspace switch                        | **E2** hide all / show workspace         |       |
| B11 | Selector / copy / select-all            | **E2** — currently `not-implemented` OK  |       |

---

## Terminal / swarm (shell-agnostic)

| #   | Scenario                                 | Expected                              | Pass? |
| --- | ---------------------------------------- | ------------------------------------- | ----- |
| T1  | Open Terminales session                  | PTY connected via sidecar             |       |
| T2  | Multi-split (2–4 panes)                  | All render / accept input             |       |
| T3  | Swarm multi-agent grid smoke             | No black panels; sessions live        |       |
| T4  | Workspace switch with terminals open     | Sessions survive; no glyph corruption |       |
| T5  | Clipboard paste image into terminal flow | **E1** image IPC                      |       |

---

## Dual-shell / packaging

| #   | Scenario                           | Expected                              | Pass? |
| --- | ---------------------------------- | ------------------------------------- | ----- |
| D1  | `pnpm tauri:dev` still starts      | Tauri path unbroken                   |       |
| D2  | Packaged Electron spawn            | **E1.2** — N/A until electron-builder |       |
| D3  | Rollback: ship Tauri Windows build | `src-tauri` + `tauri:build` usable    |       |

---

## Voice / multi-window

| #   | Scenario                 | Expected                     | Pass? |
| --- | ------------------------ | ---------------------------- | ----- |
| V1  | Voice engine start/speak | **E3** — channels only today |       |
| V2  | Extra BrowserWindow URL  | **E3** — not implemented     |       |

---

## Sign-off

| Field                         | Value       |
| ----------------------------- | ----------- |
| Date                          |             |
| Operator                      |             |
| OS / Electron version         |             |
| Structural smoke              | PASS / FAIL |
| Manual blockers               |             |
| Ready for cutover discussion? | Y / N       |

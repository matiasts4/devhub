# Cutover checklist: Electron desktop host

**Change:** `electron-desktop-host`  
**Branch:** `feature/electron-desktop-host`  
**Date opened:** 2026-07-18  
**Status:** Planning / E0 landed — **do not cut over production yet**

---

## Linux decision record (2026-07-18)

| Platform    | Primary desktop host                                                                | Rationale                                                                                             |
| ----------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Windows** | **Electron** (target primary)                                                       | Native browser dock via `WebContentsView`; bypass XFO; no Pack D HWND thrash.                         |
| **Linux**   | **Keep Tauri** (GTK / WebKitGTK native browser) until Electron Linux smoke is green | Existing WebKitGTK overlay works; dual-maintain temporarily is cheaper than regressing Linux browser. |
| **macOS**   | Undecided; follow Electron if Windows path proves stable                            | Lower priority than Win browser dock.                                                                 |

**Recommendation:** **Electron primary on Windows; keep Tauri for Linux GTK browser until Electron Linux smoke**, unless/until Electron unifies both OS hosts with equivalent browser + shell parity.

Do **not** delete `src-tauri/` until Linux Electron is explicitly accepted or Linux is retired as a product surface.

---

## When to stop building Tauri **Windows** installers

Stop shipping Tauri NSIS/Windows builds only when **all** gates below are true:

| #   | Gate                                                                                                | Owner          | Met?                                                |
| --- | --------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------- |
| W1  | E1 shell parity: titlebar, single-instance hard, tray, dialogs, clipboard text+image                | Eng            | [~] code ready — operator smoke pending             |
| W2  | E2 browser dock: multi-panel, modals/hide, avoid-rects or equivalent, workspace switch warm         | Eng            | [~] code ready — qa-matrix BR/OV pending            |
| W3  | Packaged Electron: extract standalone + sidecar spawn + NSIS smoke install/uninstall                | Eng            | [ ]                                                 |
| W4  | QA matrix (see `qa-matrix.md`) signed off on Windows 10/11                                          | QA / operator  | [ ]                                                 |
| W5  | Regression: terminal multi-split + swarm grid green under Electron                                  | QA             | [ ]                                                 |
| W6  | Crash recovery / window restore acceptable (E4.1)                                                   | Eng            | [~] `windowState.js` landed — field confirm pending |
| W7  | Product decision recorded: “Windows host = Electron” in this file + `docs/electron-desktop-host.md` | PM / tech lead | [ ]                                                 |
| W8  | Rollback package (last known-good Tauri Windows artifact) archived                                  | Release        | [ ]                                                 |

Until W1–W8: continue dual packaging scripts (`electron:*` + `tauri:*`). CI may build both; **release channel for Windows may still be Tauri**.

### Keep building Tauri for

- **Linux** desktop (GTK browser) — default until Electron Linux smoke.
- **Emergency Windows rollback** even after cutover (tag + artifact retention ≥ 2 release cycles).

---

## Pre-cutover verification

```bash
# Structural
node desktop/electron/scripts/smoke-full.cjs
# Unit
npx jest src/lib/desktop/__tests__ src/lib/browser/__tests__/nativeBrowserBridge.test.js --runInBand
# Manual matrix
# openspec/changes/electron-desktop-host/qa-matrix.md
```

| Check                               | Result |
| ----------------------------------- | ------ |
| smoke-full exit 0                   |        |
| Unit tests green                    |        |
| qa-matrix critical rows PASS        |        |
| Packaged install smoke              |        |
| Dual-shell: `tauri:dev` still works |        |

---

## Cutover steps (Windows primary)

1. **Freeze** Tauri Windows feature work (bugfix only).
2. Merge `feature/electron-desktop-host` (or release branch) after QA sign-off.
3. Publish Electron Windows installer; update download docs / `docs/18_Guia_Empaquetado_Desktop.md` link.
4. Mark release notes: “Windows desktop host is Electron; native browser dock enabled.”
5. Keep `tauri:build` for Linux (and optional Windows hotfix).
6. Monitor: crash reports, browser dock z-order bugs, sidecar spawn failures.
7. After 1–2 stable Windows releases, optionally stop **CI** Tauri Windows packaging (keep source).

---

## Rollback steps

### A. Same-day / installer bad

1. Re-publish previous **Tauri Windows** artifact from archive.
2. Pin download links to that version.
3. File incident; do not delete Electron branch — bisect.

### B. Runtime regression after users upgraded

1. Document workaround (use web UI / previous installer).
2. Hotfix on Electron branch if small; else ship Tauri Windows again.
3. Set env/docs: “prefer Tauri Windows until Electron rev N+1.”

### C. Code-level dual-shell

```bash
# Electron path
pnpm electron:dev

# Tauri path (unchanged)
pnpm tauri:dev
pnpm tauri:build
```

Renderer uses `desktopRuntime` (Electron → Tauri → web). Rollback does **not** require removing Electron files; simply stop shipping Electron installers.

### D. Partial feature rollback

| Feature                    | Rollback                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| Native browser dock        | Users fall back to iframe / dedicated window (existing product paths) |
| Shell chrome (tray/dialog) | Keep Electron shell only if core SPA+terminal OK; or full Tauri ship  |
| Voice                      | Stay on Tauri path until E3 complete                                  |

---

## Stop-building-Tauri-Windows decision record

| Field                    | Value                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Decision                 | **Deferred** — do not stop Tauri Windows builds as of 2026-07-18                                                 |
| Electron status          | E0–E2 code + packaging config landed; E3 voice deferred; E4 docs done; manual QA + NSIS install smoke incomplete |
| Linux                    | Keep Tauri until Electron Linux smoke                                                                            |
| Revisit when             | Gates W1–W8 all checked                                                                                          |
| Approver                 | _TBD_                                                                                                            |
| Date of decision to stop | _TBD_                                                                                                            |

---

## Related artifacts

- Operator guide: [`docs/electron-desktop-host.md`](../../../docs/electron-desktop-host.md)
- QA matrix: [`qa-matrix.md`](./qa-matrix.md)
- Verify report: [`verify-report.md`](./verify-report.md)
- Analysis: [`docs/analisis-migracion-electron.md`](../../../docs/analisis-migracion-electron.md)

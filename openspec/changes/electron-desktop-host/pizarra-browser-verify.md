# Pizarra native browser verification (Electron)

**Change:** `electron-desktop-host`  
**Host:** Electron DOM `<webview>` inside `WorkspaceBrowserPane` (same pool as workspace dock)

## Architecture (Electron)

```
PizarraLiveSurfaceLayer
  └── PizarraBrowserSurface
        └── WorkspaceBrowserPane (isPizarraContext)
              └── ElectronWebviewBrowser
                    └── electronWebviewPool guest (cacheKey = nativePanelId)
```

| Concern | Behavior |
|---------|----------|
| Embed | In-DOM `<webview>` — not main-process WCV IPC bounds |
| Cache key (carried from workspace) | `browser-{projectId}-{workspaceId}` (matches dock `WorkspaceBrowserPane`) |
| Cache key (pizarra-only card) | `browser-{projectId}-pizarra-{shapeId}` or `pizarra-browser-*` |
| Visibility | `getSurfaceViewId(..., fallbackViewId)` — browsers must resolve to active window |
| Registry reconcile | Space `kind:browser` panels + dedicated browser window → one carried surface |
| Load watchdog (5s failure overlay) | **Disabled** on Electron |
| Canvas pan / view transition | `surfaceActive=false` parks guest in place |
| Card drag / resize | Guest stays active (no reparent thrash) |
| Tauri raise/resize IPC | Skipped on Electron |

## Manual QA checklist

Run with `pnpm electron:up`, open a project → Terminales → enable Pizarra fullscreen.

| # | Scenario | Expected |
|---|----------|----------|
| P1 | Add Browser on canvas | Card shows toolbar + page content (not perpetual blank / failure overlay) |
| P2 | Navigate URL on pizarra card | Loads without ERR_ABORTED storm; toolbar URL updates |
| P3 | Drag browser card | Frame moves; content stays attached |
| P4 | Resize browser card | Content reflows inside card |
| P5 | Pan canvas while browser visible | No ghost overlay; content returns after pan |
| P6 | Switch pizarra ↔ normal with carried browser | Same session/URL when panelId shared |
| P7 | Two browser cards | Independent guests (different shape ids) |
| P8 | Close browser card | Guest parks/evicts; no crash |
| P9 | Reload button on failure (Tauri/iframe only) | N/A on Electron if no failure overlay |
| P10 | External open (↗) | Opens system browser |

## Automated

```powershell
pnpm exec jest src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx `
  src/components/pizarra/__tests__/PizarraBrowserSurface.resize.test.jsx `
  src/lib/browser/__tests__/electronWebviewPool.test.js --no-coverage
```

## Known non-goals

- Visual-edit selector over cross-origin sites in pizarra (same as dock)
- Main-process WCV sibling path for pizarra (deprecated on Electron)

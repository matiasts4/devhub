# Tasks: workspace-browser-wave-aligned

## Review Workload Forecast

Estimated changed lines: 800–1200 (Phase 0+1)
400-line budget risk: Medium
Chained PRs recommended: Yes — Phase 0 then Phase 1
Chain strategy: two PRs on `feature/workspace-browser-wave-aligned`

Suggested split:

- **PR-A (Phase 0)**: policy + defaults + pizarra + tests — fixes Windows + Linux weight
- **PR-B (Phase 1)**: Wave UX (pinned/home/favorites/toolbar)

## Phase 0: Lite embedding (iframe-first)

- [ ] 0.1 Add `src/lib/browser/browserRuntimePolicy.js` + `__tests__/browserRuntimePolicy.test.js` (S)
- [ ] 0.2 Wire `rightDockState.js`: default `iframe`, `sanitizeBrowserRuntime` on read (S)
- [ ] 0.3 `WorkspaceBrowserPane.jsx`: use policy for probe request, runtime chip copy, skip native surface when iframe (M)
- [ ] 0.4 `browserPreviewSupport.js`: coerce requested runtime through policy before selection (S)
- [ ] 0.5 `PizarraBrowserSurface.jsx`: remove auto-upgrade to native-gtk; carried cards use iframe unless opt-in (M)
- [ ] 0.6 Update tests: `PizarraBrowserSurface.test.jsx`, `rightDockState.test.js`, `browserPreviewSupport.test.js` expectations for iframe default (M)
- [ ] 0.7 Manual QA matrix: Windows Tauri, Linux default, Linux opt-in flag (S) — document in `operator-notes.md`
- [ ] 0.8 Git checkpoint commit `[git:checkpoint]` before marking Phase 0 complete per Agents.md (S)

## Phase 1: Wave-aligned UX (browser only)

- [ ] 1.1 Extend dock state: `browserPinnedUrl`; migrate sanitize; persist with right dock key (S)
- [ ] 1.2 Home button + disable when URL === pinned (Wave `pinnedurl` behavior) in `WorkspaceBrowserPane` (S)
- [ ] 1.3 Compact toolbar per `devhub-desktop-engineering` right-dock-ux (remove redundant status row if duplicated) (M)
- [ ] 1.4 `browserFavorites.js` + `BrowserFavoritesStrip.jsx`; click sets URL + history (M)
- [ ] 1.5 Component tests for home + favorites (S)
- [ ] 1.6 Optional: `devhub web open` IPC/event stub (defer if timeboxed) (M)

## Phase 2: Optional follow-up change (out of initial apply)

- [ ] 2.1 Spike Tauri WebView2 child bounds on Windows (L)
- [ ] 2.2 Feature-gate or remove `native_browser.rs` + Cargo webkit deps if opt-in unused (L)

## Dependencies

- Existing `/api/preview-proxy`
- `@emergentbase/visual-edits` / selector controller
- No Electron migration

## Definition of Done

- Phase 0 merged: Windows browser dock usable on default build without native GTK
- Phase 1 merged: home + pinned URL + favorites visible
- No regression in `visual-edits-selector-reliability` scenarios for localhost proxy

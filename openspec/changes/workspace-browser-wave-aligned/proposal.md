# Proposal: workspace-browser-wave-aligned

## Update (hardening pass — native overlay promoted to primary)

The Phase 0 direction below (iframe-first default, native overlay opt-in-only) was **superseded during implementation** and is kept here only for history. Reality forced a reversal: sites the user actually needs embedded (`google.com`, `youtube.com`, most third-party SaaS) send `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'`, which makes them **permanently un-embeddable in any `<iframe>`** — no proxy or code change on our side can fix that (the proxy only helps same-origin/localhost dev-preview, where there's no such header to fight).

Given the user explicitly wants exactly this class of site to work embedded, the **native child-webview overlay (Tauri `add_child` → WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux) is now the primary and only embedding path**, unconditionally enabled on every platform (`embedded_browser_enabled()` returns `true` unconditionally; there is no more `native-gtk` opt-in flag or `iframe`-default policy in the current code). `<iframe>` + `/api/preview-proxy` remains for same-origin/localhost dev-preview only, where it has no `X-Frame-Options` problem and is cheaper than spinning up a second web-engine instance.

This pass also hardens the native overlay itself, since it was found to have three bugs that made it feel broken even after being wired up (see `design.md` → “Hardened patterns (current architecture)”):

1. `webview.navigate()` / `webview.reload()` are documented no-ops for Tauri child webviews on Windows — fixed by **recreate-on-navigate** (close old child, `add_child` a new one at the same bounds).
2. Recreate reused the outgoing webview's label, racing its `close()` teardown against the new `add_child` — fixed with a **fresh label per recreate** (monotonic counter; `panel_id` stays the stable external key).
3. Position sync only followed **size** changes (`ResizeObserver`) or a handful of manually-bumped `browserLayoutEpoch` call sites, so drags/splitter moves that didn't trip either left the panel visually stuck — fixed with a **continuous `requestAnimationFrame` diff loop** that catches every layout cause unconditionally.

Everything under "Original Phase 0–2 plan" below should be read with that reversal in mind: **native overlay ⇄ default** and **iframe ⇄ opt-in for same-origin/localhost preview**, not the other way around.

## Original Phase 0–2 plan (superseded, kept for history)

## Intent

Replace the heavy, Linux-only GTK/WebKit overlay as the default embedded browser with a **single lightweight embedding path** (iframe + localhost preview-proxy) that works on **Windows, macOS, and Linux**, while adopting **Wave Terminal’s browser UX patterns** (minimal chrome, home/pinned URL, fluid preview area) without migrating DevHub to Electron or dropping Zed/agent **element selector** capabilities.

## Problem Statement

| Issue           | Today                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows         | `native_browser_probe` returns `unsupported-platform`; default `browserRuntime: native-gtk` forces probe/fallback churn; preview often feels broken or confusing |
| Linux weight    | Second WebKitGTK instance in GTK overlay + resize/avoid-rect sync + duplicate engine vs main Tauri webview                                                       |
| Wave gap        | Wave uses Electron `<webview>` (Chromium) in-layout; DevHub uses overlay — different feel, not different product goals                                           |
| DevHub strength | Selector + `open_url` + proxy for localhost dev — must survive the lite path                                                                                     |

## Scope

### In Scope

- **Embedding policy**: iframe-first default on all platforms; native GTK overlay **opt-in** via `NEXT_PUBLIC_BROWSER_NATIVE_GTK=1` (Linux Tauri only) or removal in a later phase
- **Migration**: sanitize persisted `rightDockState.browserRuntime`; stop pizarra auto-upgrade to `native-gtk` unless opt-in
- **Wave-aligned UX**: `pinnedurl` + home, single toolbar row, edge-to-edge preview, optional favorites/quick-launch strip
- **Selector**: keep visual-edit on iframe/same-origin/proxy; document native-selector as opt-in only
- **Tests**: policy unit tests, right-dock/pizarra runtime regressions, preview-proxy smoke paths
- **Docs**: operator note in change + devhub-desktop-engineering alignment (Embed = iframe path)

### Out of Scope

- Electron shell or `<webview>` port (Wave’s exact stack)
- Multi-platform Tauri **child WebView2/WKWebView** overlay (future phase; listed in design as Phase 2 optional)
- Moving browser from right dock into terminal grid as a panel block
- `wsh`-style full CLI; optional thin `devhub web open` deferred to Phase 1b if timeboxed

## Capabilities

### New Capabilities

- `workspace-browser-embedding`: platform-aware default runtime, lite iframe path, opt-in native GTK
- `browser-wave-ux`: home/pinned URL, minimal toolbar, favorites strip contract
- `browser-selector-compat`: selector/edit mode rules unchanged on lite path; no regression vs visual-edits-selector-reliability

### Modified Capabilities

- `board-browser-load` (pizarra): iframe-first always unless native opt-in; no silent upgrade to GTK
- Archived reference: `browser-preview-architecture-hardening` contracts remain valid on iframe path

## Approach

**Phase 0 — Lite embedding (fix Windows + weight)**  
Policy module + default/sanitize + disable native probe unless opt-in; simplify status chrome.

**Phase 1 — Wave UX**  
`pinnedurl`, home button, toolbar compaction per right-dock-ux skill; favorites config.

**Phase 2 (optional) — Native sunset or WebView2**  
Either delete GTK browser overlay when opt-in unused, or spec child webview per OS.

## Affected Areas

| Area                                                         | Impact                                |
| ------------------------------------------------------------ | ------------------------------------- |
| `src/lib/browser/browserRuntimePolicy.js`                    | New                                   |
| `src/components/workspace/rightDockState.js`                 | Default + sanitize                    |
| `src/components/workspace/WorkspaceBrowserPane.jsx`          | Policy, UX, chip copy                 |
| `src/components/pizarra/PizarraBrowserSurface.jsx`           | No auto native upgrade                |
| `src/components/workspace/browserPreviewSupport.js`          | Policy hook for selection             |
| `src-tauri/src/native_browser.rs`                            | Unchanged Phase 0; gated by JS policy |
| Tests under `src/lib/browser/__tests__`, pizarra, right-dock | New/updated                           |

## Risks

| Risk                                                  | Mitigation                                         |
| ----------------------------------------------------- | -------------------------------------------------- |
| Linux users relied on native for non-embeddable sites | Opt-in flag; external + dedicated window unchanged |
| Selector worse on some sites without native WebKit    | Proxy + same-origin unchanged; document limits     |
| Persisted `native-gtk` in localStorage                | Sanitize on read                                   |

## Rollback Plan

Revert policy defaults to `native-gtk` and restore pizarra auto-upgrade; keep policy module for one-commit rollback.

## Success Criteria

- [ ] Windows Tauri: dock browser loads localhost and https without native probe errors
- [ ] Default fresh install uses iframe; no second WebKit process on Linux
- [ ] Edit mode / selector works on proxied localhost and same-origin
- [ ] Home + pinned URL behave like Wave `pinnedurl`
- [ ] Jest regressions green for right-dock and pizarra browser

# Exploration: workspace-browser-wave-aligned

## Current State (DevHub)

- **Default**: `rightDockState.browserRuntime = 'native-gtk'` (`rightDockState.js`).
- **Linux Tauri**: `native_browser.rs` — WebKit2GTK in GTK overlay; bounds via `resizeNativeBrowser`, `avoid_rects`, `browserLayoutEpoch`; UserScript `devhubSelector` for inspect.
- **Non-Linux**: `native_browser_probe` → `unsupported-platform` → effective iframe via `resolveBrowserRuntimeSelection`.
- **Fallback**: `<iframe>` + `/api/preview-proxy` for foreign localhost; visual-edit protocol for agent selector.
- **Pizarra**: starts `iframe`; effect upgrades to `native-gtk` when probe ready; carried-from-workspace cards force `native-gtk`.
- **Weight**: Linux deps `gtk`, `webkit2gtk`, `javascriptcore`, `cairo-rs`, `glib` — shared with window host; **second** WebView instance per visible native browser panel.

## Reference: Wave Terminal browser stack

| Layer               | Wave                                                             |
| ------------------- | ---------------------------------------------------------------- |
| Shell               | Electron 41 + React 19 (`electron-vite`)                         |
| Tab UI              | `WebContentsView` (Chromium)                                     |
| Web block           | `<webview>` (`WebviewTag`) **inside React layout**               |
| Engine              | Chromium (all desktop OS)                                        |
| Control             | `wsh web open`, block meta `url` / `pinnedurl`                   |
| Selector for agents | **Not productized** (DevTools on tab; find-in-page in web block) |

**Why Wave feels fluid**: preview is a layout child, not an OS overlay synchronized from React `getBoundingClientRect`.

## User Goals (from discovery)

1. Lighter browser on Linux (overlay + dual WebKit).
2. Working browser on **Windows** (today native path is a dead end by default).
3. Wave-like look/feel **browser only** — not block grid / `wsh` wholesale.
4. Keep **element selector** for Zed/agents.

## Approaches Considered

### 1. iframe-first + proxy (recommended Phase 0)

- **Pros**: Works everywhere Tauri or web dev runs; one code path; no resize overlay sync; selector already built for iframe/proxy; smallest change.
- **Cons**: `X-Frame-Options` on some sites; not full Chromium embed like Wave.
- **Effort**: Low–medium.

### 2. Tauri child WebView / WebView2 bounds overlay (Phase 2)

- **Pros**: Closer to Wave fluidity on Windows (Chromium via WebView2).
- **Cons**: Per-OS Rust; still overlay model in Tauri; large effort.
- **Effort**: High.

### 3. Migrate desktop to Electron for browser

- **Pros**: Copy Wave `<webview>` pattern.
- **Cons**: Contradicts DevHub Tauri investment.
- **Effort**: Rejected.

### 4. Keep native-gtk default on Linux only

- **Pros**: Best site compatibility on Linux without iframe limits.
- **Cons**: Does not fix Windows; keeps weight; user explicitly asked for lighter.
- **Effort**: N/A — conflicts with intent.

## Recommendation (superseded — see below)

~~Proceed with **iframe-first policy** + **Wave UX** on the existing right dock. Treat native GTK as **legacy opt-in** until metrics show zero need, then delete `native_browser.rs` in a follow-up change.~~

**Reversed after implementation.** Approach 1 (iframe-first) cannot be the default for the sites the user actually needs (`google.com`, `youtube.com`, most SaaS): `X-Frame-Options`/CSP `frame-ancestors` block iframe embedding unconditionally, and no proxy/code change on our side changes that (unlike the localhost/same-origin preview-proxy case this exploration originally focused on). Approach 2 (Tauri child WebView2/WKWebView/WebKitGTK overlay, originally scoped as "Phase 2, high effort, optional") was implemented and hardened instead, and is now the **primary and only embedding path**, unconditionally enabled on all platforms — see `design.md` for the current architecture and the bugs that had to be fixed (`navigate()`/`reload()` no-ops, label-reuse race, position-sync gaps) before it actually felt fluid. `<iframe>` + `/api/preview-proxy` is kept for same-origin/localhost dev-preview only, where there's no `X-Frame-Options` fight to lose.

## Open Questions (resolved in design — supersedes table below)

| Question                          | Decision (current)                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Default runtime                   | Native child-webview overlay, all platforms (Windows WebView2, macOS WKWebView, Linux WebKitGTK)                             |
| iframe                            | Kept for same-origin/localhost dev-preview only, not general external sites                                                  |
| Navigate/reload on existing panel | Recreate (close + `add_child`), never in-place `navigate()`/`reload()` (documented no-op ceiling on Windows)                 |
| Recreate label                    | Fresh monotonic label every time, never reuse — avoids close()/add_child() teardown race                                     |
| Position sync                     | Continuous `requestAnimationFrame` diff loop (bounds + avoid-rects), not `ResizeObserver`(size-only) + manually-bumped epoch |
| Selector                          | `devhubSelector` init-script bridge on the native panel (all platforms); iframe/proxy selector kept for the dev-preview path |

### Original table (superseded)

| Question        | Decision                                              |
| --------------- | ----------------------------------------------------- |
| Default runtime | `iframe` all platforms                                |
| Native GTK      | `NEXT_PUBLIC_BROWSER_NATIVE_GTK=1` + Linux Tauri only |
| Pizarra upgrade | Disabled unless opt-in                                |
| Selector        | Required on lite path; native selector optional       |
| Favorites strip | JSON in localStorage or settings slice Phase 1        |

## Coupling

- `useNativeBrowserSurface` now runs a continuous rAF bounds-sync loop whenever the native panel is active/visible (not idle-by-default as originally planned for the iframe-only case) — this is the intended cost of making position sync unconditional and correct; the loop is a cheap `getBoundingClientRect()` + shallow diff per frame with IPC only on actual change.
- `visual-edits-selector-reliability` — native `devhubSelector` bridge is now the primary selector path for embedded external sites; iframe/proxy selector remains for same-origin/localhost preview.
- `terminal-engine-v2` — independent; the GTK retention note in the terminal change is moot since the native overlay (WebKitGTK on Linux) is now permanent, not legacy.

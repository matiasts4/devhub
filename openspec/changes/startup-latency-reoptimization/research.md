# Research: startup / load latency options for DevHub

**Verdict first:** No new framework. Stay on Tauri + React + xterm.js. Biggest wins are (1) **dependency modernization wave** (Next patch + `@xterm/*` + Tauri + safe minors; verify Turbopack), (2) idle warm of sidecar + JS chunks + state, (3) finish waveterm-style `terminal-engine-v2` rehydration, (4) soft-mount dormant TWM with WebKit gates. Native Ghostty/WezTerm embeds and `ghostty-web` are research tracks, not near-term replacements.

**Also agreed with product:** package updates are in-scope for this initiative — not a separate “chore later”. Stale deps (especially deprecated xterm and lagging tooling) block perf fixes and inflate load cost.

---

## Quick path (what to do)

| Priority | Action                                                                                                         | Why                                                             | Effort        |
| -------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| P0       | Custom perf marks (no lib required)                                                                            | Decide with numbers                                             | S             |
| P0       | **Deps Wave A** — safe patches/minors (Next 16.2.6→16.2.10, React, Tauri API/CLI, Radix, axios, …)             | Cheap; unlocks upstream fixes; baseline before behavior changes | S             |
| P0       | Confirm Turbopack on `next dev` / `next build` (Next 16 default; our `next-dev.cjs` does not pass `--webpack`) | Dev TTI + build/chunk quality feed packaged load                | S             |
| P1       | **Deps Wave B** — migrate `xterm*` → `@xterm/*`                                                                | Deprecated; maintained perf line                                | M             |
| P1       | Idle warm: `ensureTTYServer` + prefetch `@xterm` dynamic imports                                               | Cuts L3 + first-panel import wait                               | S–M           |
| P1       | State prefetch + soft-mount dormant (tiers in design.md)                                                       | Moves L1/L2 off the Terminales click                            | M             |
| P1       | Land / align `terminal-engine-v2`                                                                              | Wave-style snapshot + delta                                     | L (in flight) |
| P2       | Bundle hygiene + `@next/bundle-analyzer` (already wired via `ANALYZE=true`)                                    | Monaco/Konva/motion weight                                      | M             |
| P2       | Font ready before `terminal.open`                                                                              | Webfont metrics                                                 | S–M           |
| P2       | **Deps Wave C** — Jest 27→29/30 (+ jsdom)                                                                      | DX/CI speed; not runtime TTI but unblocks modern React testing  | M             |
| P3       | **Deps Wave D** — majors only with owner (zod 4, react-day-picker 10, react-resizable-panels 4, eslint 10)     | High break risk; do after Waves A–B                             | L             |
| P3       | Spike `ghostty-web` behind flag                                                                                | Immature for multi-panel                                        | Spike only    |
| ❌       | Big-bang `npm update` everything / major hops in one PR                                                        | Breaks terminal + swarm + Tauri                                 | Reject        |
| ❌       | Replace renderer with Ghostty/WezTerm native                                                                   | Architecture rewrite                                            | Reject        |
| ❌       | Pre-spawn agent TUIs at app launch                                                                             | Memory/noise                                                    | Reject        |
| ❌       | New UI framework rewrite                                                                                       | Wrong bottleneck                                                | Reject        |

---

## Current stack (facts)

| Layer        | DevHub today                                             | Notes                                                                   |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Shell        | Tauri 2 + WebView2 / WebKitGTK                           | Startup = Rust + WebView + Next/React SPA                               |
| UI           | React 19.2.6 + Next **16.2.6** + react-router 7.16       | `TerminalWorkspacesManager` **static import** in `App.js`               |
| Terminal UI  | `xterm@5.3` + addons (fit/search/webgl/canvas/serialize) | **Deprecated npm names**; dynamic `import()` inside `useTerminalEngine` |
| PTY          | `node-pty` in Node sidecar + `ws`                        | `ensureTTYServer` on session need, not app launch                       |
| Stay-warm    | `terminalManagerEverMounted` + Option B opacity          | Only after first `/terminales`                                          |
| Constraint   | WebKitGTK offscreen GPU crash                            | Documented; blocks naive eager mount                                    |
| Tooling debt | Jest **27.5** / jsdom 20 / babel-jest 27                 | Latest Jest is 30.x — test/DX lag, not user TTI                         |

### Dependency audit snapshot (2026-07-17, `npm outdated`)

| Package                  | Installed       | Latest (npm)                                                                   | Latency relevance                           | Wave |
| ------------------------ | --------------- | ------------------------------------------------------------------------------ | ------------------------------------------- | ---- |
| `next`                   | 16.2.6          | **16.2.10**                                                                    | High (Turbopack, RSC deserialize, prefetch) | A    |
| `react` / `react-dom`    | 19.2.6          | 19.2.7                                                                         | Medium                                      | A    |
| `@tauri-apps/api`        | 2.10.1          | 2.11.1                                                                         | Medium (shell IPC)                          | A    |
| `@tauri-apps/cli`        | 2.11.2          | 2.11.4                                                                         | Low (build)                                 | A    |
| `@next/bundle-analyzer`  | 16.2.6          | 16.2.10                                                                        | Align with Next                             | A    |
| Most `@radix-ui/*`       | patch behind    | latest 1.x/2.x                                                                 | Low–med (tree size)                         | A    |
| `framer-motion`          | 12.40           | 12.42                                                                          | Low (unless we trim usage)                  | A    |
| `xterm` + addons         | 5.3 / old names | **`@xterm/xterm@5.5`** (+ scoped addons; v6 deferred — canvas peer still `^5`) | **Critical**                                | B    |
| `jest` + env             | 27.5            | 30.x                                                                           | DX/CI                                       | C    |
| `zod`                    | 3.25            | **4.4**                                                                        | Breaking; schemas everywhere                | D    |
| `react-day-picker`       | 9.14            | 10.x                                                                           | Breaking UI                                 | D    |
| `react-resizable-panels` | 3.0.6           | 4.x                                                                            | Breaking layouts                            | D    |
| `@supabase/ssr`          | 0.5.2           | 0.12                                                                           | Breaking if used hot path                   | D    |
| `eslint`                 | 9.23            | 10.x                                                                           | Tooling only                                | D    |

**Clarification:** Next is not “years behind” — it is on the 16.2 line a few patches down. The real stale pain is **xterm deprecation**, **Jest 27**, and a pile of safe minors never bumped. Still: bumping Next → 16.2.10 + confirming Turbopack is part of the load story (16.2 claims much faster dev startup and faster RSC/HTML paths).

---

## Peer architectures (what actually works)

### Wave Terminal

- Backend owns scrollback / cache file with `ptyoffset` + `termsize`.
- Frontend: load cache → temp resize → write snapshot → replay delta from main file.
- **Implication for us:** `terminal-engine-v2` is the right architectural bet for _re-show_ and revive latency; warm tiers only prepare the path.

### VS Code (Tyriar / xterm maintainers)

- Explicitly **stopped** launching the pty host until a terminal is needed (~50–100 MB saved).
- Revive slowness often = orphan checks / barriers, not “need more prewarm”.
- **Implication:** Do **not** make Tier 4 (spare PTY pool) the default. Prefer sidecar listen warm + lazy session create. Match VS Code: warm infrastructure, not orphan shells.

### xterm.js itself

- Texture atlas warm-up on the main thread caused GC/slow start → deferred to `requestIdleCallback` (merged; on maintained `@xterm` line).
- IdleTaskQueue / PriorityTaskQueue for resize and deferred work.
- Webfonts: must await font readiness before `open` or glyph metrics poison the atlas (`@xterm/addon-web-fonts` documents this). DevHub offers JetBrains Mono / Fira Code / Cascadia — **relevant**.

### Native GPU terminals (Ghostty, WezTerm, Alacritty)

- Faster as **standalone** apps (Metal/Vulkan/OpenGL, native parsers).
- Embedding into a multi-panel Tauri workspace = new IPC, focus, resize, selection, TUI paste, swarm attach surface.
- DevHub already deleted VTE for stability. Replacing xterm with another native embed is a product rewrite, not a load tweak.
- `libghostty` / `ghostty-web` (WASM, xterm-API-compatible claim, ~400KB) is the only interesting _future_ bridge — treat as spike after `@xterm` migration, not as Phase 1.

---

## Option catalog

### A. Measurement

| Option                | Package / API                  | Adopt?        | Notes                                                                                                  |
| --------------------- | ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------ |
| Custom marks/measures | `performance.mark` / `measure` | **Yes**       | Domain marks (`dh:terminal-route-enter` → `dh:first-panel-interactive`) beat generic CWV for this pain |
| `web-vitals`          | `web-vitals` (~2KB)            | Optional      | Useful for LCP/INP on dashboard routes; **secondary** for Terminales TTI                               |
| Bundle analyzer       | `@next/bundle-analyzer`        | **Yes** (dev) | Find if Monaco/Konva/recharts/latex pollute main chunk                                                 |
| Playwright/trace      | existing `test:e2e`            | Later         | Automate cold Terminales once marks exist                                                              |

**No need for** a commercial APM to start.

### B. JS / route loading

| Option                                 | Mechanism                                                 | Adopt?    | Notes                                                                |
| -------------------------------------- | --------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| Idle prefetch xterm modules            | `requestIdleCallback` + same `import('xterm…')` as engine | **Yes**   | Imports already lazy at panel init; prefetch removes click waterfall |
| `React.lazy` TWM                       | dynamic import from `App.js`                              | Evaluate  | Helps dashboard L0; must idle-prefetch or first Terminales worsens   |
| `webpackPrefetch` / Next link prefetch | bundler hints                                             | Evaluate  | SPA is HashRouter-ish workspace; idle `import()` is clearer in Tauri |
| Speculation Rules API                  | browser                                                   | Low value | Desktop WebView; not the bottleneck                                  |
| Partytown                              | worker for 3P scripts                                     | **No**    | Not our problem                                                      |

### C. Terminal renderer / packages

| Option                        | Package                                                                                                                          | Adopt?                   | Notes                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| Scoped xterm migration        | `@xterm/xterm`, `@xterm/addon-webgl`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-canvas`, `@xterm/addon-serialize` | **Yes**                  | Old `xterm` / `xterm-addon-*` deprecated; maintained perf work lives here |
| Web fonts addon               | `@xterm/addon-web-fonts`                                                                                                         | **Yes if** webfonts used | Preload selected mono face before first `open`                            |
| Stay on WebGL default         | current prefs                                                                                                                    | Keep                     | Already production path; canvas fallback exists                           |
| `ghostty-web`                 | `ghostty-web`                                                                                                                    | Spike only               | VT fidelity / WASM; unknown multi-panel + WebGL + our recovery story      |
| Native Ghostty/WezTerm window | OS terminal                                                                                                                      | **No**                   | Breaks integrated workspace                                               |
| Reintroduce VTE               | removed                                                                                                                          | **No**                   | Known failure mode                                                        |

### D. PTY / sidecar

| Option                   | Approach                 | Adopt?    | Notes                                                      |
| ------------------------ | ------------------------ | --------- | ---------------------------------------------------------- |
| Warm `ensureTTYServer`   | Idle after project ready | **Yes**   | Idempotent listen; no panel                                |
| Spare shell pool N=1     | Pre-create empty PTY     | Flag only | VS Code avoided eager pty host; cwd/project-switch orphans |
| Pre-launch OpenCode/Grok | Agent at startup         | **No**    | Conflicts restore policy + RAM                             |
| Move PTY to Rust         | rewrite sidecar          | Defer     | Huge; Node sidecar is known quantity                       |

### E. Lifecycle / architecture (in-repo)

| Option                 | Track             | Adopt?                   | Notes                                             |
| ---------------------- | ----------------- | ------------------------ | ------------------------------------------------- |
| Soft-mount dormant TWM | Tier 3 design     | **Yes** (platform-gated) | Biggest first-visit L1 win if dormant stays light |
| State prefetch         | Tier 2            | **Yes**                  | Pure JS; no new deps                              |
| `terminal-engine-v2`   | existing OpenSpec | **Yes**                  | Wave-style rehydrate; complements warm tiers      |
| Option B keep-alive    | already shipped   | Keep                     | Second+ visit already fast                        |

### F. App shell / Tauri

| Option                            | Approach           | Adopt?          | Notes                                           |
| --------------------------------- | ------------------ | --------------- | ----------------------------------------------- |
| Defer non-critical Rust/Node init | after first paint  | **Yes** (audit) | Classic Tauri advice                            |
| Shrink Rust crate graph           | build hygiene      | Opportunistic   | Binary size / cold start                        |
| Avoid admin elevation             | Windows            | Check           | Known 20s WebView2 stalls when elevated wrongly |
| Splash → progressive UI           | shell then content | If L0 bad       | Only after marks prove shell-bound              |

### G. UI weight on terminal path

| Option                                  | Approach                      | Adopt?        | Notes                             |
| --------------------------------------- | ----------------------------- | ------------- | --------------------------------- |
| Trim `framer-motion` on cold Terminales | CSS / fewer AnimatePresence   | Evaluate      | TWM + TerminalTTY import motion   |
| Monaco only in editor dock              | already somewhat isolated     | Keep / verify | `@monaco-editor/react` is heavy   |
| Konva/Pizarra                           | `dynamic()` already on canvas | Keep          | Don't pull into TWM critical path |

---

## Frameworks: do we need one?

| Candidate                                   | Role              | Decision                               |
| ------------------------------------------- | ----------------- | -------------------------------------- |
| Next.js (current)                           | bundler + app     | Keep; optimize chunks, don't rewrite   |
| Vite-only SPA                               | alternate bundler | Not worth migration cost for this pain |
| Solid / Svelte                              | UI rewrite        | Reject                                 |
| Electron                                    | desktop shell     | Worse startup/size vs Tauri            |
| “Terminal framework” (Hyper, Tabby as base) | product fork      | Reject; we'd inherit their constraints |

**Conclusion:** Optimization framework = **our warm policy + marks + `@xterm` + v2**, not a third-party “startup framework”.

---

## Dependency modernization (in-scope)

Package updates are a **first-class track** of this SDD, not a side chore. Goal: unlock upstream perf + security, then measure Terminales TTI again.

### Rules

1. **Waves, not big-bang** — one wave per PR (or chained PRs under 400 lines where possible).
2. **Perf-relevant first** — Next patch, `@xterm/*`, Tauri; then tooling; majors last.
3. **Re-baseline marks after Wave A and Wave B** — prove or disprove load impact.
4. **No silent majors** — zod 4 / day-picker 10 / resizable-panels 4 need dedicated owner + tests.
5. Prefer `pnpm up` within ranges, then pin known-good; keep `packageManager: pnpm@10.29.3`.

### Wave A — safe patches / minors (ADOPT now)

```text
next, @next/bundle-analyzer          → 16.2.10
react, react-dom                     → 19.2.7
@tauri-apps/api                      → 2.11.x
@tauri-apps/cli                      → latest 2.11.x
@radix-ui/*                          → wanted/latest within major
framer-motion, axios, lucide-react,
react-router-dom, recharts, …
Verify: next dev uses Turbopack (default in 16; do not force --webpack)
Smoke: tauri:dev boot, /terminales open, one API route
```

### Wave B — terminal packages (ADOPT)

```text
# replace
xterm                    → @xterm/xterm
xterm-addon-fit          → @xterm/addon-fit
xterm-addon-search       → @xterm/addon-search
xterm-addon-webgl        → @xterm/addon-webgl
xterm-addon-canvas       → @xterm/addon-canvas
xterm-addon-serialize    → @xterm/addon-serialize
# optional later
@xterm/addon-web-fonts
```

### Wave C — test tooling (ADOPT for CI speed)

```text
jest 27 → 29 or 30 (+ babel-jest, jest-environment-jsdom, jsdom)
Expect: jest config / transformer churn; no user-facing TTI claim until proven
```

### Wave D — majors (EVALUATE, separate PRs)

```text
zod 3 → 4
react-day-picker 9 → 10
react-resizable-panels 3 → 4
@supabase/ssr 0.5 → 0.12
eslint 9 → 10
```

### Do not add (for this initiative)

- `ghostty-web` (until spike)
- PTY pooling libraries
- New terminal UI kits
- Partytown / speculation-rules polyfills
- Blind `pnpm update --latest` across majors

---

## Risk matrix (research-informed)

| Move                       | Upside                         | Risk                               | Gate                           |
| -------------------------- | ------------------------------ | ---------------------------------- | ------------------------------ |
| `@xterm` migrate           | Maintained perf + security     | Addon API drift; WebGL regressions | Golden panel tests + TUI smoke |
| Idle xterm import prefetch | −import latency on first panel | Memory on dashboard                | Cancel on project leave        |
| Sidecar warm               | −L3                            | Sidecar crash class                | Idempotent; no session create  |
| Soft-mount Tier 3          | −L1                            | WebKit white-screen                | Linux default off              |
| Spare PTY                  | −first shell                   | Orphans / RAM                      | Opt-in only                    |
| ghostty-web                | VT quality                     | Immature; dual renderer forever    | Spike behind flag              |
| Native embed               | Raw FPS                        | Architecture rewrite               | Out of scope                   |

---

## Recommended program (aligned to OpenSpec phases)

```text
Phase 0   Measure (marks)
Phase 0A  Deps Wave A — Next/React/Tauri/Radix patches + Turbopack verify
Phase 0B  Bundle analyzer snapshot (ANALYZE=true already supported)
Phase 0C  Deps Wave B — @xterm/* migration + re-baseline marks
Phase 1   Idle warm: sidecar + prefetch @xterm imports
Phase 2   State prefetch
Phase 3   Soft-mount dormant (Windows on / Linux off)
Phase 4   Font preload before open
Phase 5   Deps Wave C — Jest modernization (CI/DX)
Phase 6+  Deps Wave D — selected majors (zod/day-picker/…) one at a time
Ongoing   terminal-engine-v2 (Wave rehydrate)
Later     ghostty-web spike if still needed
Never     agent pre-spawn; native terminal rewrite; framework hop; big-bang majors
```

---

## Open questions for product

1. After Phase 0 baseline: is the pain mostly **first Terminales** (L1–L3) or **many-panel restore** (L4–L5 / v2)?
2. Accept Tier 3 soft-mount RSS on Windows for faster first open?
3. Schedule `@xterm` migration as its own PR before warm prefetch (cleaner) or after?
4. Include **Jest 30** in the same program quarter, or park Wave C after Terminales warm ships?
5. Any majors (zod 4) already desired for other reasons — schedule Wave D explicitly?

---

## Sources (investigated)

- xterm.js #4103 / #4131 (atlas idle warm); npm migrate to `@xterm` (#4859); releases 5.4+
- VS Code #186938 (lazy pty host); revive orphan barrier history
- Wave TermWrap cache + delta load path
- coder/ghostty-web README (WASM, xterm API compatibility claim)
- Tauri v2 startup guidance (defer init, code split)
- In-repo: `docs/errores/05-deb-webkit-page-couldnt-load/`, `useTerminalEngine.js` dynamic imports, `App.js` warm-mount, `terminal-engine-v2` design

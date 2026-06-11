# Tasks: zed-ambient-aura

> File-level TDD tasks, dependency-sorted. Each task: RED test → GREEN impl → REFACTOR. Single commit per task, ≤130 LOC net. Branch: `feature/terminal-renderer-xterm-webgl` (DO NOT switch). Strict TDD per `openspec/config.yaml` (`tdd: true`); test command: `npm test`. Companion change `pizarra-motion-polish` may also mount `MotionProvider` in `App.js` and touch `globals.css`; both diffs are non-conflicting.

## Review Workload Forecast

| Field                                                          | Value                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines                                        | **~310 – 380** (impl ~190 + tests ~160 + CSS ~30)                                                                                                                                     |
| 400-line budget risk                                           | **Low**                                                                                                                                                                               |
| Chained PRs recommended                                        | **No**                                                                                                                                                                                |
| Delivery strategy                                              | `single-pr`                                                                                                                                                                           |
| Chain strategy                                                 | n/a                                                                                                                                                                                   |
| Decision needed before apply                                   | **No**                                                                                                                                                                                |
| Suggested split (if override)                                  | PR-1: ZAA-1+2+3 (budget + extract + dispatch, ~150 LOC). PR-2: ZAA-4+5+6 (overlay + CSS + MotionProvider, ~200 LOC). PR-3: ZAA-7 (manual smoke, 0 LOC) — using `feature-branch-chain` |
| 400-line risk if companion `pizarra-motion-polish` lands first | **Medium** (its `MotionConfig` mount collapses our `App.js` diff to no-op)                                                                                                            |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

### Per-Task LOC Breakdown

| Task                          |    Impl |   Tests |    Total | Scope                                             |
| ----------------------------- | ------: | ------: | -------: | ------------------------------------------------- |
| ZAA-1 (zedAuraBudget)         |      20 |      35 |       55 | src/lib/asistente/zedAuraBudget.js + test         |
| ZAA-2 (extractToolType)       |      35 |      40 |       75 | src/lib/asistente/buildZedAmbientStatus.js + test |
| ZAA-3 (useZedChat dispatch)   |      20 |      25 |       45 | useZedChat.js + zedOverlayEvents.js + SSR test    |
| ZAA-4 (overlay consumes type) |      35 |      40 |       75 | ZedAmbientOverlay.jsx + test                      |
| ZAA-5 (CSS keyframes+vars)    |      30 |      20 |       50 | src/app/globals.css + snapshot test               |
| ZAA-6 (MotionProvider mount)  |      10 |      15 |       25 | src/App.js + test                                 |
| ZAA-7 (manual smoke)          |       0 |       0 |        0 | tests/e2e/ (optional)                             |
| **Sub-total**                 | **150** | **175** |  **325** | —                                                 |
| Spec doc updates              |       0 |       0 |      ~20 | inline comments in source                         |
| **Grand total**               |       — |       — | **~345** | within 400-line budget                            |

---

## Phase 1: Foundation — intensity budget + pure extract helper (no React, no DOM)

Pure JS modules. Block nothing but need to land first because every other task consumes them.

- [x] **ZAA-1** Create `src/lib/asistente/zedAuraBudget.js` with `AURA_INTENSITY` map + `clampZedAuraIntensity(phase)`.
  - **RED**: `src/lib/asistente/__tests__/zedAuraBudget.test.js` — 5 cases: `idle→0.10`, `open→0.18`, `responding→0.30`, `executing→0.35`, unknown phase→`idle` (0.10).
  - **GREEN**: `Object.freeze({ idle:0.10, open:0.18, responding:0.30, executing:0.35 })` + `clampZedAuraIntensity(p) = AURA_INTENSITY[p] ?? AURA_INTENSITY.idle`. JSDoc typedef `ZedAmbientPhase`.
  - **REFACTOR**: extract `AURA_INTENSITY` keys check to a `KNOWN_PHASES` Set if helpful.
  - **Acceptance**: `npm test -- --testPathPattern=zedAuraBudget` green.
  - **LOC**: impl +20, tests +35, total +55. Commit: `feat(zed-aura): ZAA-1 add zedAuraBudget module with AURA_INTENSITY map`.

- [x] **ZAA-2** Extend `src/lib/asistente/buildZedAmbientStatus.js` with `extractToolType(message)`.
  - **RED**: append 5 cases to `src/lib/asistente/__tests__/buildZedAmbientStatus.test.js` — null input→`null`, tool-only (`open_terminal`/`execute_in_terminal`/`close_terminal`→`'terminal'`, `open_url`→`'browser'`, `list_terminals`→`'file'`, unknown `weird_tool`→`'file'`), content-only→`null`, both-present (tool wins), empty `tool_results` array→`null`.
  - **GREEN**: add `TOOL_TYPE_MAP` constant + `export function extractToolType(message)`. Map per design §Decision 3: `open_terminal`/`execute_in_terminal`/`close_terminal`→`'terminal'`, `open_url`→`'browser'`, all others→`'file'`. Returns `null` for null/non-object input, missing `tool_results`, empty `tool_results`, or non-string `tool`.
  - **REFACTOR**: keep `summarizeToolResult` switch and `TOOL_TYPE_MAP` independent (do not collapse them — different return types).
  - **Acceptance**: existing `buildZedAmbientStatus` tests still pass; new 5 cases pass.
  - **LOC**: impl +35, tests +40, total +75. Commit: `feat(zed-aura): ZAA-2 export extractToolType from buildZedAmbientStatus`.

---

## Phase 2: Wire tool-type end-to-end (chat → event → overlay)

Connects the pure helpers to React state. The `MotionConfig` task is deferred to Phase 4 so the `useReducedMotion()` mocks in this phase still work.

- [x] **ZAA-3** Add `ZED_AURA_TOOL_TYPE_EVENT` + `dispatchZedAuraToolType` to `src/lib/asistente/zedOverlayEvents.js`; add `lastToolType` selector + dispatcher in `src/lib/asistente/useZedChat.js`.
  - **RED**: append 2 cases to `src/lib/asistente/__tests__/zedOverlayEvents.test.js` — (a) SSR safety: call `dispatchZedAuraToolType('terminal')` after `delete global.window` → no throw, returns undefined; (b) event name stability: `ZED_AURA_TOOL_TYPE_EVENT === 'devhub:zed-aura-tool-type'`. Add a `useZedChat.test.js` (NEW) — when `messages` contains a tool-result message, hook returns `lastToolType: 'terminal'` and an effect calls `dispatchZedAuraToolType('terminal')` once.
  - **GREEN**: in `zedOverlayEvents.js`, add `ZED_AURA_TOOL_TYPE_EVENT` constant + `dispatchZedAuraToolType(toolType)` (SSR guard `if (typeof window === 'undefined') return;`). In `useZedChat.js`, add `lastToolType` derived value via `[...messages].reverse().find(...)` filtered for `tool_results[0]?.tool` + mapped through `extractToolType`; add `useEffect` that calls `dispatchZedAuraToolType(lastToolType)` only when it changes (track via `lastDispatchedTypeRef`).
  - **REFACTOR**: extract `selectLastToolType(messages)` as an exported pure helper from `useZedChat.js` so the dispatch-effect test can drive it without rendering the hook.
  - **Acceptance**: `npm test -- --testPathPattern=useZedChat|zedOverlayEvents` green; no API break to existing `useZedChat` consumers (new field is additive).
  - **LOC**: impl +20, tests +25, total +45. Commit: `feat(zed-aura): ZAA-3 dispatch tool-type from useZedChat via new CustomEvent`.

---

## Phase 3: Overlay consumes tool type + CSS authoring

Visual contract lives here. Two tightly coupled tasks because the CSS class names are pinned by the overlay test.

- [x] **ZAA-4** Make `ZedAuraFrame` consume `toolType` from `ZED_AURA_TOOL_TYPE_EVENT`; render `data-tool`, per-tool pulse class, intensity from `AURA_INTENSITY`.
  - **RED**: extend `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` with 4 cases — (a) when `useZedChat.lastToolType === 'terminal'` and phase `executing`, aura root has `data-tool="terminal"` AND inner div has class `zed-aura-pulse-terminal`; (b) when `lastToolType === 'browser'`, `data-tool="browser"` + `zed-aura-pulse-browser`; (c) when `lastToolType === null`, `data-tool="null"` and no per-tool class; (d) `getComputedStyle` (or `animate.opacity` mock) reads `AURA_INTENSITY.executing` (=0.35) not the legacy 0.5. Set the `useReducedMotion` mock to return `false` for (a)-(c) and assert no `zed-aura-pulse-*` class in (d) with `useReducedMotion` returning `true`.
  - **GREEN**: in `ZedAmbientOverlay.jsx`, (a) import `AURA_INTENSITY`, `clampZedAuraIntensity`, `extractToolType`, `ZED_AURA_TOOL_TYPE_EVENT`, `dispatchZedAuraToolType`; (b) add `toolType` state via `useEffect` subscribing to the event (tear down on unmount); (c) in `ZedAuraFrame`, replace inline `intensity` ternary with `clampZedAuraIntensity(phase)`; (d) replace `pulse` flag with `pulseClass = !reducedMotion && toolType ? `zed-aura-pulse-${toolType}` : ''`; (e) set `data-tool={toolType || 'null'}` on the inner div; (f) apply `style={{ '--accent-terminal':..., '--accent-browser':..., '--accent-file':... }}` on the inner div (literal hex from design §Decision 5). Do NOT touch `z-[248]` or `pointer-events-none` (NFR-P05).
  - **REFACTOR**: extract the `style` object to a `useMemo` so it only recomputes when `toolType` changes.
  - **Acceptance**: all 4 new test cases green; existing overlay tests still pass (mock changes for `useZedChat.lastToolType` and `useReducedMotion`).
  - **LOC**: impl +35, tests +40, total +75. Commit: `feat(zed-aura): ZAA-4 overlay consumes tool-type + clamps intensity to AURA_INTENSITY`.

- [x] **ZAA-5** Add `--accent-terminal/browser/file` CSS vars + 3 per-tool keyframes + reduced-motion media queries to `src/app/globals.css`. **CRITICAL: only touch the `zed-aura-*` block (lines ~1588-1636); do not refactor other CSS.**
  - **RED**: add `src/app/globals.css.__tests__/zedAuraCss.test.js` (NEW) — snapshot test the file's `zed-aura-*` region (parse the file with a simple regex extractor; assert presence of: (a) `.zed-aura-root { --accent-terminal: #4ad3c0; --accent-browser: #9b6bff; --accent-file: #f0b54a; }`; (b) `@keyframes zed-aura-pulse-terminal/browser/file`; (c) `@media (prefers-reduced-motion: no-preference) { ... animation: zed-aura-pulse-terminal 4s ease-in-out infinite; ... }`; (d) `@media (prefers-reduced-motion: reduce) { ... animation: none; ... }` covering all 4 classes (terminal/browser/file + legacy `.zed-aura-pulse`).
  - **GREEN**: append a new `/* zed-aura-*: Zed ambient aura tool-type block */` section to `globals.css` (~30 lines) with the literal hex values, 3 keyframes (same 0%/50%/100% curve as existing `zed-aura-breathe`), and the two media queries.
  - **REFACTOR**: confirm `.zed-aura-breathe` keyframe is untouched (legacy class still works).
  - **Acceptance**: snapshot test green; visual smoke in dev (manually).
  - **LOC**: impl +30, tests +20, total +50. Commit: `feat(zed-aura): ZAA-5 add per-tool keyframes + CSS vars scoped to .zed-aura-root`.

---

## Phase 4: Reduced-motion tree-level gate

Single-line mount that matches `pizarra-motion-polish` P-MP-8. If that change lands first on `main`, this is a no-op confirmation.

- [x] **ZAA-6** Mount `<MotionProvider>` once in `src/App.js` so `useReducedMotion()` becomes a tree-level value (NFR-P06).
  - **RED**: `src/__tests__/App.motion.test.jsx` (NEW) — render `App` with `MotionConfig` consumer child; with the jest stub returning `'never'`, assert child `useReducedMotion()` returns `'never'` (the stub override works because `MotionProvider` is mounted at root).
  - **GREEN**: in `src/App.js`, add `import { MotionProvider } from '@/components/ui/motion/MotionProvider'`; wrap the existing `<HashRouter>` (or insert just below) in `<MotionProvider>`. **Coordinate** with `pizarra-motion-polish` — if that PR lands first, this diff collapses to importing the wrapper only.
  - **REFACTOR**: keep the import on a single line; no other changes to `App.js`.
  - **Acceptance**: test green; no framer-motion consumer in the app regresses (existing `useReducedMotion()` calls still return the stub value).
  - **LOC**: impl +10, tests +15, total +25. Commit: `feat(zed-aura): ZAA-6 mount MotionProvider in App for tree-level reducedMotion`.

---

## Phase 5: Verification (gate before sdd-verify)

- [x] **ZAA-7** Manual smoke checklist + optional E2E scaffold. **No code change** in this task — documentation only. Body:
  - [ ] Open Zed pill in any project. Aura opacity at `open` phase ≤ 0.18 (visual feel: barely there).
  - [ ] Ask Zed to "abrí una terminal con ls". During execution, aura shifts toward teal (terminal accent), opacity ≤ 0.35. No aggressive pulse on reduced-motion.
  - [ ] Open browser via Zed ("abrí GitHub"). Aura shifts toward violet.
  - [ ] Toggle OS reduced-motion → no animation; aura shows static tint.
  - [ ] Click terminal surface while aura visible at `executing`: click reaches terminal (no `pointerdown` consumed by aura).
  - [ ] Open a shadcn dialog over the aura → dialog renders above (z-index ≥ 1000 vs 248).
  - [ ] Optional E2E: scaffold `tests/e2e/zed-ambient-aura.spec.ts` with the first 3 bullets (Playwright + `prefersReducedMotion` stub). Mark as `[ ]` in the spec file but DO NOT block PR on it.
  - **LOC**: 0 impl; ~15 lines in `tests/e2e/zed-ambient-aura.spec.ts` if added.

---

## Execution Order

1. **ZAA-1** → **ZAA-2** (Phase 1, pure JS, no deps)
2. **ZAA-3** (consumes ZAA-2's `extractToolType`)
3. **ZAA-4** + **ZAA-5** in any order (tightly coupled; prefer ZAA-4 first so the class names it emits are tested before the CSS that styles them)
4. **ZAA-6** (independent; could land in parallel with ZAA-3/ZAA-4)
5. **ZAA-7** (manual gate; runs after all impl is merged)

Each commit ≤ 130 LOC. No commit touches more than 3 files (test file + source file + sometimes a co-located snapshot).

## Cross-Change Notes

- **pizarra-motion-polish P-MP-8** also mounts `MotionProvider` in `App.js` and may add `prefers-reduced-motion` CSS in `globals.css`. Both diffs are non-conflicting (different regions of `App.js`, different blocks in `globals.css`). The PR that lands second will see a no-op or trivial merge.
- **Agente 2** owns `src/lib/asistente/tools/**`. Do NOT add or modify tools here. The new `TOOL_TYPE_MAP` only references tool NAMES; it does not call them.
- **No new color tokens** in `src/lib/theme/themes.js`. CSS vars use literal hex from the existing palette.

## Out of Scope (DO NOT touch in this PR)

- `src/lib/asistente/tools/**` (Agente 2)
- `src/lib/theme/themes.js` (Agente 4)
- `motion-tokens.js` / `surfaceMotion.js` (other motion concerns)
- The `zed-aura-breathe` keyframe (legacy, preserved)
- `useZedChat` state-machine refactor (only the additive `lastToolType` selector)
- Swarm/orchestration (paused per `00-shared-context.md`)

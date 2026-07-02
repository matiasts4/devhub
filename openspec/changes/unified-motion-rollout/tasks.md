# Tasks: Unified Motion Rollout (Phase A)

## Review Workload Forecast

| Field                   | Value                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Estimated changed lines | ~950–1150                                                                               |
| 400-line budget risk    | High                                                                                    |
| Chained PRs recommended | Yes                                                                                     |
| Suggested split         | PR 1: foundation + Ajustes → PR 2: App/sidebar/routes → PR 3: migrations + CSS + verify |
| Delivery strategy       | single-pr-default                                                                       |
| Chain strategy          | pending                                                                                 |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## Phase 1: Foundation

- [x] 1.1 Motion mode storage in `src/lib/theme/themes.js`: add `MOTION_MODE_STORAGE_KEY`, `normalizeMotionMode`, `getStoredMotionMode`, `setStoredMotionMode`, `applyMotionModeToDocument`, `setMotionMode`. Tests in `src/lib/theme/__tests__/themes.test.js`. AC: default 'normal', read/write/normalize pass. Est: 60.
- [x] 1.2 Create global `src/components/ui/motion/MotionModeContext.js` exporting `useMotionMode()`. AC: returns valid mode. Est: 20.
- [x] 1.3 Update `src/components/ui/motion/MotionProvider.jsx` to read stored mode, apply `MotionConfig.reducedMotion`, provide context. AC: config/context match mode. Est: 50. Deps: 1.1, 1.2.
- [x] 1.4 `motion-tokens.js` v2: import `spring`/`amplified` from `motionPresets.js`, alias `TRANSITION.spring`, absorb pizarra fork, add `HOST_MOTION_MODES`. surfaceMotion.js re-exports tokens. AC: TRANSITION.spring real, no dead spring. Est: 90.

## Phase 2: Preference UI

- [x] 2.1 Add motion-mode section to `src/views/Ajustes.jsx` Apariencia tab, 3-way toggle. AC: persists and updates provider; default 'normal'. Est: 70. Deps: 1.1, 1.3.
- [x] 2.2 Update `src/views/MotionLab.jsx` to initialize local mode from `useMotionMode()` while keeping local toggle. AC: starts in stored mode; local toggle non-persistent. Est: 30. Deps: 1.2, 1.3.

## Phase 3: Core Migrations

- [x] 3.1 Replace sidebar width animation in `src/App.js` with translateX + opacity preset. AC: no width tween; reduced opacity-only. Est: 80. Deps: 1.4.
- [x] 3.2 Add `AnimatePresence` + keyed `motion.div` around `<Outlet>` in `src/App.js`; create `src/hooks/useRouteDirection.js` for variants; terminal sibling unchanged. AC: overlay/scroll unchanged. Est: 120. Deps: 1.4.
- [x] 3.3 Migrate `src/components/TerminalTabsManager.jsx` tab body crossfade to `spring.toggle`. AC: uses preset; reduced mode collapses. Est: 40. Deps: 1.4.
- [x] 3.4 Replace inline 360/30/0.7 in `src/components/asistente/ZedAmbientOverlay.jsx` with preset. AC: no inline springs. Est: 30. Deps: 1.4.
- [x] 3.5 Replace inline 500/30 in `src/components/commandBar/CommandBar.jsx` with `spring.toggle`. AC: uses preset; reduced opacity-only. Est: 40. Deps: 1.4.
- [x] 3.6 Migrate `ZedActivityDrawer` and `SmartSuggestionsPanel` to spring presets. AC: no hardcoded springs.
  - [x] `ZedActivityDrawer` → `spring.open`
  - [x] `SmartSuggestionsPanel` → `spring.open`
  - [ ] `TerminalStartupRestoreBanner` → DEFERRED to Phase B (file lives under `src/components/terminal/`). Est: 90. Deps: 1.4.

## Phase 4: CSS + Contract

- [x] 4.1 Deduplicate `@keyframes` from `src/index.css` into `src/app/globals.css`; align `zed-aura-*` durations to tokens where feasible. AC: no duplicate names; build passes. Est: 80.
- [x] 4.2 Define `HOST_MOTION_MODES.TRANSFORM_SAFE` and `HOST_MOTION_MODES.OPACITY_ONLY` in `motion-tokens.js`. AC: exported and documented for Phase B. Est: 40. Deps: 1.4.

## Phase 5: Verification

- [x] 5.1 Run `npm test`; fix failures in targeted suites. AC: motion tests pass. Est: 20. Deps: all above.
- [x] 5.2 Run `npx next build` and eslint on changed files; fix errors. AC: build passes; eslint clean. Est: 20. Deps: all above.
- [x] 5.3 Smoke test Ajustes motion toggle, route transitions, sidebar expand/collapse, terminal overlay. AC: behavior verified. Est: 0. Deps: all above.

## Phase 6: Phase B (Deferred)

- [ ] 6.1 Terminal/pizarra motion coordination — DEFERRED until user's parallel terminal work lands. Plan separately.

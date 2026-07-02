# Design: Unified Motion Rollout

## Technical Approach

Phase A wires a single persistent motion-mode preference through the whole web app: `Ajustes` writes to localStorage, `MotionProvider` reads it and drives `MotionConfig reducedMotion` plus a global context, and `motion-tokens.js` v2 exposes the approved `motionPresets.js` springs. Non-terminal inline motion sites migrate to preset-based, mode-aware transitions. Terminal/pizarra motion stays untouched in Phase A; only the `HostMotionMode` contract is defined for Phase B.

## Architecture Decisions

| Decision                             | Options                                  | Trade-offs                                                                     | Choice                                                                                                               |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Storage pattern                      | New `motionMode.js` module               | Clean separation but adds a module for one pref                                | Extend `src/lib/theme/themes.js` with `devhub:motion-mode`, mirroring `getStoredTheme` / `setTheme`                  |
| Global motion context                | Promote showcase `MotionModeContext`     | Showcase needs a local override that does **not** mutate the stored preference | Create a new global `MotionModeContext` in `src/components/ui/motion/`; MotionLab keeps its local provider for demos |
| MotionLab default                    | Read global mode once                    | Local toggle must not write global pref                                        | MotionLab initializes local state from `useMotionMode()` and wraps demos with the local provider                     |
| `MotionConfig.reducedMotion` mapping | Always `user`                            | Cannot force reduced from app pref                                             | `'reduced'` → `'always'`; `'normal'` / `'amplified'` → `'user'` (still respects OS reduced)                          |
| Sidebar transform                    | Pure `translateX` with fixed-width panel | Freeing main-content width still requires a layout width snap                  | Container width snaps instantly to `0 / 48 / 256 px`; inner panel animates `translateX` + opacity with `spring.nav`  |
| Route transitions                    | Full-page AnimatePresence                | Must not affect the absolute terminal container                                | Wrap `<Outlet>` **inside** `<main>` with a keyed `motion.div`; terminal container remains a sibling                  |
| Token v2 spring source               | Inline new values in `motion-tokens.js`  | Duplicates approved showcase presets                                           | Import `spring` / `amplified` from `motionPresets.js`; alias `TRANSITION.spring = spring.toggle.transition`          |
| `surfaceMotion.js` fork              | Delete file                              | Phase B still references pizarra chrome constants                              | Keep as a thin adapter that imports durations/easings from `motion-tokens.js` and re-exports them                    |

## Data Flow

```
Ajustes ──setMotionMode()──┐
                           ▼
                  localStorage (devhub:motion-mode)
                           │
         ┌─────────────────┴─────────────────┐
         │  storage event / custom event     │
         ▼                                   ▼
   MotionProvider                      document.documentElement
   (MotionConfig + context)            [data-motion-mode]
         │                                   │
         ├──────────────┬────────────────────┘
         ▼              ▼
   route/sidebar   motion-lab (local override)
   presets         demos
```

## File Changes

| File                                                       | Action | Description                                                                                                                                             |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/theme/themes.js`                                  | Modify | Add `MOTION_MODE_STORAGE_KEY`, `normalizeMotionMode`, `getStoredMotionMode`, `setStoredMotionMode`, `applyMotionModeToDocument`, `setMotionMode`        |
| `src/components/ui/motion/MotionModeContext.js`            | Create | Global context exporting `useMotionMode()`                                                                                                              |
| `src/components/ui/motion/MotionProvider.jsx`              | Modify | Read stored mode, listen for changes, wrap in `MotionConfig` + global provider                                                                          |
| `src/components/ui/system/motion-tokens.js`                | Modify | v2: absorb pizarra `DUR`/`EASE`, import `spring`/`amplified`, replace dead `TRANSITION.spring` with `spring.toggle.transition`, add `HOST_MOTION_MODES` |
| `src/lib/pizarra/surfaceMotion.js`                         | Modify | Re-export durations/easings from `motion-tokens.js`; keep pizarra-only chrome constants                                                                 |
| `src/views/Ajustes.jsx`                                    | Modify | Add motion-mode section in the _Apariencia_ tab using `MotionModeToggle`                                                                                |
| `src/views/MotionLab.jsx`                                  | Modify | Initialize local mode from global context; keep local toggle                                                                                            |
| `src/App.js`                                               | Modify | Sidebar transform wrapper; add `useRouteDirection` and `AnimatePresence` around `<Outlet>`                                                              |
| `src/components/TerminalTabsManager.jsx`                   | Modify | Sliding active-tab indicator via `layoutId` + `spring.toggle`; terminal bodies stay opacity-only                                                        |
| `src/components/commandBar/CommandBar.jsx`                 | Modify | Command palette uses `spring.toggle`; backdrop/status remain opacity-only                                                                               |
| `src/components/asistente/ZedAmbientOverlay.jsx`           | Modify | Pill entrance uses `spring.toggle`                                                                                                                      |
| `src/components/asistente/ZedActivityDrawer.jsx`           | Modify | Expand/collapse uses `spring.open`                                                                                                                      |
| `src/components/dashboard/SmartSuggestionsPanel.jsx`       | Modify | `SuggestionCard` uses `spring.open`; list uses `layout`                                                                                                 |
| `src/components/terminal/TerminalStartupRestoreBanner.jsx` | Modify | Entrance/exit uses `spring.open`                                                                                                                        |
| `src/index.css`                                            | Modify | Remove duplicated keyframes (`fadeInUp`, `slideInRight`, `typing-dot`, `skeleton-shimmer`, `reveal`)                                                    |
| `src/app/globals.css`                                      | Modify | Keep unified keyframes; align `zed-aura-*` durations to tokens where feasible                                                                           |

## Interfaces / Contracts

```javascript
// Preference API (src/lib/theme/themes.js)
setMotionMode('reduced' | 'normal' | 'amplified'): string;
getStoredMotionMode(): 'reduced' | 'normal' | 'amplified';

// Global context (src/components/ui/motion/MotionModeContext.js)
const MotionModeContext = createContext('normal');
function useMotionMode(): 'reduced' | 'normal' | 'amplified';

// Host-surface safety contract (src/components/ui/system/motion-tokens.js)
export const HOST_MOTION_MODES = {
  TRANSFORM_SAFE: 'transform-safe',
  OPACITY_ONLY: 'opacity-only',
};
```

Direction-aware route variants (forward/back) use `x: ±24 px` / `opacity` with `spring.nav`; in `reduced` mode they collapse to `TRANSITION.reduced` (`opacity`, 50 ms).

## Testing Strategy

| Layer       | What to test                                                                               | Approach                                                    |
| ----------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Unit        | `normalizeMotionMode`, storage helpers, token exports, `useRouteDirection`                 | Jest under `src/lib/theme/__tests__` and motion-token tests |
| Integration | Ajustes change updates provider; route wrapper renders; sidebar transform uses transform   | Render tests with mocked `localStorage`                     |
| E2E         | Motion mode persists across reload; route transitions visible; terminal overlay unaffected | Playwright smoke on `/project/:projectId` routes            |

## Migration / Rollout

No data migration. The new localStorage key defaults to `'normal'`. Rollback: revert Phase A commits and run `localStorage.removeItem('devhub:motion-mode')`.

## Phase B Skeleton

Phase B begins after the user's parallel terminal work lands:

- Retire `forceTerminalViewportRepaint` by emitting a `layout-settled` event from `TerminalTTY.jsx`.
- Confirm `surfaceMotion.js` only re-exports `motion-tokens.js` values; delete any remaining forked values.
- Adopt presets in `workspaceAnimProps.js` and `SharedTerminalSurface.jsx`.
- Formalize `SharedTerminalSurface` warm-cache contract (load/hit/invalidate).
- Replace the tab-reorder hardcoded transition in `TerminalWorkspacesManager.jsx` lines 4804–4861 with `spring.drag`.
- Enforce `HOST_MOTION_MODES.OPACITY_ONLY` for every React subtree that hosts VTE / WebKitGTK.

## Open Questions

- Should the motion-mode control live in the _Apariencia_ tab (with theme/morphology) or the _Preferencias_ tab? Spec says theme/preferences; placing it in _Apariencia_ keeps visual prefs together.
- Is the collapsed sidebar width target still `48 px`? Design assumes the current value.
- Is `useNavigationType` from `react-router-dom` sufficient for route direction, or do we need a full location-key stack?

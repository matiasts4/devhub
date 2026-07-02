# Proposal: Unified Motion Rollout

## Intent

Propagate the approved `motion-lab-showcase` spring preset and motion-mode pattern across the whole DevHub web app, and make the motion mode (`reduced | normal | amplified`) a persistent user preference in Ajustes so every migrated component links to the user's choice from the start.

## Scope

### In Scope

- Ajustes motion-mode preference + localStorage persistence + `MotionProvider` global config.
- `motion-tokens.js` v2: absorb pizarra fork, expose spring presets, remove dead `TRANSITION.spring`.
- Migrate ~10 non-terminal inline transition sites to preset-based, mode-aware motion.
- Add direction-aware route transitions with `AnimatePresence` in `App.js`.
- Replace sidebar width animation with `transform`-based motion.
- CSS keyframe deduplication and token alignment.

### Out of Scope

- New features beyond motion propagation.
- Terminal/pizarra motion changes (coordinated Phase B).
- Performance/caching layer for terminals; browser-history persistence for pizarra.

## Capabilities

### New Capabilities

- `global-motion-preference`: Ajustes UI, persistence, and global `MotionProvider` wiring.
- `motion-token-system-v2`: unified tokens absorbing `surfaceMotion.js` fork and spring presets.
- `route-transitions`: direction-aware `AnimatePresence` route variants.
- `sidebar-transform-motion`: transform-based sidebar expand/collapse.
- `shared-motion-presets`: migrate `TerminalTabsManager`, `CommandBar`, `ZedAmbientOverlay`, `ZedActivityDrawer`, `SmartSuggestionsPanel`, `TerminalStartupRestoreBanner` to presets.
- `css-motion-keyframes`: dedupe and token-align `@keyframes` in `index.css`, `globals.css`, and `zed-aura-*`.

### Modified Capabilities

- `motion-lab-showcase`: consume the global motion preference as its default while preserving the local mode toggle.

## Approach

Phase A (now): build the preference → `MotionProvider` → tokens v2 pipeline, then migrate non-terminal sites, route transitions, sidebar, and CSS. Phase B (coordinated): retire `forceTerminalViewportRepaint`, merge `surfaceMotion.js` fork, adopt presets in `workspaceAnimProps.js` and `SharedTerminalSurface.jsx`, only after the user's parallel terminal work lands.

## Affected Areas

| Area                                                 | Impact   | Description                                           |
| ---------------------------------------------------- | -------- | ----------------------------------------------------- |
| `src/views/Ajustes.jsx`                              | Modified | Add motion-mode control in theme/preferences tab.     |
| `src/components/ui/motion/MotionProvider.jsx`        | Modified | Read stored mode and apply via `MotionConfig`.        |
| `src/components/ui/system/motion-tokens.js`          | Modified | Absorb pizarra fork, add presets, remove dead spring. |
| `src/App.js`                                         | Modified | Route `AnimatePresence`, sidebar transform.           |
| `src/components/TerminalTabsManager.jsx`             | Modified | Preset-based tab indicator.                           |
| `src/components/commandBar/CommandBar.jsx`           | Modified | Preset spring.                                        |
| `src/components/asistente/ZedAmbientOverlay.jsx`     | Modified | Preset spring.                                        |
| `src/components/asistente/ZedActivityDrawer.jsx`     | Modified | Preset-based transitions.                             |
| `src/components/dashboard/SmartSuggestionsPanel.jsx` | Modified | Preset-based transitions.                             |
| `src/components/TerminalStartupRestoreBanner.jsx`    | Modified | Preset-based transitions.                             |
| `src/index.css`, `src/app/globals.css`               | Modified | Deduplicate/token-align keyframes.                    |

## Risks

| Risk                                                          | Likelihood | Mitigation                                                       |
| ------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Route transitions break terminal overlay / scroll restoration | Med        | Keep terminal `absolute` z-stack unchanged; test route switches. |
| Sidebar transform changes focus/selection geometry            | Low        | Mirror existing 256/48px bounds with `translateX`.               |
| Large diff exceeds 800-line review budget                     | High       | Slice by capability or request `size:exception`.                 |
| Terminal Phase B coordination conflict                        | Med        | Gate Phase B behind user handoff; no terminal edits in Phase A.  |

## Rollback Plan

Revert Phase A commits. Restore original `motion-tokens.js`, `MotionProvider.jsx`, and inline transitions. Remove Ajustes control. If persistence has been written, clear the new localStorage key.

## Dependencies

- Approved `motion-lab-showcase` pattern (Engram #63/#72).
- User's parallel terminal work must complete before Phase B.

## Success Criteria

- [ ] Motion mode is selectable in Ajustes and persists across reloads.
- [ ] `MotionProvider` applies the stored mode to all framer-motion consumers.
- [ ] No non-terminal component uses hardcoded spring durations.
- [ ] Sidebar animates via `transform`; route transitions render with `AnimatePresence`.
- [ ] `motion-tokens.js` has no dead `TRANSITION.spring` and pizarra fork is gone from `surfaceMotion.js`.
- [ ] All existing motion-lab-showcase tests still pass.

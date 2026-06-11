# Proposal: zed-ambient-aura

## Intent

The Zed assistant's ambient aura today is a single per-phase opacity gradient
(`executing=0.5`, `responding=0.34`, `open=0.24`) with no tool-type signal and
no CSS-layer safety net for `prefers-reduced-motion`. Two product problems:

1. The aura is too aggressive when executing tools — it competes with the
   terminal for attention, violating the product decision "gradiente ligero;
   no distraer del terminal".
2. The aura cannot distinguish between `terminal`, `browser`, and `file`
   tool executions, so the user gets the same uniform pulse whether Zed is
   opening a tab or running a shell command.

This change lowers the aura's per-phase opacity to a subtle budget and gives
it a discrete per-tool-type tint carried end-to-end from `useZedChat` through
`zedOverlayEvents` and `buildZedAmbientStatus` to `ZedAmbientOverlay`. It also
locks the reduced-motion story in CSS so the pulse is disabled even if a
future edit forgets the JS guard.

## Scope

### In Scope

- Lower aura intensity to spec: `executing ≤ 0.35`, `open ≤ 0.18`, `idle ≤ 0.10`.
- Dispatch a discrete tool-type signal (`'terminal' | 'browser' | 'file' | null`)
  from `useZedChat` to `ZedAmbientOverlay` via a new event constant on
  `zedOverlayEvents.js`.
- Export a pure `extractToolType(message)` from `buildZedAmbientStatus.js` so
  the overlay can read the tool name without re-parsing the human-readable
  status string.
- Add `--accent-terminal`, `--accent-browser`, `--accent-file` CSS variables
  in a new `zed-aura-*` block in `src/app/globals.css` (no theme refactor).
- Add `@media (prefers-reduced-motion: reduce) { .zed-aura-pulse { animation: none; } }`
  to `globals.css` so the CSS layer is the authoritative reduced-motion gate.
- Add keyframes `zed-aura-pulse-terminal`, `zed-aura-pulse-browser`,
  `zed-aura-pulse-file` gated by `@media (prefers-reduced-motion: no-preference)`.
- Mount `<MotionConfig reducedMotion="user">` in `App.js` so the tree-level
  reduced-motion story is consistent (NFR-P06).
- Keep `ZedAuraFrame` z-index `248` and `pointer-events-none` (NFR-P05 — already correct).
- Unit tests in `ZedAmbientOverlay.test.jsx` + a new
  `buildZedAmbientStatus.test.js` covering every tool-type path.

### Out of Scope

- Tool implementation in `src/lib/asistente/tools/**` (Agente 2 owns).
- Refactor of `useZedChat` itself; only the surfaced `toolType` is read.
- New theme system / `applyAccentToDocument` integration.
- `motion-tokens.js` / `surfaceMotion.js` (other motion tokens; the aura
  stays CSS-keyframe driven).
- Swapping the existing `zed-aura-breathe` keyframe — it stays; the new
  per-tool keyframes extend, not replace.
- pizarra animations (`pizarra-motion-polish` change owns those).

## Capabilities

### New Capabilities

- `zed-ambient-aura`: The Zed assistant's ambient overlay visual contract —
  intensity budget by phase, per-tool-type accent, reduced-motion safety
  net, and the end-to-end data path from `useZedChat` to the overlay.
  Becomes `openspec/specs/zed-ambient-aura/spec.md`.

### Modified Capabilities

- `asistente-ui`: Adds the aura tint contract (a few new requirements for
  the overlay's behavior under different tool types and reduced-motion).
  Delta spec at `openspec/changes/zed-ambient-aura/specs/asistente-ui/spec.md`.

## Approach

### End-to-end tool-type data path

```
useZedChat (lastToolType selector)
  └─► zedOverlayEvents.dispatchZedAuraToolType(toolType)
        └─► ZedAmbientOverlay receives toolType via subscription
              └─► buildZedAmbientStatus.extractToolType(message) (pure helper)
                    └─► ZedAuraFrame applies CSS var tint + keyframe class
```

- `useZedChat` exposes a new derived `lastToolType` that finds the most
  recent assistant message with `tool_results` and returns the first
  entry's `tool` string (matching the existing `buildZedAmbientStatus`
  priority: `tool_results` beats `content`).
- `zedOverlayEvents.js` adds `ZED_AURA_TOOL_TYPE_EVENT` and a dispatcher
  helper. The overlay subscribes once on mount and clears on unmount.
- `buildZedAmbientStatus.js` exports `extractToolType(message)` next to
  the existing `buildZedAmbientStatus` so the contract is testable in
  isolation without re-implementing the switch.

### CSS contract

A new `/* zed-aura-*: Zed ambient aura block */` section in
`src/app/globals.css`, scoped to `.zed-aura-root` so the variables do not
leak to `:root` or to the shadcn theme system:

```css
.zed-aura-root {
  --accent-terminal: <value from theme palette>;
  --accent-browser:  <value from theme palette>;
  --accent-file:     <value from theme palette>;
}

@keyframes zed-aura-pulse-terminal { /* ... */ }
@keyframes zed-aura-pulse-browser  { /* ... */ }
@keyframes zed-aura-pulse-file     { /* ... */ }

@media (prefers-reduced-motion: no-preference) {
  .zed-aura-pulse-terminal { animation: zed-aura-pulse-terminal 4s ease-in-out infinite; }
  .zed-aura-pulse-browser  { animation: zed-aura-pulse-browser  4s ease-in-out infinite; }
  .zed-aura-pulse-file     { animation: zed-aura-pulse-file     4s ease-in-out infinite; }
}

@media (prefers-reduced-motion: reduce) {
  .zed-aura-pulse-terminal,
  .zed-aura-pulse-browser,
  .zed-aura-pulse-file { animation: none; }
  .zed-aura-pulse      { animation: none; } /* existing keyframe disabled too */
}
```

Values for the three CSS vars come from the existing palette; the change
adds zero new color tokens.

### Overlay wiring

- `ZedAuraFrame` becomes the only place that reads the tool-type context.
  It picks one of three classes (`zed-aura-pulse-terminal`,
  `zed-aura-pulse-browser`, `zed-aura-pulse-file`) or none when `toolType`
  is `null` / `idle` phase.
- Intensity values move from inline `intensity` constant to a small
  `AURA_INTENSITY` map colocated with `resolveZedAmbientPhase` so the
  phase-to-opacity mapping is one source of truth and unit-testable.
- `MotionConfig` mount in `App.js` is a single-line change at the existing
  provider tree position.

### Test strategy (TDD per `openspec/config.yaml` strict_tdd=true)

- RED: write `ZedAmbientOverlay.test.jsx` scenarios for the new
  per-tool tint, lower intensity, and reduced-motion CSS-class absence.
  Write `buildZedAmbientStatus.test.js` for `extractToolType` covering
  `null`, `tool_results`-only, `content`-only, both-present, and unknown
  tool names.
- GREEN: implement to pass.
- REFACTOR: consolidate the per-phase intensity lookup.

## Affected Areas

| Area                                                        | Impact   | Description                                                                                    |
| ----------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `src/components/asistente/ZedAmbientOverlay.jsx`            | Modified | Lower intensity, read `lastToolType`, apply per-tool class + tint, subscribe to new event      |
| `src/lib/asistente/zedOverlayEvents.js`                     | Modified | Add `ZED_AURA_TOOL_TYPE_EVENT` + `dispatchZedAuraToolType` helper                              |
| `src/lib/asistente/buildZedAmbientStatus.js`                | Modified | Export new pure function `extractToolType(message)`                                            |
| `src/lib/asistente/useZedChat.js`                           | Modified | Add derived `lastToolType` selector (no API break) + dispatch on change                        |
| `src/app/globals.css`                                       | Modified | New `zed-aura-*` block: CSS vars, 3 keyframes, two media queries (~25 lines)                    |
| `src/App.js`                                                | Modified | Mount `<MotionConfig reducedMotion="user">` (one-line import + JSX wrap)                       |
| `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` | Modified | New scenarios for tint, intensity, reduced-motion                                              |
| `src/lib/asistente/__tests__/buildZedAmbientStatus.test.js` | New      | Unit tests for `extractToolType` and existing `buildZedAmbientStatus`                          |
| `openspec/specs/zed-ambient-aura/spec.md`                   | New      | Full spec for the aura visual + data contract                                                  |
| `openspec/changes/zed-ambient-aura/specs/asistente-ui/spec.md` | New   | Delta spec extending `asistente-ui` with aura-tint requirements                                |

## Risks

| Risk                                                                                  | Likelihood | Mitigation                                                                                  |
| ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `lastToolType` selector priority diverges from `resolveZedAmbientPhase`                | Medium     | Pin priority order in a unit test; `executing > responding > open > idle`                   |
| `MotionConfig` in `App.js` regresses existing `useReducedMotion()` consumers           | Low        | `reducedMotion="user"` is the framer-motion default; components that read the hook get the same value as today |
| CSS vars `--accent-terminal` etc. leak to shadcn theme layer                           | Low        | Scoped to `.zed-aura-root` class on the overlay wrapper, NOT on `:root`                     |
| `extractToolType` disagrees with `buildZedAmbientStatus` switch when both content+tools | Medium    | Unit test: `tool_results[0].tool` wins, matching current behavior                           |
| Aura on a 4K monitor too subtle after the intensity drop                                | Low        | Visual review pass; one-line tweak if feedback is negative                                   |
| Parallel change `pizarra-motion-polish` also mounts `MotionConfig` in `App.js`         | Medium     | Coordinate merge; both PRs add the same import + JSX wrap, non-conflicting lines           |

## Rollback Plan

1. Revert `ZedAmbientOverlay.jsx` intensity values to `0.5 / 0.34 / 0.24`
   and remove the per-tool class application.
2. Remove the `ZED_AURA_TOOL_TYPE_EVENT` constant and dispatcher from
   `zedOverlayEvents.js`; remove the `lastToolType` selector from
   `useZedChat.js`.
3. Remove the `extractToolType` export from `buildZedAmbientStatus.js`
   (function is additive — deletion is safe).
4. Remove the `zed-aura-*` block from `globals.css` (the existing
   `zed-aura-breathe` keyframe is unchanged and continues to drive the
   legacy `zed-aura-pulse` class).
5. Remove the `MotionConfig` mount in `App.js` (the `useReducedMotion()`
   hook in the overlay still falls back to manual `matchMedia`).
6. Spec changes are additive; archive rollback is a no-op against
   `openspec/specs/`.

## Dependencies

- `framer-motion` (existing; provides `useReducedMotion` and `MotionConfig`).
- Existing CSS palette in `src/lib/theme/themes.js` (read-only — no new
  tokens introduced).
- Companion change `pizarra-motion-polish` (parallel branch) also touches
  `App.js` for `MotionConfig` and `globals.css` for the reduced-motion
  media query — both edits are non-conflicting, land independently.

## Success Criteria

- [ ] UC-5 satisfied: opening Zed shows a subtle overlay; executing a
      terminal tool yields a calm hue shift toward `--accent-terminal`,
      no aggressive pulse.
- [ ] `prefers-reduced-motion: reduce` → no animation runs on any
      `.zed-aura-pulse*` class, static tint only.
- [ ] Aura overlay does NOT block clicks on the terminal: `z-index: 248`
      (below modals at `1000+` and below the Zed pill at `260`),
      `pointer-events: none` on the wrapper.
- [ ] Aura intensity at the three phase budgets: `executing ≤ 0.35`,
      `open ≤ 0.18`, `idle ≤ 0.10` — pinned by `ZedAmbientOverlay.test.jsx`.
- [ ] Unit tests in `buildZedAmbientStatus.test.js` cover
      `extractToolType` for: `null` input, `tool_results`-only message,
      `content`-only message, both present (tool wins), unknown tool name.
- [ ] `<MotionConfig reducedMotion="user">` mounted once in `App.js`;
      no framer-motion consumer regresses.
- [ ] No new color tokens introduced; values for the three CSS vars come
      from the existing palette.
- [ ] All work in 1 PR, ≤400 LOC net, scoped to the 5–7 files listed in
      Affected Areas.

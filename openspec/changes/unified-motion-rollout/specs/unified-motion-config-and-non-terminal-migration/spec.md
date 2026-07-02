# Delta for unified-motion-config-and-non-terminal-migration

## ADDED Requirements

### Requirement: Motion mode preference in Ajustes

The system MUST expose a motion-mode control in `src/views/Ajustes.jsx` that lets the user select `reduced`, `normal`, or `amplified`. The selection MUST persist via the existing theme-preference utility pattern and default to `normal` when no stored value exists.

#### Scenario: User changes motion mode

- GIVEN the user is on the Ajustes theme/preferences tab
- WHEN the user selects `amplified`
- THEN the setting is written to persistent storage
- AND the active motion mode updates immediately

#### Scenario: Default on first visit

- GIVEN no motion-mode preference has been stored
- WHEN the user opens Ajustes
- THEN the control shows `normal` as the selected value

### Requirement: MotionProvider global integration

`src/components/ui/motion/MotionProvider.jsx` MUST read the stored motion mode on mount and apply it through `MotionConfig reducedMotion`. It MUST also expose the mode through context so all motion consumers read the same value.

#### Scenario: Provider initializes from storage

- GIVEN a stored motion mode of `reduced`
- WHEN the application mounts
- THEN `MotionConfig` propagates reduced motion to Framer Motion descendants
- AND context consumers receive the `reduced` value

### Requirement: motion-tokens.js v2

`src/components/ui/system/motion-tokens.js` MUST absorb the forked duration/easing values from `surfaceMotion.js`, expose the six approved spring presets from `motionPresets.js`, and remove the dead `TRANSITION.spring` entry. `TRANSITION.spring` MUST resolve to a real preset consumed by components.

#### Scenario: Preset consumption

- GIVEN a component imports `TRANSITION.spring`
- WHEN it applies the transition
- THEN the animation uses the `toggle` spring preset values
- AND no runtime warning about undefined transition occurs

### Requirement: Non-terminal site migrations

All listed non-terminal components MUST animate with preset-based, mode-aware transitions instead of hardcoded spring values. The system MUST respect `reduced`, `normal`, and `amplified` modes.

#### Scenario: Sidebar transform motion

- GIVEN the sidebar is in `src/App.js` lines 252-269
- WHEN the user expands or collapses it
- THEN the panel translates on `transform` only
- AND the chosen preset is `spring.nav` or `spring.toggle`

#### Scenario: Direction-aware route transitions

- GIVEN the route outlet in `src/App.js` lines 277-285
- WHEN the user navigates forward or backward
- THEN `AnimatePresence` runs direction-aware enter/exit variants
- AND the terminal container overlay and scroll behavior remain unchanged

#### Scenario: Tab indicator preset

- GIVEN `TerminalTabsManager.jsx` renders the active tab indicator
- WHEN the active tab changes
- THEN the indicator moves with `spring.toggle`

#### Scenario: ZedAmbientOverlay preset

- GIVEN `ZedAmbientOverlay.jsx` runs its ambient loop
- WHEN its motion triggers
- THEN it uses a spring preset instead of the inline `360/30/0.7` values

#### Scenario: CommandBar preset

- GIVEN `CommandBar.jsx` opens or closes
- WHEN the animation runs
- THEN it uses a spring preset instead of the inline `500/30` values

#### Scenario: Drawer, panel, and banner presets

- GIVEN `ZedActivityDrawer`, `SmartSuggestionsPanel`, or `TerminalStartupRestoreBanner` change visibility
- WHEN their entrance or exit animation runs
- THEN each uses a spring preset matching its intent

### Requirement: CSS keyframe deduplication

The system MUST consolidate duplicate `@keyframes` declarations in `src/index.css` and `src/app/globals.css` (including `fadeInUp`, `slideInRight`, `typing-dot`, `skeleton-shimmer`, and `reveal`) into a single source. `zed-aura-*` keyframes SHOULD align with motion-token values where feasible.

#### Scenario: No duplicate keyframes

- GIVEN the CSS bundle is generated
- WHEN duplicate keyframe names are checked
- THEN each name appears in only one file
- AND removing either source file does not break the animation

### Requirement: Reduced-motion compliance

In `reduced` mode, every migrated component MUST collapse its motion to an opacity-only transition of 50 ms or less. Layout properties MUST NOT animate.

#### Scenario: Reduced mode sidebar

- GIVEN motion mode is `reduced`
- WHEN the sidebar toggles
- THEN only opacity changes
- AND the transition completes within 50 ms

### Requirement: Amplified-motion support

In `amplified` mode, every migrated component MUST use the amplified preset family and larger transform displacements than `normal`. Enter animations MUST NOT introduce bounce or elastic easing.

#### Scenario: Amplified route push

- GIVEN motion mode is `amplified`
- WHEN the user navigates forward
- THEN the incoming route uses the amplified `nav` preset
- AND the transform distance is larger than in `normal` mode

## MODIFIED Requirements

### Requirement: Motion demos

The system MUST implement 11 isolated demo cards using the presets and constraints above. The showcase MUST initialize its mode from the global `MotionProvider` while preserving the local mode toggle for side-by-side comparison.
(Previously: demos used only a local `MotionModeContext` without global preference integration.)

#### Scenario: Demo reads global mode by default

- GIVEN the user has set motion mode to `amplified` in Ajustes
- WHEN the user opens `/project/:projectId/motion-lab`
- THEN the showcase starts in `amplified` mode

#### Scenario: Local override remains available

- GIVEN the showcase is open
- WHEN the user changes the mode using the local toggle
- THEN the demos update to the new mode without changing the stored global preference

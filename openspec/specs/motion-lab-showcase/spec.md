# Motion Lab Showcase Specification

## Purpose

Define the `/project/:projectId/motion-lab` showcase page where the team previews, compares, and votes on candidate motion feels using isolated React/DOM demos and shared spring presets.

## Requirements

### Requirement: Project-scoped route

The system MUST add one route `/project/:projectId/motion-lab` inside `src/App.js`, nested under the existing `WorkspaceLayout` child-route convention. This addition MUST NOT alter any other `App.js` behavior.

#### Scenario: Route renders inside workspace

- GIVEN the application is running
- WHEN a user navigates to `/project/:projectId/motion-lab`
- THEN the `MotionLab` view renders without errors inside `WorkspaceLayout`

### Requirement: Showcase page shell

The system MUST provide a `MotionLab` page containing a header, a reduced-motion simulation toggle, and 11 demo cards.

#### Scenario: Page loads with all demos

- GIVEN the user visits the motion lab route
- WHEN the page finishes loading
- THEN the header, reduced-motion toggle, and all 11 demo cards are visible

### Requirement: Demo card contract

Each demo card MUST display a title, a usage note, a live preview, a config readout showing the active spring values, and replay and like/dislike controls.

#### Scenario: Replay re-runs preview

- GIVEN a demo card is visible
- WHEN the user clicks replay
- THEN the preview re-runs and the config readout remains accurate

### Requirement: Spring preset module

The system MUST provide `src/components/ui/motion/motionPresets.js` exporting six presets keyed by intent: `toggle`, `drag`, `sheet`, `open`, `settle`, and `nav`. Each preset MUST export a Framer Motion transition object and a human-readable config string.

#### Scenario: Presets expose transition and label

- GIVEN a demo imports a preset
- WHEN it reads the transition object and config string
- THEN both values reflect the same spring parameters

### Requirement: Motion constraints

All demo animations MUST animate only `transform` and `opacity`. The system MUST NOT animate layout properties such as `width`, `height`, or `top`. Enter animations MUST NOT use `bounce` or `elastic` easings. Exit transitions SHOULD be approximately 75% of the corresponding enter duration.

#### Scenario: Reduced motion collapses transforms

- GIVEN reduced motion is active via toggle or `prefers-reduced-motion`
- WHEN any demo triggers
- THEN the resulting motion is instant or ≤50 ms opacity-only

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

#### Scenario: View-to-view depth transition

- GIVEN the depth demo is visible
- WHEN the user pushes or pops between 3 placeholder views
- THEN the outgoing view fades/scales and the incoming view slides direction-aware with transform+opacity

#### Scenario: Window open

- GIVEN the window-open demo is visible
- WHEN the user triggers open
- THEN the placeholder window scales from 0.9 to 1 with opacity fade-in and spring settle

#### Scenario: Window close

- GIVEN the window-close demo is visible
- WHEN the user triggers close
- THEN the placeholder window scales from 1 to 0.9 with opacity fade-out

#### Scenario: Auto-fit resize settle

- GIVEN the auto-fit demo is visible
- WHEN the user toggles the width
- THEN the resizable element springs to the new width without snapping

#### Scenario: Workspace change

- GIVEN the workspace demo is visible
- WHEN the user swaps between 3 placeholder workspaces
- THEN the outgoing workspace cross-fades with direction-aware transform

#### Scenario: Modal/sheet

- GIVEN the modal/sheet demo is visible
- WHEN the user opens the bottom-sheet variant it slides up with iOS spring
- AND when the user opens the modal variant it scales from center with spring settle

#### Scenario: Tab indicator

- GIVEN the tab indicator demo is visible
- WHEN the user switches between 3 tabs
- THEN the underline slides with spring to the active tab

#### Scenario: Stagger list

- GIVEN the stagger list demo is visible
- WHEN the user triggers the list
- THEN 6 items fade+slide up sequentially

#### Scenario: Side collapse

- GIVEN the side collapse demo is visible
- WHEN the user toggles collapse
- THEN the panel translates on X only; width is not animated

#### Scenario: Drag-settle

- GIVEN the drag demo is visible
- WHEN the user drags the card and releases inside the drop zone
- THEN it snaps to the zone; otherwise it springs back to origin with `dragMomentum=false`

#### Scenario: Generic cross-fade

- GIVEN the cross-fade demo is visible
- WHEN the user swaps between two content blocks
- THEN the outgoing block fades out and the incoming block fades in with opacity

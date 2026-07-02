# Delta for terminal-pizarra-motion-coordination

> **Implementation deferred** — coordinate with the user's parallel terminal work before applying these requirements.

## ADDED Requirements

### Requirement: Retire forceTerminalViewportRepaint

The system MUST remove the approximately 20 `forceTerminalViewportRepaint` calls in `TerminalTTY.jsx` and replace them with a layout-settled event contract that guarantees the terminal surface is ready before dependent code runs.
(Deferred: pending parallel terminal work.)

#### Scenario: Repaint calls removed

- GIVEN `TerminalTTY.jsx` is updated
- WHEN the file is searched for `forceTerminalViewportRepaint`
- THEN zero direct calls remain
- AND terminal content still renders correctly after layout changes

### Requirement: Merge surfaceMotion.js fork into motion-tokens v2

The forked duration/easing values in `surfaceMotion.js` MUST be merged into `motion-tokens.js` v2. The merged values MUST preserve the opacity-only constraint for terminal surfaces.
(Deferred: pending parallel terminal work.)

#### Scenario: Terminal motion uses tokens

- GIVEN a terminal/pizarra animation runs
- WHEN it reads its transition from the token system
- THEN it resolves to a defined preset
- AND it does not reintroduce forked inline values

### Requirement: workspaceAnimProps.js adopts spring presets

`workspaceAnimProps.js` MUST consume the new spring presets from `motion-tokens.js` instead of its current ad-hoc transition definitions.
(Deferred: pending parallel terminal work.)

#### Scenario: Workspace animations reference presets

- GIVEN workspace animations trigger
- WHEN their transition is logged
- THEN it matches one of the approved spring presets

### Requirement: SharedTerminalSurface warm-cache formalization

The warm-cache behavior for `SharedTerminalSurface` MUST be formalized as an explicit contract with clear load, hit, and invalidation semantics.
(Deferred: pending parallel terminal work.)

#### Scenario: Cache hit resolves surface

- GIVEN a cached terminal surface exists
- WHEN the same surface is requested again
- THEN it resolves from the warm cache without recreating the native surface

### Requirement: Tab reorder spring

The tab reorder interaction in `TerminalWorkspacesManager.jsx` lines 4804-4861 MUST use a spring preset instead of a hardcoded transition.
(Deferred: pending parallel terminal work.)

#### Scenario: Tab reorder uses preset

- GIVEN the user reorders terminal tabs
- WHEN the dragged tab settles into its new position
- THEN the motion uses the `spring.drag` or equivalent preset

### Requirement: Native IPC surfaces remain opacity-only

Any React subtree that hosts a native IPC surface such as VTE or WebKitGTK MUST keep all motion effects opacity-only. This requirement is a first-class contract, not a comment, and MUST be enforced by the chosen transition in that subtree.
(Deferred: pending parallel terminal work.)

#### Scenario: Terminal container motion is opacity-only

- GIVEN a terminal surface is mounted inside a React subtree
- WHEN that subtree animates
- THEN the transition animates only opacity
- AND no transform or layout property is animated

#### Scenario: Animated terminal chrome does not violate contract

- GIVEN a terminal-related panel animates
- WHEN the animation targets an ancestor of the native IPC surface
- THEN the surface subtree is excluded from transform/layout motion

# Terminal Renderer Capability Specification

## Purpose

Define the transversal NFR for terminal renderer selection and demotion across the swarm launch and control paths. All terminal usage in `swarmControl`, `TerminalWorkspacesManager`, and the launch orchestrator MUST go through the `terminalRendererCapabilities` module; no consumer code may import `xterm-webgl`, `xterm-canvas2d`, or `fit-addon` directly. Adding a new renderer (e.g. a future native-vte implementation) is a registration concern, not a launch/control path change.

## Requirements

### Requirement: R-CAP-1 — Single Capability Module Is The Only Import Surface

All terminal usage in `src/lib/operations/swarmControl.js`, `src/components/TerminalWorkspacesManager.jsx`, and the launch path under `src/lib/operations/launchOrchestrator.js` MUST import renderer adapters exclusively from `src/lib/terminal/terminalRendererCapabilities.js`. No direct imports of `xterm-webgl`, `xterm-canvas2d`, or `fit-addon` are permitted in those files. CI lint MUST enforce this.

#### Scenario: Direct xterm imports are flagged

- **GIVEN** a PR adds `import { WebglAddon } from 'xterm-addon-webgl'` to `swarmControl.js`
- **WHEN** CI runs the renderer-capability lint
- **THEN** the lint fails
- **AND** the PR cannot merge until the import is replaced with a call into `terminalRendererCapabilities`

#### Scenario: Indirect access through the module works

- **GIVEN** `swarmControl.js` calls `terminalRendererCapabilities.getAddon('webgl')`
- **WHEN** the launch path mounts a panel
- **THEN** the WebGL addon is provided by the capability module
- **AND** `swarmControl.js` does not import any xterm addon directly

### Requirement: R-CAP-2 — Adding a New Renderer Requires Zero Launch/Control Changes

Registering a new renderer adapter (e.g. a future `native-vte` adapter) MUST be a single registration call in `terminalRendererCapabilities`. The launch and control paths MUST continue to function unchanged.

#### Scenario: Register a native-vte adapter

- **GIVEN** a new `native-vte` adapter is implemented as an adapter module
- **WHEN** `terminalRendererCapabilities.register('native-vte', nativeVteAdapter)` is called once at module init
- **THEN** `swarmControl.js` and the launch path mount with the new renderer when requested
- **AND** no file under `src/lib/operations/` or `src/components/TerminalWorkspacesManager.jsx` is modified

### Requirement: R-CAP-3 — Renderer Demotion Is A State Transition

Demotion from a higher-tier renderer to a lower-tier renderer (e.g. `webgl → canvas2d → dom`) MUST be a state diff: the existing `Terminal` instance and its scrollback are preserved. Demotion MUST NOT remount the panel.

#### Scenario: webgl to canvas2d is a state diff

- **GIVEN** a panel is mounted with `webgl` and has 1500 lines of scrollback
- **WHEN** the capability module emits a demotion event to `canvas2d`
- **THEN** the panel's `Terminal` instance is reused
- **AND** the 1500 lines of scrollback remain visible
- **AND** the WebGL addon is detached, the Canvas2D addon is attached in the same tick

#### Scenario: Demotion is observable in launch telemetry

- **GIVEN** a demotion event fires
- **WHEN** the launch telemetry recorder observes it
- **THEN** a `renderer_demoted` event is emitted with `from`, `to`, and `panelId`
- **AND** the launch JSON in the evidence tarball includes the demotion record

### Requirement: R-CAP-4 — Capability Detection Runs Once Per Mount

Renderer capability detection (the probe that checks WebGL availability, Canvas2D context creation, DOM constraints) MUST run once per launch mount, not per pane. The probe result MUST be shared across all 5 panes.

#### Scenario: Capability probe result is shared

- **GIVEN** the launch orchestrator initiates a 5-pane mount
- **WHEN** the first pane requests capability information
- **THEN** the probe runs once
- **AND** the result is cached for the launch's lifetime
- **AND** the 4 subsequent panes read the cached result without re-probing

#### Scenario: Probe result is invalidated on context loss

- **GIVEN** a WebGL context loss forces a downgrade
- **WHEN** the capability module re-evaluates
- **THEN** the probe is allowed to run again for the lower-tier renderer
- **AND** the result is cached for the remainder of the launch

## Out of Scope

- Default renderer choice for fresh users (owned by `terminal-renderer-default`).
- Session-restore semantics for renderer preferences.
- The 48-file `WIP: pre-sdd-batch 2026-06-08` files; this change defines the contract, the WIP batch implements `terminalRendererCapabilities.js` itself.
- Native-vte implementation; only the registration contract is defined.

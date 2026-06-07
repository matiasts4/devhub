# Spec: terminal-renderer-default

> **Source of truth**: promoted from `openspec/changes/terminal-renderer-default-xterm-webgl/specs/terminal-renderer-default/spec.md` on 2026-06-07 (archive of `terminal-renderer-default-xterm-webgl` change).
> **Status**: active. Owned by DevHub terminal team.
> **Origin**: xterm-webgl default terminal renderer (single PR, `size:exception` approved).
> **Stem rationale**: The previous global default was `vte-experimental` (Linux-only native VTE widget). `xterm-webgl` is a WebGL-accelerated renderer that ships everywhere and is already wired in via the `INHERIT_MODE` plumbing. This spec documents the new global default, the soft roll-out policy, the pizarra preset pin, the session-restore contract, and the Settings UI surface. Static-capability-map and `resolveRendererSelection` antipattern behavior lives in `terminal-renderer-selection` (delta, archived; not yet promoted to canonical — see archive report carried-forward follow-up).

## Purpose

Define the global default terminal renderer for DevHub and the soft roll-out policy that respects explicit user choice. `xterm-webgl` becomes the default for fresh users, while existing users that previously opted into `vte-experimental` keep that choice. Workspace panels, command-bar spawns, swarm agent terminals, pizarra presets, and session restore all converge on this default through the `INHERIT_MODE` plumbing.

## Requirements

### Requirement: TRD-1 — Workspace and Command-Bar Default Renderer

The system MUST default new workspace terminal panels and command-bar-spawned terminals to `xterm-webgl` whenever no per-panel stored preference exists. This applies uniformly to panel creation, command-bar `terminalRun` spawn, pizarra card mount, and swarm agent terminal spawn.

#### Scenario: TRD-S1 — Fresh user opens workspace and creates a panel

- GIVEN a fresh user with no `devhub_terminal_renderer_default_mode` entry in localStorage
- WHEN a workspace is opened and a new terminal panel is created
- THEN the default `requestedRendererMode` for that panel is `'xterm-webgl'`

#### Scenario: TRD-S2 — Command bar spawns a new terminal

- GIVEN the user opens the command bar
- WHEN the `terminalRun` action creates a new TerminalTTY
- THEN the spawn call carries `requestedRendererMode: 'xterm-webgl'`

#### Scenario: TRD-S3 — Pizarra card mount

- GIVEN a new terminal card is added in pizarra mode
- WHEN the card is mounted
- THEN the default `requestedRendererMode` for the card is `'xterm-webgl'`

#### Scenario: TRD-S4 — Swarm agent terminal spawn

- GIVEN a swarm agent spawns a per-agent terminal
- WHEN the panel is created
- THEN the default `requestedRendererMode` is `'xterm-webgl'`

### Requirement: TRD-2 — Pizarra Preset Renderer Pin

The system MUST make pizarra presets (`dev-split`, `dev-trio`, `dual-browser`) pin `requestedRendererMode: 'xterm-webgl'` for every terminal surface they register, so the preset is the source of truth for the renderer of surfaces it creates.

#### Scenario: TRD-S5 — dev-split / dev-trio / dual-browser presets pin the renderer

- GIVEN a pizarra preset is applied (`dev-split`, `dev-trio`, or `dual-browser`)
- WHEN the preset's `registry.addSurface` calls run
- THEN every terminal surface created by the preset carries `requestedRendererMode: 'xterm-webgl'`

### Requirement: TRD-3 — Session Restore Respects Stored Preference

The system MUST preserve a stored per-panel or per-user renderer preference across session restore. Restored panels MUST keep the renderer that was previously stored; new panels created during restore MUST inherit `'xterm-webgl'` only when no per-panel value is stored.

#### Scenario: TRD-S6 — Stored `vte-experimental` preference is preserved

- GIVEN a session with `devhub_terminal_renderer_default_mode = 'vte-experimental'` stored
- WHEN the restore path hydrates panels
- THEN the stored value is respected and not overwritten
- AND no migration code rewrites the stored mode on first load

#### Scenario: TRD-S7 — New panels during restore inherit the new default

- GIVEN a restore path that creates new panels without a per-panel stored value
- WHEN the new panels are mounted
- THEN each new panel uses `requestedRendererMode: 'xterm-webgl'`

### Requirement: TRD-4 — Settings UI Surfaces the New Default

The system MUST surface `xterm-webgl` as the pre-selected option in Settings → Appearance → Terminal renderer, and MUST update the subtitle copy to reference the WebGL renderer. Both `vte-experimental` and `xterm` MUST remain selectable for explicit opt-in.

#### Scenario: TRD-S8 — Appearance page pre-selects the new default

- GIVEN the user opens Settings → Appearance
- WHEN the renderer default selector renders
- THEN `'xterm-webgl'` is the pre-selected option
- AND `'vte-experimental'` and `'xterm'` remain available as explicit opt-ins

#### Scenario: TRD-S9 — Subtitle copy references the WebGL renderer

- GIVEN the Appearance page is open
- WHEN the renderer selector renders
- THEN the subtitle copy references the WebGL renderer (and not GTK/VTE) as the default

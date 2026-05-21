# Terminal Renderer Selection Specification

## Purpose

Define per-panel renderer selection for TERM-04 multi-panel GTK/VTE behavior.

## Requirements

### Requirement: Renderer Resolution Is Independent Per Panel

The system MUST resolve requested and effective renderer per panel, not per active workspace. Selecting `vte-experimental` for one panel MUST NOT demote or hide a healthy sibling panel that already resolved effectively to `vte-experimental`.

#### Scenario: Selection on one panel does not evict another

- GIVEN one visible split panel is already rendering GTK/VTE
- WHEN another visible panel requests `vte-experimental`
- THEN effective renderer resolution runs for the second panel independently
- AND the first panel remains rendered if healthy

### Requirement: Unsupported Hosts Stay on Xterm Without Breaking Layout

On non-Linux platforms, outside Tauri/native shells, or when native readiness is unavailable, the system MUST keep `vte-experimental` only as requested state and MUST set effective renderer to `xterm` for that panel.

#### Scenario: Non-Linux or non-Tauri panel falls back deterministically

- GIVEN a panel requests `vte-experimental`
- WHEN the host is non-Linux, non-Tauri, or lacks native readiness
- THEN that panel's effective renderer becomes `xterm`
- AND other visible panels keep their current effective renderers

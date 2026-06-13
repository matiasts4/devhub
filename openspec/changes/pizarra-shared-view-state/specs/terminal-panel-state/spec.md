# Delta for terminal-panel-state

## ADDED Requirements

### Requirement: TPS-5 — Shared Dock State with Surface Registry

The terminal panel state SHALL include a `sharedDockState` slice that contains the surface registry, the focused surface id, the `maximizedView` value, and per-surface descriptors for both workspace and pizarra modes. The shape SHALL be:

```
sharedDockState = {
  surfaces: Record<surfaceId, SurfaceDescriptor>,
  focusedSurfaceId: string | null,
  maximizedView: 'workspace' | 'pizarra'
}

SurfaceDescriptor = {
  id: string,
  type: 'terminal' | 'browser',
  title: string,
  position: { x: number, y: number },
  size: { width: number, height: number },
  nativePanelId: string | null,
  ownerMode: 'workspace' | 'pizarra' | 'both'
}
```

`sharedDockState` SHALL be the single source of truth for both the workspace right-dock chrome and the pizarra canvas surface list.

#### Scenario: sharedDockState stores a terminal surface

- GIVEN a terminal is spawned in workspace mode with `surfaceId = 'term-1'`
- WHEN the surface is registered
- THEN `sharedDockState.surfaces['term-1']` SHALL be a `SurfaceDescriptor` with `type: 'terminal'`
- AND `ownerMode` SHALL be `'workspace'` (or `'both'` if also visible from pizarra)
- AND `nativePanelId` SHALL match the XTerm DOM `id` and the WebSocket `sessionId` query value

#### Scenario: sharedDockState stores a browser surface with tabs

- GIVEN a browser surface is registered with 3 tabs and `t2` active
- WHEN the surface is registered
- THEN `sharedDockState.surfaces['b1']` SHALL be a `SurfaceDescriptor` with `type: 'browser'`
- AND the tab list (per `pizarra-browser-tabs`) SHALL be reachable through the surface descriptor or a sibling store
- AND `focusedSurfaceId` SHALL reflect whichever surface the user last focused

#### Scenario: maximizedView is part of sharedDockState

- GIVEN the user toggles to pizarra mode
- WHEN the toggle completes
- THEN `sharedDockState.maximizedView` SHALL be `'pizarra'`
- AND a workspace right-dock consumer reading `sharedDockState` SHALL observe the new value
- AND a pizarra canvas consumer reading `sharedDockState` SHALL observe the new value

---

### Requirement: TPS-6 — Cross-Mode Sharing via SharedSurfacesProvider

Terminal panel state SHALL be shared between workspace and pizarra modes via the `SharedSurfacesProvider` defined in `pizarra-shared-surfaces`. The provider SHALL expose `useSharedSurfaces()` and `useSharedDockState()` hooks. Both TWM (workspace right-dock) and `PizarraCanvas` SHALL consume the same hooks so the two modes observe the same state.

#### Scenario: Workspace and pizarra see the same surfaces

- GIVEN `sharedDockState` has 3 surfaces `[s1, s2, s3]`
- WHEN both TWM and PizarraCanvas render
- THEN the right-dock chrome SHALL render entries for `s1`, `s2`, `s3`
- AND the pizarra canvas surface list SHALL render the same 3 surfaces in the same order
- AND both views SHALL reflect `focusedSurfaceId` identically

#### Scenario: Adding a surface in workspace appears in pizarra

- GIVEN a user spawns a new terminal in workspace mode with `surfaceId = 'term-new'`
- WHEN the surface is registered with the SharedSurfacesProvider
- THEN `sharedDockState.surfaces['term-new']` SHALL be set
- AND the pizarra canvas SHALL observe the new surface via `useSharedDockState()`
- AND pizarra MAY render a `CanvasTerminal` for `term-new` (or wait for a `requestSurfaceUpdate` intent from pizarra)

#### Scenario: Closing a surface in pizarra removes it from workspace

- GIVEN a terminal `term-1` is shared with `ownerMode: 'both'`
- WHEN the user closes `term-1` from pizarra mode
- THEN `releaseSurface('term-1', { keepAlive: false })` SHALL be called
- AND `sharedDockState.surfaces['term-1']` SHALL be removed
- AND the workspace right-dock entry for `term-1` SHALL also be removed

---

### Requirement: TPS-7 — Backward Compatibility with TPS-1 Suspended State

The suspended connection state introduced in TPS-1 SHALL continue to work after the shared model is adopted. A suspended surface SHALL be visible in `sharedDockState` with `ownerMode` reflecting where the user last saw it, and `connectionState === 'suspended'` SHALL be preserved on the surface descriptor (or reachable through the same hook).

#### Scenario: Suspended terminal is visible in sharedDockState

- GIVEN a terminal `term-1` with `restorePolicy: 'manual'` and `connectionState === 'suspended'`
- WHEN the user toggles modes
- THEN the surface SHALL remain in `sharedDockState.surfaces`
- AND the suspended placeholder SHALL render in BOTH workspace and pizarra
- AND no WebSocket connection SHALL be initiated in either mode

#### Scenario: Revive in one mode is observable in the other

- GIVEN a suspended terminal `term-1` is visible in both modes
- WHEN the user clicks "Continuar" in workspace mode (TPS-3 stub OR a later full revive)
- THEN the connection state transition SHALL be reflected in `sharedDockState`
- AND the pizarra placeholder SHALL update to reflect the new connection state

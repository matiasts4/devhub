# Pizarra Shared Surfaces Specification

## Purpose

Define the shared terminal and browser surface lifecycle that allows a single running XTerm session, WebSocket connection, and browser tab list to be visible from both the workspace right-dock and the pizarra canvas without being torn down on mode toggles. Every surface is a singleton identified by an explicit `surfaceId`, owned by a root `SharedSurfacesProvider`, and attached to React trees via `SurfacePortal`. Closing a surface removes it from both modes; toggling modes never unmounts the surface.

This spec is the foundational contract for `pizarra-browser-tabs` (which attaches tab state to a browser surface) and `pizarra-mode-transition` (which animates the chrome around the surfaces without disturbing the surfaces themselves).

---

## Requirements

### Requirement: SharedSurfacesProvider Lifecycle Owner

The system SHALL mount a `SharedSurfacesProvider` once at the workspace root. The provider SHALL own the lifecycle of every terminal and browser surface in the workspace and pizarra modes. A surface SHALL be registered with the provider when its underlying XTerm/WebView/WS is constructed and SHALL be released only when the user explicitly closes it, or when the workspace unmounts entirely.

#### Scenario: Provider registers a new terminal surface

- GIVEN a `SharedSurfacesProvider` is mounted at the workspace root
- WHEN a terminal is spawned and calls `registerSurface({ type: 'terminal', id: 'term-1' })`
- THEN the provider SHALL store the descriptor keyed by `surfaceId = 'term-1'`
- AND the descriptor SHALL include `{ id, type, ownerHandle, createdAt, refCount }`

#### Scenario: Provider exposes a release API that keeps the surface alive

- GIVEN a terminal surface `term-1` is registered and a consumer (workspace right-dock) is unmounting
- WHEN the consumer calls `releaseSurface('term-1', { keepAlive: true })`
- THEN the provider SHALL decrement the refcount for `term-1`
- AND if the refcount is still > 0, the provider SHALL NOT dispose the XTerm or close the WebSocket
- AND the surface SHALL remain available to other consumers (e.g. pizarra)

#### Scenario: Provider exposes a release API that disposes on close

- GIVEN a terminal surface `term-1` is registered and the user clicks the close button
- WHEN the close handler calls `releaseSurface('term-1', { keepAlive: false })`
- THEN the provider SHALL dispose the XTerm instance
- AND the provider SHALL close the WebSocket gracefully
- AND the surface SHALL be removed from the descriptor map

---

### Requirement: SurfacePortal Attachment

The system SHALL provide a `SurfacePortal` component that renders the live XTerm/WebView for a given `surfaceId` via React portal. Multiple `SurfacePortal` instances SHALL be able to attach to the same `surfaceId` simultaneously; the live surface renders once and is mirrored into every portal host.

#### Scenario: Two portals render the same terminal

- GIVEN a terminal surface `term-1` is registered
- WHEN `<SurfacePortal surfaceId="term-1" hostId="workspace-dock" />` mounts
- AND `<SurfacePortal surfaceId="term-1" hostId="pizarra-canvas" />` mounts
- THEN both hosts SHALL contain the same XTerm DOM tree (same scrollback, same cursor)
- AND the WebSocket connection count SHALL be exactly 1

#### Scenario: Portal without a registered surface renders nothing

- GIVEN no surface with `surfaceId = 'term-missing'` is registered
- WHEN `<SurfacePortal surfaceId="term-missing" hostId="..." />` mounts
- THEN the host SHALL render an empty container (no crash, no fallback content required)
- AND no WebSocket connection SHALL be initiated

---

### Requirement: Stable Surface Identity

The system SHALL mint a `panelId` (used as the terminal `surfaceId`) exactly once per terminal, and the same `panelId` SHALL be reused by every system that needs to reference that terminal: the TerminalTTY WebSocket connection (as `sessionId` query parameter), the native VTE open request (as `panelId`), the bridge registry, and the XTerm DOM `id` attribute.

#### Scenario: All four references use the same panelId

- GIVEN a terminal is spawned and the provider mints `panelId = 'term-abc'`
- WHEN the surface is fully wired
- THEN the WebSocket URL SHALL include `sessionId=term-abc`
- AND the native VTE open IPC SHALL pass `panelId: 'term-abc'`
- AND the bridge registry entry SHALL be keyed by `term-abc`
- AND the XTerm root DOM node SHALL have `id="term-abc"`

#### Scenario: Reopening the same PTY restores the panelId

- GIVEN a user closes a terminal with `panelId = 'term-abc'` and later reopens the same session
- WHEN the new terminal is initialized
- THEN the same `panelId = 'term-abc'` SHALL be minted
- AND the scrollback from the prior session SHALL be restored to the XTerm buffer

---

### Requirement: Mode Toggle Does Not Unmount Surfaces

Toggling `maximizedView` between `workspace` and `pizarra` SHALL NOT cause a registered surface to be unmounted, disposed, or have its WebSocket closed. The surface SHALL remain live for the duration of the toggle animation and SHALL be reattached to the opposite mode's host without reconnecting.

#### Scenario: Workspace to pizarra toggle preserves terminal session

- GIVEN a terminal surface `term-1` is mounted in the workspace right-dock
- AND the WebSocket is open and XTerm scrollback exists
- WHEN the user toggles `maximizedView` from `workspace` to `pizarra`
- THEN the TerminalTTY component instance SHALL be moved, not recreated
- AND the WebSocket SHALL remain open
- AND the XTerm buffer SHALL remain intact (cursor position, scroll position, scrollback bytes)
- AND a pizarra-mode portal SHALL now host the same surface

#### Scenario: Pizarra to workspace toggle preserves browser session

- GIVEN a browser surface with 3 tabs is mounted on the pizarra canvas
- AND the active tab is at `https://app.example.com/dashboard`
- WHEN the user toggles `maximizedView` from `pizarra` to `workspace`
- THEN the browser tab list SHALL appear in the right-dock with the same 3 tabs in the same order
- AND the active tab SHALL still be `dashboard` with no reload
- AND the iframe / webview URL SHALL remain `https://app.example.com/dashboard`

---

### Requirement: Cross-Mode Close Semantics

Closing a surface in one mode SHALL remove it from BOTH modes. Closing a surface in either mode SHALL trigger the same dispose path: WebSocket close, XTerm dispose, registry deregistration, descriptor removal.

#### Scenario: Close from workspace removes from pizarra

- GIVEN a terminal surface `term-1` is registered and visible in both workspace and pizarra hosts
- WHEN the user clicks the close button in the workspace right-dock
- THEN the surface SHALL be released with `keepAlive: false`
- AND the pizarra portal host for `term-1` SHALL unmount
- AND the provider descriptor map SHALL no longer contain `term-1`

#### Scenario: Close from pizarra removes from workspace

- GIVEN a browser surface with 2 tabs is registered and visible in both modes
- WHEN the user closes the last tab from the pizarra-mode tab strip
- THEN the surface SHALL be released with `keepAlive: false`
- AND the workspace right-dock entry for that surface SHALL also disappear
- AND the registry SHALL deregister the surface

---

### Requirement: Refresh Restores Scrollback

When the same PTY session is reopened (e.g. after a page refresh, or after `term-1` is closed and re-spawned for the same shell), the XTerm scrollback from the prior session SHALL be restored into the new XTerm buffer before the WebSocket resumes streaming.

#### Scenario: Page refresh restores scrollback

- GIVEN a terminal `term-abc` was open with 5000 lines of scrollback
- WHEN the user refreshes the page and the same PTY session is restored
- THEN the new XTerm buffer SHALL contain the 5000 lines of prior scrollback
- AND the cursor position SHALL be the same as before the refresh
- AND no visible re-render flash SHALL occur during the restore

---

### Requirement: Bidirectional SharedSurfaceRegistry

The system SHALL provide a `SharedSurfaceRegistry` that pizarra and TWM can both publish to and both subscribe from. Pizarra SHALL publish when a `CanvasTerminal` is dropped on the canvas (so TWM can offer a dock entry to focus it). TWM SHALL publish when a dock entry is removed (so pizarra can clean up the canvas surface). The registry SHALL persist its map to `devhub_pizarra_surfaces_{projectId}_{workspaceId}` in localStorage.

#### Scenario: Pizarra publish makes surface focusable from dock

- GIVEN a `CanvasTerminal` is dropped on the canvas with `surfaceId = 'term-canvas-7'`
- WHEN the registry `register('term-canvas-7', { type: 'terminal', ownerMode: 'pizarra' })` call fires
- THEN TWM's right-dock SHALL render a dock entry for `term-canvas-7`
- AND clicking the entry SHALL focus the surface in pizarra

#### Scenario: Dock removal cleans up canvas surface

- GIVEN a surface `term-canvas-7` is registered with `ownerMode: 'pizarra'`
- WHEN TWM removes the dock entry and calls `registry.unregister('term-canvas-7')`
- THEN the pizarra canvas SHALL receive a deregistration event
- AND the corresponding `CanvasTerminal` SHALL unmount cleanly

#### Scenario: LocalStorage persistence survives refresh

- GIVEN the registry has 3 surfaces written to `devhub_pizarra_surfaces_{pid}_{wid}`
- WHEN the user refreshes the page
- THEN on next mount, the registry SHALL re-hydrate the same 3 surface entries
- AND any `useSharedDockState` consumer SHALL observe them as if they had never been lost

---

### Requirement: Single-Writer Conflict Resolution

When two consumers race to write the same `surfaceId` entry, the workspace SHALL be the single writer of record. Pizarra SHALL publish intents via `requestSurfaceUpdate` rather than direct writes; the workspace-side handler SHALL apply last-write-wins keyed by `surfaceId + updatedAt` to merge disjoint writes.

#### Scenario: Pizarra intent is applied by workspace writer

- GIVEN a surface `term-1` is registered
- WHEN pizarra calls `requestSurfaceUpdate('term-1', { focused: true })`
- AND workspace writes `{ position: { x: 100, y: 200 }, updatedAt: T1 }` immediately after
- THEN the final descriptor SHALL contain BOTH `focused: true` AND `position: { x: 100, y: 200 }`
- AND no descriptor fields SHALL be lost

#### Scenario: Stale write is rejected

- GIVEN the current descriptor has `updatedAt: T2`
- WHEN a stale write arrives with `updatedAt: T1` (T1 < T2)
- THEN the registry SHALL reject the stale write
- AND emit a `surfaceWriteRejected` event with the stale and current timestamps

---

## Acceptance Summary

| Requirement                            | Covered | Scenario Count |
| -------------------------------------- | ------- | -------------- |
| SharedSurfacesProvider Lifecycle Owner | Yes     | 3              |
| SurfacePortal Attachment               | Yes     | 2              |
| Stable Surface Identity                | Yes     | 2              |
| Mode Toggle Does Not Unmount Surfaces  | Yes     | 2              |
| Cross-Mode Close Semantics             | Yes     | 2              |
| Refresh Restores Scrollback            | Yes     | 1              |
| Bidirectional SharedSurfaceRegistry    | Yes     | 3              |
| Single-Writer Conflict Resolution      | Yes     | 2              |

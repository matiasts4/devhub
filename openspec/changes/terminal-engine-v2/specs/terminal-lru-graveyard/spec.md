# Delta for terminal-lru-graveyard

## ADDED Requirements

### Requirement: Hidden surface registry

The system SHALL maintain a global hidden surface registry (graveyard) for v2 xterm instances that are unmounted but still associated with a live PTY.

#### Scenario: Panel is hidden

- GIVEN a v2 panel is hidden by a workspace or window switch
- WHEN the React component unmounts
- THEN the terminal surface MUST move to the graveyard
- AND MUST remain eligible for rehydration

#### Scenario: Hidden panel is reshown

- GIVEN a v2 surface is in the graveyard
- WHEN the panel remounts
- THEN the system MUST restore the surface from the graveyard
- AND MUST resume the subscription without creating a new xterm instance

### Requirement: Destroy-only-on-close

Closing a panel SHALL move its surface to the graveyard; real disposal SHALL happen only on LRU eviction or explicit destroy.

#### Scenario: User closes a panel

- GIVEN a v2 panel receives a close action
- WHEN the close handler runs
- THEN the surface MUST be stashed in the graveyard
- AND the PTY MUST remain alive until eviction

#### Scenario: LRU evicts oldest hidden panel

- GIVEN the graveyard contains more than 12 hidden surfaces
- WHEN a new surface is added
- THEN the least-recently-used hidden surface MUST be disposed
- AND its PTY MUST be closed

### Requirement: Global LRU cap

The system SHALL enforce a global LRU cap of 12 mounted or graveyarded xterm surfaces for v2 panels.

#### Scenario: Thirteenth panel is hidden

- GIVEN 12 v2 surfaces are already in the graveyard
- WHEN a thirteenth panel is hidden
- THEN the oldest graveyarded surface MUST be evicted
- AND the new surface MUST be added

### Requirement: WebGL context loss fallback

When a v2 panel loses its WebGL context, it SHALL degrade that terminal to the DOM renderer and SHALL NOT attempt to re-attach the WebGL addon to the same surface.

#### Scenario: WebGL context is lost

- GIVEN a v2 panel is using `xterm-webgl`
- WHEN the WebGL context is lost
- THEN the panel MUST switch to the DOM renderer for that surface
- AND MUST NOT recreate the WebGL addon on the same xterm instance

#### Scenario: Context loss during hide

- GIVEN a v2 panel loses WebGL context while in the graveyard
- WHEN it is restored
- THEN it MUST be restored using the DOM renderer
- AND MUST display the rehydrated content correctly

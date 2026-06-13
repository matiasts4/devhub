# Spec Delta: board-browser-pane

> **Baseline**: `openspec/specs/board-browser-pane/spec.md` (promoted from
> `pizarra-ux-overhaul`). No existing requirement is being modified by this
> delta. All new behavior is additive.

## MODIFIED Requirements

(none — the existing requirements for address bar, refresh button, load
state indicator, header micro-states, and right-dock tab strip are
unchanged.)

## ADDED Requirements

### BBP-001: Listener for `devhub:zed-open-url` CustomEvent

`WorkspaceBrowserPane` MUST register a `window`-level listener for the
CustomEvent named `devhub:zed-open-url`. The listener MUST read the
event's `detail` and apply it to the right-dock browser pane state.

The listener MUST be registered on mount and MUST be removed on unmount
(so a re-mount does not leave dangling listeners).

#### Scenario: Listener is registered on mount

- **WHEN** `WorkspaceBrowserPane` mounts
- **THEN** `window.addEventListener('devhub:zed-open-url', handler)` MUST
  have been called
- **AND** `detail` validation MUST reject events whose `url` is missing or
  fails `isSafeHttpUrl`

#### Scenario: Listener is removed on unmount

- **WHEN** `WorkspaceBrowserPane` unmounts
- **THEN** `window.removeEventListener('devhub:zed-open-url', handler)`
  MUST have been called
- **AND** dispatching the event after unmount MUST NOT trigger any state
  change

### BBP-002: Idempotence on `(url, label)`

The listener MUST be idempotent: if the incoming event's `(url, label)`
pair matches the last applied pair, the listener MUST NOT re-create the
browser pane or re-fire `spawnBrowser` / `updateElement`. The last applied
pair MUST be tracked in a `useRef` (or equivalent single-source-of-truth
guard) inside `WorkspaceBrowserPane`.

#### Scenario: Identical URL twice produces a single browser

- **WHEN** a `devhub:zed-open-url` event arrives with
  `{ url: 'https://github.com', label: 'repo' }`
- **AND** a second identical event arrives
- **THEN** the listener MUST call `spawnBrowser` (or `updateElement`) at
  most once
- **AND** the resulting browser pane count MUST be one
- **AND** the second event MUST be a no-op for state changes

#### Scenario: New URL with the same label navigates the existing browser

- **WHEN** a `devhub:zed-open-url` event arrives with
  `{ url: 'https://github.com', label: 'repo' }`
- **AND** a second event arrives with
  `{ url: 'https://gitlab.com', label: 'repo' }`
- **THEN** the listener MUST call `updateElement(id, { url: 'https://gitlab.com' })`
  on the existing browser shape with the same label
- **AND** the listener MUST NOT call `spawnBrowser`

### BBP-003: Spawn vs Update Decision

When the listener processes a new event:

- If a browser shape with the same `label` already exists, the listener
  MUST call `updateElement(id, { url })` to navigate the existing
  browser in place.
- If no browser shape with the same `label` exists, the listener MUST
  call `spawnBrowser({ url, label })` to create a new browser shape.

#### Scenario: No matching label spawns a new browser

- **WHEN** the listener receives an event with a `label` that does not
  match any existing browser shape
- **THEN** `spawnBrowser({ url, label })` MUST be called exactly once
- **AND** no `updateElement` call MUST be made for an existing shape

#### Scenario: Matching label navigates the existing browser

- **WHEN** the listener receives an event whose `label` matches an
  existing browser shape
- **THEN** `updateElement(id, { url })` MUST be called for that shape
- **AND** `spawnBrowser` MUST NOT be called

### BBP-004: Pizarra De-Maximization is Opt-In (parity with terminal)

The listener MUST NOT de-maximize pizarra unless the event's
`detail.focus === true`. Default `detail.focus` MUST be treated as `false`
(no de-maximize, no right-dock tab switch). This mirrors the
`devhub:zed-open-terminal` listener's opt-in semantics.

#### Scenario: Default event leaves pizarra maximized

- **WHEN** a `devhub:zed-open-url` event arrives without a `focus` field
- **THEN** the listener MUST NOT change `rightDockState.maximized`
- **AND** the listener MUST NOT change `rightDockState.maximizedView`

#### Scenario: Explicit focus de-maximizes pizarra

- **WHEN** a `devhub:zed-open-url` event arrives with `detail.focus === true`
- **AND** `maximizedView === 'pizarra'`
- **THEN** the listener MUST call
  `updateRightDockState({ maximized: false, maximizedView: 'browser' })`

## REMOVED Requirements

(none)

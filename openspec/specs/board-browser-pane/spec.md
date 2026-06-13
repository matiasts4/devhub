# Spec: board-browser-pane

> **Source of truth**: promoted from `openspec/changes/pizarra-ux-overhaul/specs/board-browser-pane/spec.md` on 2026-06-01 (archive of pizarra-ux-overhaul Phase 1).
> **Status**: active. Owned by DevHub pizarra team.
> **Origin**: Pizarra UX Overhaul (Phase 1).
> **Move coverage**: Move 4 (browser-pane chrome — refresh, address bar submit, load-state indicator), Move 5 (browser-header hover/active micro-states; right-dock tab strip 1px inner border).
> **Stem rationale**: Distinct from `board-browser-load` (which owns the mount-time / runtime-mode / timeout contract). This spec owns the persistent chrome (URL input, refresh, load-state indicator, header micro-states, right-dock tab strip styling). The tab list / multi-tab browser is explicitly OUT OF SCOPE and deferred to the follow-up `pizarra-browser-tabs` change.

## Purpose

Define the chrome of a pizarra-mounted browser pane so the user can see where they are (URL display), reload the page (refresh button), submit a new URL (address bar), and read the load state at a glance. The pane shares styling with the brutalist right-dock tab strip and the terminal/browser headers so the board reads as one consistent surface.

## Requirements

### Requirement 1: Address bar with explicit submit

The system MUST render a single address bar input on a pizarra-mounted browser shape's header. The address bar MUST display the current `dockState.browserUrl` (or the equivalent shape URL) as its value. The address bar MUST submit on `Enter` (or on blur, whichever the existing `useBrowserPreviewController.handleSubmit` already supports) and MUST route through `normalizeBrowserUrl` + `commitBrowserNavigation` so the URL normalization rules are unchanged from the right-dock path.

The address bar MUST NOT include a tab list or a "+ new tab" affordance. Phase 1 keeps the single-tab model per browser shape.

#### Scenario: Address bar displays the current URL on mount

- GIVEN a pizarra browser shape with `shape.url = 'http://localhost:3100/'`
- WHEN the pane renders
- THEN the address bar input MUST have a `value` attribute equal to `http://localhost:3100/`
- AND the input MUST be visible (not collapsed)

#### Scenario: Enter key submits a new URL

- GIVEN the address bar is focused
- WHEN the user types `http://example.com` and presses Enter
- THEN the pane MUST call `commitBrowserNavigation('http://example.com')` (or the URL the controller normalizes it to)
- AND the iframe `src` MUST update to the new URL

### Requirement 2: Refresh button

The system MUST render a refresh button on the browser pane's header. The refresh button MUST re-apply the iframe `src` (or call the existing browser preview controller's refresh action) when clicked. The refresh button MUST NOT mutate `dockState.browserHistory` directly; it MUST go through the existing history machinery so the back/forward behavior is preserved.

The refresh button SHOULD render a hover state (border-color tint) and an active state (inset border) consistent with the tool-palette micro-states.

#### Scenario: Refresh button reloads the iframe without losing history

- GIVEN the pane is at `http://localhost:3100/` and the user has navigated through 3 URLs
- WHEN the user clicks the refresh button
- THEN the iframe MUST reload to `http://localhost:3100/`
- AND `dockState.browserHistory` MUST remain unchanged (the 3 prior URLs are still in history)

#### Scenario: Refresh button shows the brutalist hover and active states

- GIVEN the refresh button is rendered
- WHEN the user hovers the button
- THEN the button's computed `border-color` MUST change from the default
- AND the button's computed `transform` MUST equal `none`
- AND when the user mousedowns, the button MUST render a 1px inset border

### Requirement 3: Load state indicator

The system MUST render a load-state indicator on the browser pane's header. The indicator MUST show one of three states at any time:

| State     | Visual                                               | When                                                                   |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `idle`    | (no spinner, no error)                               | `dockState.isLoading === false` AND no `BrowserLoadFailed` is rendered |
| `loading` | `RefreshCw` spinner (the existing icon)              | `dockState.isLoading === true`                                         |
| `failed`  | `BrowserLoadFailed` view (from `board-browser-load`) | The failure view is currently rendered                                 |

The indicator MUST be visible in all three states. The spinner MUST spin only during `loading`. The failure view MUST render in the body of the pane (not just the header), per the `board-browser-load` spec.

#### Scenario: Loading state shows a spinner

- GIVEN a navigation is in progress and `dockState.isLoading === true`
- WHEN the header renders
- THEN the indicator MUST contain a `RefreshCw` icon
- AND the icon MUST have an animated class (e.g., `animate-spin` or equivalent)

#### Scenario: Idle state shows no spinner

- GIVEN `dockState.isLoading === false` and no `BrowserLoadFailed` is rendered
- WHEN the header renders
- THEN the indicator MUST NOT contain a `RefreshCw` icon

#### Scenario: Failed state shows the failure view in the pane body

- GIVEN the `BrowserLoadFailed` view is currently rendered (per `board-browser-load`)
- WHEN the pane renders
- THEN the body MUST contain the failure view
- AND the header indicator MUST show a `failed` state (no spinner)

### Requirement 4: Header hover and active micro-states

The system MUST add explicit hover and active micro-states to the browser pane header (the row containing the drag handle, address bar, and refresh button). Hover MUST be a `border-bottom` color tint (no transform). Active (mouse-down on a button in the header) MUST be a 1px inset border on that button.

The system MUST NOT introduce a `transform` on the header (no scale, no translate) so the drag handle stays grabbable.

#### Scenario: Header hover applies a border-bottom tint without transform

- GIVEN the pane is rendered and the cursor is not over the header
- WHEN the user hovers the header
- THEN the header's computed `border-bottom-color` MUST change from the default
- AND the header's computed `transform` MUST equal `none`

#### Scenario: Refresh-button mousedown shows the inset border

- GIVEN the refresh button is rendered
- WHEN the user mousedowns on the refresh button
- THEN the refresh button MUST render a 1px inset border in the accent color
- AND the inset border MUST be removed on mouseup

### Requirement 5: Right-dock tab strip 1px inner border

The system MUST add a 1px inner border to the right-dock tab strip using the existing accent color. The active tab MUST render an inset 1px border that reads at a glance against the inactive tabs. Inactive tabs MUST NOT have the accent border.

The system MUST NOT change the tab strip's height, padding, or font. The change is styling-only.

#### Scenario: Active tab has the 1px accent inner border

- GIVEN the right-dock tab strip is rendered and the `pizarra` tab is active
- WHEN the strip renders
- THEN the `pizarra` tab MUST have a 1px inset border in the accent color
- AND the other tabs (`browser`, `editor`, `swarm`, `zed`) MUST NOT have the accent border

#### Scenario: Inactive tab has no accent border

- GIVEN the right-dock tab strip is rendered and the `pizarra` tab is NOT active
- WHEN the strip renders
- THEN the active tab MUST have the accent border
- AND the `pizarra` tab MUST NOT have the accent border

### Requirement 6: BBP-001 — Listener for `devhub:zed-open-url` CustomEvent

`WorkspaceBrowserPane` MUST register a `window`-level listener for the
CustomEvent named `devhub:zed-open-url`. The listener MUST read the
event's `detail` and apply it to the right-dock browser pane state.

The listener MUST be registered on mount and MUST be removed on unmount
(so a re-mount does not leave dangling listeners).

#### Scenario: Listener is registered on mount

- WHEN `WorkspaceBrowserPane` mounts
- THEN `window.addEventListener('devhub:zed-open-url', handler)` MUST
  have been called
- AND `detail` validation MUST reject events whose `url` is missing or
  fails `isSafeHttpUrl`

#### Scenario: Listener is removed on unmount

- WHEN `WorkspaceBrowserPane` unmounts
- THEN `window.removeEventListener('devhub:zed-open-url', handler)`
  MUST have been called
- AND dispatching the event after unmount MUST NOT trigger any state
  change

### Requirement 7: BBP-002 — Idempotence on `(url, label)`

The listener MUST be idempotent: if the incoming event's `(url, label)`
pair matches the last applied pair, the listener MUST NOT re-create the
browser pane or re-fire `spawnBrowser` / `updateElement`. The last applied
pair MUST be tracked in a `useRef` (or equivalent single-source-of-truth
guard) inside `WorkspaceBrowserPane`.

#### Scenario: Identical URL twice produces a single browser

- WHEN a `devhub:zed-open-url` event arrives with
  `{ url: 'https://github.com', label: 'repo' }`
- AND a second identical event arrives
- THEN the listener MUST call `spawnBrowser` (or `updateElement`) at
  most once
- AND the resulting browser pane count MUST be one
- AND the second event MUST be a no-op for state changes

#### Scenario: New URL with the same label navigates the existing browser

- WHEN a `devhub:zed-open-url` event arrives with
  `{ url: 'https://github.com', label: 'repo' }`
- AND a second event arrives with
  `{ url: 'https://gitlab.com', label: 'repo' }`
- THEN the listener MUST call `updateElement(id, { url: 'https://gitlab.com' })`
  on the existing browser shape with the same label
- AND the listener MUST NOT call `spawnBrowser`

### Requirement 8: BBP-003 — Spawn vs Update Decision

When the listener processes a new event:

- If a browser shape with the same `label` already exists, the listener
  MUST call `updateElement(id, { url })` to navigate the existing
  browser in place.
- If no browser shape with the same `label` exists, the listener MUST
  call `spawnBrowser({ url, label })` to create a new browser shape.

#### Scenario: No matching label spawns a new browser

- WHEN the listener receives an event with a `label` that does not
  match any existing browser shape
- THEN `spawnBrowser({ url, label })` MUST be called exactly once
- AND no `updateElement` call MUST be made for an existing shape

#### Scenario: Matching label navigates the existing browser

- WHEN the listener receives an event whose `label` matches an
  existing browser shape
- THEN `updateElement(id, { url })` MUST be called for that shape
- AND `spawnBrowser` MUST NOT be called

### Requirement 9: BBP-004 — Pizarra De-Maximization is Opt-In (parity with terminal)

The listener MUST NOT de-maximize pizarra unless the event's
`detail.focus === true`. Default `detail.focus` MUST be treated as `false`
(no de-maximize, no right-dock tab switch). This mirrors the
`devhub:zed-open-terminal` listener's opt-in semantics.

#### Scenario: Default event leaves pizarra maximized

- WHEN a `devhub:zed-open-url` event arrives without a `focus` field
- THEN the listener MUST NOT change `rightDockState.maximized`
- AND the listener MUST NOT change `rightDockState.maximizedView`

#### Scenario: Explicit focus de-maximizes pizarra

- WHEN a `devhub:zed-open-url` event arrives with `detail.focus === true`
- AND `maximizedView === 'pizarra'`
- THEN the listener MUST call
  `updateRightDockState({ maximized: false, maximizedView: 'browser' })`

## Non-Goals

- Tab list / multi-tab browser inside a single pane (deferred to `pizarra-browser-tabs`).
- Tab strip inside the pizarra browser pane (the pizarra browser header has a single address bar; tabs are a follow-up).
- A back/forward button on the header (the existing history machinery is unchanged; the back/forward affordance is a separate concern).
- A "pop-out to dedicated window" button (the `handleOpenDedicatedBrowser` flow is unchanged).
- Chromium / CDP / cross-origin support changes.
- Changing the existing `useBrowserPreviewController` URL normalization.

## Test mapping

| Scenario                                                    | Test file                                                                 | Test name                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Address bar displays the current URL on mount               | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `address bar value matches shape.url on mount`                    |
| Enter key submits a new URL                                 | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `Enter in address bar calls commitBrowserNavigation`              |
| Refresh button reloads the iframe without losing history    | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `refresh button reloads iframe and preserves history`             |
| Refresh button shows the brutalist hover and active states  | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `refresh button hover and active states match brutalist style`    |
| Loading state shows a spinner                               | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `header shows RefreshCw spinner when isLoading is true`           |
| Idle state shows no spinner                                 | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `header hides spinner when isLoading is false`                    |
| Failed state shows the failure view in the pane body        | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `BrowserLoadFailed renders in pane body when load fails`          |
| Header hover applies a border-bottom tint without transform | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `header hover changes border-bottom-color without transform`      |
| Refresh-button mousedown shows the inset border             | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`         | `refresh button mousedown renders 1px inset accent border`        |
| Active tab has the 1px accent inner border                  | `src/components/workspace/__tests__/WorkspaceRightDock.test.jsx` (or new) | `active tab in right-dock tab strip has 1px accent inner border`  |
| Inactive tab has no accent border                           | `src/components/workspace/__tests__/WorkspaceRightDock.test.jsx` (or new) | `inactive tabs in right-dock tab strip do not have accent border` |

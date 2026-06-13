# Pizarra Browser Tabs Specification

## Purpose

Define the multi-tab model for a single shared browser surface. A browser surface owns an ordered list of tabs where each tab carries `{ id, url, title, favicon, loadingState, isActive, closeable }`. The same tab list SHALL appear in both workspace right-dock and pizarra canvas mounts of that surface, in the same order, with the same active tab. The user SHALL be able to add, close, reorder, and switch tabs from either mode; tab state SHALL be persisted in `sharedDockState` as the single source of truth for both modes.

---

## Requirements

### Requirement: Tab Data Model

The system SHALL represent a browser tab with the following shape:

| Field          | Type                              | Description                                             |
| -------------- | --------------------------------- | ------------------------------------------------------- |
| `id`           | `string` (UUID)                   | Unique tab identifier                                   |
| `url`          | `string` (URL)                    | Current URL of the tab                                  |
| `title`        | `string`                          | Document title (defaults to URL host while loading)     |
| `favicon`      | `string` (URL or empty)           | Favicon URL                                             |
| `loadingState` | `'idle' \| 'loading' \| 'failed'` | Per-tab load state                                      |
| `isActive`     | `boolean`                         | Exactly one tab per surface SHALL have `isActive: true` |
| `closeable`    | `boolean`                         | If `false`, the close button SHALL NOT render           |

#### Scenario: Tab list shape on a new surface

- GIVEN a fresh browser surface with no tabs
- WHEN the user opens `https://example.com` from the address bar
- THEN the surface's `tabs` array SHALL contain exactly one tab
- AND the single tab SHALL have `isActive: true` and `closeable: true`
- AND `loadingState` SHALL be `'loading'` while the page loads, then `'idle'`

#### Scenario: Title and favicon update as the page loads

- GIVEN a tab is `loading` at `https://example.com/dashboard`
- WHEN the page finishes loading with `<title>Example Dashboard</title>` and a favicon
- THEN the tab's `title` SHALL update to `"Example Dashboard"`
- AND the tab's `favicon` SHALL update to the favicon URL
- AND `loadingState` SHALL transition to `'idle'`

---

### Requirement: Multi-Tab Browser Surface

A browser surface SHALL support 1..N tabs. The pane SHALL render a tab strip plus an active `<webview>`/iframe. The default minimum is 1 tab (an empty surface SHALL auto-spawn an initial blank tab on first focus).

#### Scenario: Surface supports multiple tabs

- GIVEN a browser surface has 3 tabs
- WHEN the user clicks the `+` (new tab) button
- THEN a new tab SHALL be appended to the `tabs` array
- AND the new tab SHALL receive `isActive: true`
- AND the previously active tab SHALL receive `isActive: false`
- AND the address bar SHALL clear to an empty value

#### Scenario: New-tab cap is enforced

- GIVEN a browser surface already has 20 tabs
- WHEN the user clicks the `+` button
- THEN the system SHALL refuse to add a new tab
- AND the `+` button SHALL be disabled
- AND a tooltip SHALL indicate the 20-tab cap

---

### Requirement: Tab Operations

The user SHALL be able to add, close, reorder, and switch tabs. Each operation SHALL mutate the tab list and persist the result to `sharedDockState` so the change is visible in both modes.

#### Scenario: User closes a tab

- GIVEN a surface has 3 tabs `[t1, t2, t3]` with `t2.isActive === true`
- WHEN the user clicks the close button on `t2`
- THEN `t2` SHALL be removed from the `tabs` array
- AND `t3` SHALL become the new active tab (`isActive: true`)
- AND the change SHALL be persisted to `sharedDockState`
- AND both modes SHALL reflect the new state on next render

#### Scenario: User reorders a tab via drag

- GIVEN a surface has tabs `[t1, t2, t3]`
- WHEN the user drags `t1` to the position after `t3`
- THEN the resulting order SHALL be `[t2, t3, t1]`
- AND the active tab SHALL remain the same tab object (not change `isActive` on any tab)
- AND the change SHALL be persisted to `sharedDockState`

#### Scenario: User switches tabs by clicking a tab header

- GIVEN a surface has tabs `[t1, t2, t3]` with `t2.isActive === true`
- WHEN the user clicks the header of `t1`
- THEN `t1.isActive` SHALL become `true`
- AND `t2.isActive` SHALL become `false`
- AND `t3.isActive` SHALL remain `false`
- AND the iframe / webview SHALL navigate to `t1.url` if it differs from current

#### Scenario: Closing the last tab auto-creates a blank tab

- GIVEN a surface has 1 tab (`t1`) and it is active
- WHEN the user closes `t1`
- THEN the surface SHALL auto-spawn a new blank tab
- AND the new tab SHALL be the active tab
- AND the surface SHALL NOT enter an empty/error state

#### Scenario: Non-closeable tab ignores close

- GIVEN a tab has `closeable: false` (e.g. a pinned or system tab)
- WHEN the user attempts to close it
- THEN the close button SHALL NOT render
- AND programmatic close calls SHALL be rejected with `tabNotCloseable`

---

### Requirement: Shared Tab State Across Modes

Tab state for a given browser surface SHALL be persisted in `sharedDockState` and SHALL be the single source of truth for both workspace and pizarra modes. The same tabs SHALL appear in both modes, in the same order, with the same active tab.

#### Scenario: Same tabs visible in both modes

- GIVEN a surface has tabs `[t1, t2, t3]` with `t2.isActive === true` in workspace mode
- WHEN the user toggles to pizarra mode
- THEN the pizarra tab strip SHALL render `[t1, t2, t3]` in the same order
- AND `t2` SHALL still be the active tab
- AND the address bar SHALL show `t2.url`

#### Scenario: Switching active tab in pizarra updates workspace

- GIVEN both modes show the same tab list with `t2.isActive === true`
- WHEN the user clicks `t3` in pizarra mode
- THEN `sharedDockState` SHALL update to set `t3.isActive === true`
- AND the workspace right-dock SHALL re-render with `t3` as the active tab
- AND the workspace iframe / webview SHALL navigate to `t3.url`

#### Scenario: Closing a tab from workspace removes it from pizarra

- GIVEN both modes show tabs `[t1, t2, t3]`
- WHEN the user closes `t1` from the workspace right-dock
- THEN `sharedDockState` SHALL remove `t1`
- AND the pizarra tab strip SHALL re-render as `[t2, t3]`
- AND the active tab SHALL follow the close logic in the Tab Operations requirement

---

### Requirement: Tab Persistence

The tab list SHALL persist to `sharedDockState` in localStorage. On page refresh, the same tab list SHALL be rehydrated with the same order, same active tab, and same URLs.

#### Scenario: Tab list survives refresh

- GIVEN a surface has tabs `[t1, t2, t3]` with `t2.isActive === true`
- WHEN the user refreshes the page
- THEN on next mount, the surface SHALL re-hydrate with `[t1, t2, t3]`
- AND `t2` SHALL still be active
- AND the iframe / webview SHALL navigate to `t2.url` (not to `t1.url` or `t3.url`)

#### Scenario: localStorage quota guard

- GIVEN a single surface is approaching the localStorage quota
- WHEN the user attempts to add a 21st tab
- THEN the system SHALL refuse the add (per the 20-tab cap) AND SHALL NOT write to localStorage
- AND closed tabs older than 7 days SHALL be evicted from the persistence layer

---

### Requirement: Tab Loading States

Each tab SHALL independently track its own `loadingState`. The spinner indicator in the tab header SHALL reflect the active tab's state. Inactive tabs SHALL NOT animate the spinner to reduce visual noise.

#### Scenario: Active tab shows spinner during navigation

- GIVEN the active tab is currently `idle`
- WHEN the user submits a new URL in the address bar
- THEN the active tab's `loadingState` SHALL transition to `'loading'`
- AND the tab header SHALL show a spinning indicator
- AND the pane body's load state indicator SHALL also show the loading state

#### Scenario: Inactive tab does not animate

- GIVEN tab `t2` is active and `t1` is inactive
- WHEN `t1` happens to be loading (e.g. pre-fetch)
- THEN `t1`'s header SHALL display a non-spinning loading dot OR a static `loading` icon
- AND the spinner animation SHALL NOT run for `t1`

#### Scenario: Failed tab shows error indicator

- GIVEN a navigation fails (network error or `BrowserLoadFailed` per `board-browser-load`)
- WHEN the failure is detected
- THEN the tab's `loadingState` SHALL transition to `'failed'`
- AND the tab header SHALL show a failure indicator
- AND clicking the failed tab SHALL surface the `BrowserLoadFailed` view in the pane body

---

## Acceptance Summary

| Requirement                   | Covered | Scenario Count |
| ----------------------------- | ------- | -------------- |
| Tab Data Model                | Yes     | 2              |
| Multi-Tab Browser Surface     | Yes     | 2              |
| Tab Operations                | Yes     | 5              |
| Shared Tab State Across Modes | Yes     | 3              |
| Tab Persistence               | Yes     | 2              |
| Tab Loading States            | Yes     | 3              |

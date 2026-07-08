# Delta for browser-wave-ux

## ADDED Requirements

### Requirement: Pinned home URL (Wave pinnedurl)

The browser dock state SHALL support `browserPinnedUrl` as the home navigation target for the integrated browser.

#### Scenario: Home button

- GIVEN `browserPinnedUrl` is `https://docs.example.com`
- AND current URL differs
- WHEN the user activates Home
- THEN the browser MUST navigate to `browserPinnedUrl`
- AND history MUST record the navigation per existing browser history rules

#### Scenario: Home disabled at pinned URL

- GIVEN current URL equals `browserPinnedUrl`
- WHEN the home control is rendered
- THEN home MUST be disabled or no-op (Wave behavior)

#### Scenario: Default pinned URL

- GIVEN `browserPinnedUrl` is unset
- WHEN home is activated
- THEN the system MUST fall back to the first history entry or configured default browser URL

### Requirement: Single primary toolbar row

The workspace browser pane SHALL expose navigation controls in one primary toolbar row: back, forward, reload, URL entry, home, and external/window actions.

#### Scenario: Dock browser visible

- GIVEN the browser tab is active in the right dock
- WHEN the pane renders
- THEN duplicate Browser/Editor mode switches MUST NOT appear inside the pane body (top workspace toolbar remains source of truth)

### Requirement: Edge-to-edge preview

The preview viewport SHALL maximize content area by omitting decorative inner padding on the iframe path comparable to Wave block `noPadding`.

#### Scenario: iframe preview

- GIVEN effective runtime is iframe
- WHEN content loads successfully
- THEN the iframe MUST fill the viewport shell minus the single toolbar row

### Requirement: Browser favorites strip

The system SHALL allow a configurable list of favorite URLs rendered as a compact strip above or within the browser chrome.

#### Scenario: Add favorite from current URL

- GIVEN the user adds the current URL to favorites
- WHEN favorites are persisted
- THEN a subsequent session MUST show the favorite in the strip

#### Scenario: Favorite click

- GIVEN a favorite exists
- WHEN the user clicks it
- THEN the browser MUST navigate to that URL using the same path as manual URL entry

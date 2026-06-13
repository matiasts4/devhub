# Delta for board-browser-pane

## MODIFIED Requirements

### Requirement: Address bar with explicit submit

The system MUST render a single address bar input on a pizarra-mounted browser shape's header. The address bar MUST display the current `dockState.browserUrl` (or the equivalent shape URL) as its value. The address bar MUST submit on `Enter` (or on blur, whichever the existing `useBrowserPreviewController.handleSubmit` already supports) and MUST route through `normalizeBrowserUrl` + `commitBrowserNavigation` so the URL normalization rules are unchanged from the right-dock path.

The address bar MAY coexist with a tab strip when the surface is in `multiTab` mode; in `single` mode the address bar remains the sole input control. The address bar SHALL always control the active tab, not an arbitrary tab in the list.

(Previously: The address bar MUST NOT include a tab list or a "+ new tab" affordance. Phase 1 keeps the single-tab model per browser shape.)

#### Scenario: Address bar displays the current URL on mount

- GIVEN a pizarra browser shape with `shape.url = 'http://localhost:3100/'`
- WHEN the pane renders
- THEN the address bar input MUST have a `value` attribute equal to `http://localhost:3100/`
- AND the input MUST be visible (not collapsed)

#### Scenario: Enter key submits a new URL

- GIVEN the address bar is focused
- WHEN the user types `http://example.com` and presses Enter
- THEN the pane MUST call `commitBrowserNavigation('http://example.com')` (or the URL the controller normalizes it to)
- AND the iframe `src` of the active tab MUST update to the new URL

#### Scenario: Address bar controls only the active tab in multiTab mode

- GIVEN a browser surface in `multiTab` mode with tabs `[t1, t2, t3]` and `t2.isActive === true`
- WHEN the user types `http://example.com` in the address bar and presses Enter
- THEN the active tab's URL SHALL be updated to `http://example.com`
- AND `t1.url` and `t3.url` SHALL remain unchanged
- AND the address bar value SHALL continue to reflect the active tab

---

## ADDED Requirements

### Requirement: Multi-Tab Browser Pane

The system SHALL allow a browser pane to render a tab strip with add / close / reorder / switch affordances when the surface is in `multiTab` mode. The exact tab data model, operations, and cross-mode persistence behavior SHALL conform to the `pizarra-browser-tabs` specification.

Consumers that do not opt into multi-tab mode SHALL continue to use the single-tab model without visible chrome change; the default SHALL be `single` to preserve backward compatibility with existing non-pizarra consumers.

#### Scenario: multiTab mode renders the tab strip

- GIVEN a browser pane with `tabsMode: 'multi'`
- AND the surface has tabs `[t1, t2, t3]`
- WHEN the pane renders
- THEN a tab strip SHALL render above the iframe
- AND the strip SHALL show `t1`, `t2`, `t3` in order
- AND `t2` SHALL be visually marked as the active tab
- AND a `+` new-tab button SHALL be visible
- AND a close button SHALL be visible on each closeable tab

#### Scenario: single mode hides the tab strip

- GIVEN a browser pane with `tabsMode: 'single'` (default)
- WHEN the pane renders
- THEN the tab strip SHALL NOT render
- AND the `+` button SHALL NOT render
- AND the existing address bar + refresh + load state chrome SHALL be unchanged

#### Scenario: opt-in via tabsMode

- GIVEN a consumer wires `<WorkspaceBrowserPane surfaceId="b1" tabsMode="multi" />`
- WHEN the pane mounts
- THEN the surface SHALL behave as a multi-tab browser per `pizarra-browser-tabs`
- AND omitting the prop SHALL default to `tabsMode: 'single'`

---

## REMOVED Requirements

### Requirement: Tab list / multi-tab browser out of scope

(Reason: Superseded by `pizarra-shared-view-state` and the new `pizarra-browser-tabs` spec. The previous Non-Goals statement that the tab list / multi-tab browser is out of scope is removed; the tab strip and new-tab affordance are now in scope when the surface is in `multiTab` mode. The default for non-pizarra consumers remains `single` to preserve the original chrome contract.)

### Non-Goal: "Tab strip inside the pizarra browser pane"

(Reason: Superseded. The pizarra browser header MAY include a tab strip when the surface is in `multiTab` mode. This is no longer a non-goal.)

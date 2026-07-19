# Capability: electron-native-browser

## Purpose

First-class Windows (and later multi-OS) dock browser using Chromium guests under Electron — not iframe and not Tauri WebView2 HWND thrash.

**Primary implementation:** DOM `<webview>` inside the SPA (`webviewTag: true` on the host SPA view), with a warm guest pool.  
**Compat path:** main-process `WebContentsView` registry remains available for IPC/legacy callers.

## ADDED Requirements

### Requirement: Open and load real sites

The host MUST open a Chromium guest bound to a stable panel/workspace key, load the requested URL, and present it in the dock/space layout.

#### Scenario: Open site that sets X-Frame-Options

- **GIVEN** Electron native browser is available
- **WHEN** the user opens a URL that sends `X-Frame-Options: DENY` (or CSP frame-ancestors none)
- **THEN** the site MUST render inside the Chromium guest
- **AND** MUST NOT rely on an iframe in the SPA for that panel while native mode is active

#### Scenario: Unsupported when not Electron native path

- **GIVEN** the app runs under Tauri on Windows
- **WHEN** `native_browser_probe` is called
- **THEN** behavior remains `unsupported-platform` (existing)
- **AND** this Electron capability MUST NOT claim readiness in that process

### Requirement: Multi-panel / multi-workspace guests

The host MUST track zero or more guests keyed by a stable id (panelId or `browser-${projectId}-${workspaceId}`). Open/acquire is idempotent for the same id. Close/destroy MUST free resources; warm park MUST retain session until explicit close or LRU eviction.

#### Scenario: Two panels

- **GIVEN** panel A and panel B are open with distinct layout regions
- **WHEN** both have loaded URLs
- **THEN** both Chromium guests MUST exist concurrently
- **AND** layout of A MUST NOT force navigation of B

#### Scenario: Close panel

- **GIVEN** panel A is open
- **WHEN** close/destroy is invoked for A
- **THEN** A’s guest MUST be removed from the pool/window
- **AND** subsequent commands for A MUST return `panel-not-found` or equivalent

### Requirement: Resize, focus, visibility

The host MUST apply layout updates, focus the guest when the surface becomes active, and hide/show without destroying session state unless close was requested.

#### Scenario: Resize during dock drag

- **GIVEN** panel A is visible
- **WHEN** rapid resize events arrive
- **THEN** the guest layout MUST converge to the latest rect
- **AND** the host SHOULD avoid navigation thrash

#### Scenario: Hide without close

- **GIVEN** panel A is open
- **WHEN** the workspace/surface becomes inactive
- **THEN** the guest MUST not intercept input
- **AND** reloading the same URL MUST NOT be required to show again

#### Scenario: Workspace switch warm restore

- **GIVEN** panel A loaded URL U and the workspace was switched away and back
- **WHEN** the surface becomes active again with the same URL intent
- **THEN** the host MUST NOT issue a full navigation reload solely due to the switch

### Requirement: Session partitions

Each panel MUST use a session partition (persistent or ephemeral per product rules). Default SHOULD isolate browser dock cookies from the SPA session.

#### Scenario: Partition isolation

- **GIVEN** the SPA is authenticated to app origin A
- **WHEN** the dock browser loads origin B and sets cookies
- **THEN** those cookies MUST NOT be mixed into the SPA partition by default

### Requirement: Events

Main MUST emit navigation, title, favicon, and failure events to the renderer for subscribed panels.

#### Scenario: Load failure

- **GIVEN** a panel loads an invalid URL or network fails
- **WHEN** `did-fail-load` fires
- **THEN** the renderer MUST receive an event with failure detail
- **AND** the panel registry MUST keep the view until the user closes or navigates away

### Requirement: E0 fixed-rect spike

E0 MAY implement a single WebContentsView with fixed or IPC-driven bounds without full multi-panel polish, but MUST prove real-site load on Windows.

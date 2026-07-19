# Capability: desktop-bridge-adapter

## Purpose

Provide a unified desktop API so React/bridges call one adapter that routes to Electron IPC, legacy Tauri invoke, or fail-closed web stubs.

## ADDED Requirements

### Requirement: Runtime detection

The adapter MUST detect runtime in this order of preference for desktop features: Electron preload present → Tauri `__TAURI_INTERNALS__` → web/unavailable.

#### Scenario: Electron preferred when both markers could exist

- **GIVEN** `window.devhubDesktop?.isElectron === true`
- **WHEN** a desktop command is invoked
- **THEN** the adapter MUST use Electron IPC
- **AND** MUST NOT call Tauri `invoke` for that command

#### Scenario: Tauri fallback

- **GIVEN** Electron is not present and `window.__TAURI_INTERNALS__` is present
- **WHEN** a desktop command is invoked
- **THEN** the adapter MUST use existing Tauri invoke paths

#### Scenario: Web fail-closed

- **GIVEN** neither Electron nor Tauri is present
- **WHEN** a native browser or desktop command is invoked
- **THEN** the adapter MUST return a structured failure (e.g. `reason: 'desktop-unavailable'` or existing `tauri-unavailable` shape)
- **AND** MUST NOT throw uncaught exceptions from the bridge layer

### Requirement: Invoke-compatible shapes

For native browser commands, Electron IPC payloads and responses SHOULD match existing `nativeBrowserBridge` request/response fields so call sites (`useNativeBrowserSurface`, controllers) need minimal change.

#### Scenario: Open panel shape parity

- **GIVEN** a caller passes `{ panelId, url, bounds, ... }` as today
- **WHEN** the adapter routes to Electron
- **THEN** main process handlers MUST accept those fields (or a documented thin rename map)
- **AND** the response MUST include success flags consistent with current consumers (`opened`, `reason`, etc.)

### Requirement: Event fan-out

Desktop events that today arrive as Tauri events (`native-browser-event`) MUST be re-emitted as the same DOM custom events (`devhub:native-browser-event`) when running under Electron so existing listeners keep working.

#### Scenario: Navigation event reaches React

- **GIVEN** a WebContentsView finishes loading a URL under Electron
- **WHEN** main emits a navigation event over IPC
- **THEN** the adapter MUST dispatch `devhub:native-browser-event` with a typed payload including `type` and `panelId`

### Requirement: Incremental command coverage

E0 MUST implement adapter stubs for shell detection + native browser subset used by the spike. E1+ MUST extend to clipboard, dialogs, window controls, notifications, and voice without breaking fail-closed web behavior.

#### Scenario: Unimplemented command

- **GIVEN** a command is not yet implemented on Electron
- **WHEN** it is invoked under Electron
- **THEN** the adapter MUST return a structured `reason: 'not-implemented'` (or equivalent)
- **AND** MUST log once for diagnostics

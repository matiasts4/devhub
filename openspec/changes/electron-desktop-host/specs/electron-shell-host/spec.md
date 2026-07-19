# Capability: electron-shell-host

## Purpose

Electron main process, preload, and primary BrowserWindow host DevHub’s UI and lifecycle on Windows (primary) without requiring Tauri.

## ADDED Requirements

### Requirement: Main process cold start

The Electron main process MUST create a single primary `BrowserWindow` that loads either the Next dev URL or the packaged UI origin. The main process MUST NOT enable `nodeIntegration` in the renderer. The main process MUST enable `contextIsolation` and load a dedicated preload script.

#### Scenario: Cold start with dev UI

- **GIVEN** Electron is launched with `DEVHUB_ELECTRON_URL` (or default `http://localhost:3000`) and the Next dev server is reachable
- **WHEN** the app finishes ready
- **THEN** the main window MUST load that URL
- **AND** the window MUST be visible without requiring a second user action

#### Scenario: Cold start without UI server

- **GIVEN** the configured UI URL is unreachable
- **WHEN** the main window load fails
- **THEN** the host MUST show a recoverable error page or log a clear diagnostic
- **AND** the process MUST NOT crash silently

### Requirement: Preload bridge surface

The preload script MUST expose a minimal, allow-listed desktop API on `window.devhubDesktop` (or equivalent) via `contextBridge`. The renderer MUST NOT gain unrestricted Node access.

#### Scenario: Preload exposes allow-listed API

- **GIVEN** the renderer loads inside Electron
- **WHEN** the page inspects `window.devhubDesktop`
- **THEN** it MUST find documented methods (e.g. `invoke`, `on`, `isElectron`)
- **AND** it MUST NOT find `require` or `process` as free Node globals from nodeIntegration

### Requirement: Single-instance and lifecycle (E1+)

The host SHOULD enforce single-instance lock on Windows. On second launch, the existing window SHOULD focus. Tray and quit lifecycle MUST be defined in E1 tasks; E0 MAY omit tray.

#### Scenario: Second instance focuses first (E1)

- **GIVEN** one Electron DevHub instance is running
- **WHEN** the user launches a second instance
- **THEN** the second process MUST exit
- **AND** the first window MUST be shown and focused

### Requirement: Sidecar lifecycle coordination

The main process MUST be able to spawn and track the Node sidecar (or reuse an already-healthy sidecar) so the SPA’s terminal APIs work. E0 MUST at least document and implement a minimal spawn or “external sidecar assumed” mode with clear env vars.

#### Scenario: Terminal path available after host start (E0)

- **GIVEN** Electron host is running and sidecar is up on the expected port
- **WHEN** the user opens Terminales and creates a session
- **THEN** the session MUST connect through existing HTTP/WS APIs (no Tauri PTY required)

### Requirement: Fail-closed outside Electron

When the SPA runs in a normal browser, shell host features MUST NOT throw uncaught errors solely because Electron APIs are missing.

#### Scenario: Web mode without Electron

- **GIVEN** the SPA is opened in Chrome without Electron preload
- **WHEN** shell-detection runs
- **THEN** desktop-only features MUST report unavailable
- **AND** the app MUST remain usable for web-capable routes

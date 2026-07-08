# Delta for workspace-browser-embedding

## ADDED Requirements

### Requirement: iframe-first default runtime

The system SHALL use `iframe` as the default `browserRuntime` for new and sanitized right-dock state on all platforms.

#### Scenario: Fresh workspace dock state

- GIVEN no persisted right-dock state exists
- WHEN the dock state is initialized
- THEN `browserRuntime` MUST be `iframe`
- AND the effective preview MUST render the iframe path

#### Scenario: Windows Tauri desktop

- GIVEN the app runs on Windows inside Tauri
- WHEN the user opens the browser tab
- THEN the system MUST NOT require `native_browser_probe` for default operation
- AND MUST render preview content without `unsupported-platform` blocking the primary path

### Requirement: Native GTK opt-in only

The system SHALL treat `native-gtk` as available only when `NEXT_PUBLIC_BROWSER_NATIVE_GTK` is truthy at build time AND the runtime is Tauri desktop AND platform probe reports ready (Linux).

#### Scenario: Default build without env flag

- GIVEN `NEXT_PUBLIC_BROWSER_NATIVE_GTK` is unset
- WHEN persisted state contains `browserRuntime: native-gtk`
- THEN sanitize MUST coerce to `iframe`
- AND native open/resize hooks MUST NOT run

#### Scenario: Opt-in Linux build

- GIVEN `NEXT_PUBLIC_BROWSER_NATIVE_GTK=1` on Linux Tauri
- AND probe returns ready
- WHEN user selects or persists `native-gtk`
- THEN native overlay MAY be used as today

### Requirement: Pizarra does not auto-upgrade to native

The pizarra browser surface SHALL NOT automatically change `browserRuntime` from `iframe` to `native-gtk` when native probe becomes ready unless native opt-in policy allows native.

#### Scenario: Pizarra card mount

- GIVEN default build (no native opt-in)
- WHEN native capability becomes ready
- THEN `browserRuntime` MUST remain `iframe`

### Requirement: Overlay sync idle in lite mode

When effective runtime is `iframe`, the system SHALL NOT invoke `native_browser_open`, `native_browser_resize`, or `native_browser_set_visibility` for that panel.

#### Scenario: Dock resize with iframe

- GIVEN iframe runtime active
- WHEN the right dock is resized
- THEN no native browser resize IPC MUST occur for that browser panel

# Delta Spec: board-browser-load (Pizarra UX Overhaul, Phase 1)

> **Move coverage**: Move 4 (iframe-first browser load with explicit fallback), Move 5 (browser-header hover/active micro-states deferred to `board-browser-pane`), Move 6 (browserRuntime flag in `rightDockState`).
> **Stem rationale**: new capability. Promoted to base spec at `openspec/specs/board-browser-load/spec.md` on archive. Distinct from the existing `openspec/specs/browser-preview-lifecycle/spec.md` (which covers selector activation / cross-origin support classification) and `openspec/specs/browser-preview-responsiveness/spec.md` (which covers bounded polling and diagnostics). This spec owns the _initial mount and runtime mode_ contract for pizarra-mounted browser shapes.

## Purpose

Define the deterministic load path for a pizarra-mounted browser shape so that the user sees content immediately, the surface never gets stuck on a perpetual loading spinner, and the path to a native GTK runtime is opt-in rather than a hard race. The pizarra's value is layout, not raw WebKit; iframe-first matches that, and the explicit failure surface replaces the "did it crash?" ambiguity.

## Requirements

### Requirement 1: Iframe-first initial mount

The system MUST mount a pizarra browser shape with `dockState.browserRuntime === 'iframe'` by default. The system MUST render the iframe pointed at `shape.url` (or the normalized equivalent) on the very first render — no waiting on `nativeRuntimeReady`, no waiting on a capability probe, no waiting on a server round-trip.

The system MUST switch `browserRuntime` to `'native-gtk'` ONLY after BOTH of the following conditions are true:

1. `useNativeBrowserCapability` reports the runtime is supported AND ready (the existing `nativeRuntimeReady` signal resolves), AND
2. The consumer has not opted out of native for the board (`browserLoadFallback !== true`).

Until both conditions hold, the iframe MUST remain mounted and visible. The native surface is additive, not a replacement.

#### Scenario: Iframe renders on mount even if native runtime is unresolved

- GIVEN a `PizarraBrowserSurface` mounts with `shape.url = 'http://localhost:3100/'`
- AND the native GTK runtime never reports `nativeRuntimeReady` (the stuck-loading condition)
- WHEN the component renders
- THEN an `<iframe>` with `src` matching `localhost:3100` MUST be in the DOM within 250ms of mount
- AND `dockState.browserRuntime` MUST be `'iframe'`
- AND the user MUST see the iframe content, not a perpetual spinner

#### Scenario: Native runtime opt-in only after readiness signal

- GIVEN the iframe is rendered and the user navigates to a different URL
- AND the native GTK runtime reports `nativeRuntimeReady === true` for the first time
- WHEN the lifecycle state updates
- THEN `dockState.browserRuntime` MUST flip to `'native-gtk'`
- AND the native surface MUST mount on top of the iframe (the iframe stays underneath as the fallback)

#### Scenario: browserLoadFallback flag keeps iframe even when native is ready

- GIVEN `dockState.browserLoadFallback === true`
- AND the native GTK runtime reports `nativeRuntimeReady === true`
- WHEN the lifecycle state updates
- THEN `dockState.browserRuntime` MUST remain `'iframe'`
- AND the native surface MUST NOT mount

### Requirement 2: 5-second timeout to explicit failure surface

The system MUST start a 5-second timer when the pizarra browser shape mounts. The timer counts the time the iframe has been "stuck" (no successful load event AND no `nativeRuntimeReady` signal). When the timer fires, the system MUST render an explicit `BrowserLoadFailed` state with:

- A human-readable error message ("Browser failed to load")
- A "Reload" button that re-arms the timer and retries the iframe load
- The iframe still rendered underneath the failure surface (so any partial content stays visible)

The 5-second value is a conservative default for cold-start environments. The system MAY make this value configurable through a build-time constant, but MUST NOT surface it as a user setting in Phase 1.

#### Scenario: Manual reload button appears after 5s of no readiness signal

- GIVEN a pizarra browser shape mounts
- AND the iframe fires no `load` event within 5 seconds
- AND the native runtime does not report `nativeRuntimeReady` within 5 seconds
- WHEN the timer fires
- THEN the surface MUST render a `BrowserLoadFailed` view
- AND the view MUST contain a button labeled "Reload" (or matching `/reload/i`)
- AND the iframe MUST remain in the DOM underneath the failure surface

#### Scenario: Reload button re-arms the timer and retries the iframe

- GIVEN the `BrowserLoadFailed` view is rendered
- WHEN the user clicks the "Reload" button
- THEN the timer MUST be reset to 5 seconds
- AND the iframe `src` MUST be re-applied (forcing a reload)
- AND the failure view MUST remain until either a load event or the timer fires again

#### Scenario: Successful load within 5s clears the failure risk

- GIVEN the timer is counting
- WHEN the iframe fires a `load` event before 5 seconds elapse
- THEN the timer MUST be cancelled
- AND the `BrowserLoadFailed` view MUST NOT render

### Requirement 3: Native runtime error surface

The system MUST render a `BrowserLoadFailed` view when the native GTK runtime reports an error (in addition to the 5-second timeout). The error view MUST distinguish three failure categories:

| Category         | Trigger                                         | User-facing copy                              |
| ---------------- | ----------------------------------------------- | --------------------------------------------- |
| `iframe-stuck`   | 5s timer fired with no load event               | "Browser is taking too long to load"          |
| `native-error`   | Native runtime reported an error event          | "Native browser runtime encountered an error" |
| `native-timeout` | Native readiness was promised but never arrived | "Native browser runtime did not start"        |

The Reload button MUST be present in all three categories.

#### Scenario: Native runtime error triggers the failure view

- GIVEN the iframe is rendered
- AND the native GTK runtime reports an error event (e.g., crashed, lost connection)
- WHEN the error event is observed
- THEN the `BrowserLoadFailed` view MUST render with the `native-error` category
- AND the Reload button MUST be present

#### Scenario: Native readiness promise that never arrives

- GIVEN the consumer (e.g., a future capability probe) reports `nativeSupported === true` but `nativeRuntimeReady` never resolves
- WHEN 5 seconds elapse after the iframe mount
- THEN the `BrowserLoadFailed` view MUST render with the `native-timeout` category

### Requirement 4: First contentful paint within 250ms

The system MUST reach First Contentful Paint (FCP) for a pizarra-mounted browser shape within 250ms of the shape's mount. The FCP target is satisfied when either:

1. The iframe is in the DOM and pointed at `shape.url` (the iframe's own content paints async, but the iframe element itself is FCP-class), OR
2. A loading placeholder is in the DOM with the `browser-loading` class or a matching testid.

The system MUST NOT delay FCP by waiting for `nativeRuntimeReady`, a capability probe, or a server-side round-trip.

#### Scenario: Iframe is in DOM within 250ms of mount

- GIVEN a `PizarraBrowserSurface` mounts with `shape.url = 'http://localhost:3100/'`
- WHEN the mount is complete
- THEN within 250ms, an `<iframe>` element MUST be present in the DOM
- AND the iframe's `src` attribute MUST start with the same origin as `shape.url`

### Requirement 5: browserLoadFallback whitelisted in right-dock state

The system MUST accept `browserLoadFallback: boolean` as a valid field on the `rightDockState` object. The whitelist sanitizer in `rightDockState.js` MUST preserve `browserLoadFallback` across reads and writes; the field MUST default to `false` (i.e., "opt-in to iframe" is explicit, not implicit).

#### Scenario: browserLoadFallback survives a state round-trip

- GIVEN `rightDockState` contains `{ activeTab: 'pizarra', browserLoadFallback: true, ... }`
- WHEN `sanitizeRightDockState` is called
- THEN the returned state MUST still contain `browserLoadFallback: true`
- AND a default `readRightDockState` MUST default the field to `false` when it is absent

## Non-Goals

- Multi-tab browser in the pizarra (the proposal defers the tab model to a follow-up `pizarra-browser-tabs` change). The current pizarra behavior of one `PizarraBrowserSurface` per browser shape remains.
- Cross-origin support classification (owned by `browser-preview-lifecycle`).
- Selector mode / visual-edit instrumentation (owned by `browser-preview-lifecycle`).
- Chromium / CDP / arbitrary remote inspection.
- A user-facing timeout setting (the 5s value is a build constant in Phase 1).
- Retry-with-backoff beyond the manual Reload button (no exponential backoff in Phase 1).

## Test mapping

| Scenario                                                        | Test file                                                         | Test name                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Iframe renders on mount even if native runtime is unresolved    | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `iframe renders within 250ms even if native runtime stalls`                  |
| Native runtime opt-in only after readiness signal               | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `browserRuntime flips to native-gtk only after readiness signal`             |
| browserLoadFallback flag keeps iframe even when native is ready | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `browserLoadFallback=true prevents native-gtk opt-in`                        |
| Manual reload button appears after 5s of no readiness signal    | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `manual reload button appears after 5s if native never resolves`             |
| Reload button re-arms the timer and retries the iframe          | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `reload button re-arms the 5s timer and resets iframe src`                   |
| Successful load within 5s clears the failure risk               | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `successful iframe load cancels the 5s failure timer`                        |
| Native runtime error triggers the failure view                  | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `native runtime error triggers BrowserLoadFailed with native-error category` |
| Native readiness promise that never arrives                     | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `native-supported but never-ready triggers native-timeout failure`           |
| Iframe is in DOM within 250ms of mount                          | `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | `iframe is in DOM within 250ms of mount (FCP target)`                        |
| browserLoadFallback survives a state round-trip                 | `src/components/workspace/__tests__/rightDockState.test.js`       | `sanitizeRightDockState preserves browserLoadFallback`                       |

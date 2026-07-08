# Delta for browser-selector-compat

## ADDED Requirements

### Requirement: Selector on lite path is mandatory

With default `iframe` runtime, edit mode and element selection SHALL remain supported for same-origin previews, localhost previews via `/api/preview-proxy`, and remote previews that expose the visual-edit protocol.

#### Scenario: Proxied localhost dev server

- GIVEN URL `http://localhost:5173` proxied through preview-proxy
- WHEN the user enables edit mode
- THEN selector MUST enter a supported state per `visual-edits-selector-reliability`
- AND MUST NOT silently fail only because native GTK is disabled

#### Scenario: Cross-origin without instrumentation

- GIVEN a cross-origin URL without visual-edit protocol
- WHEN the user enables edit mode
- THEN the system MUST show unsupported copy
- AND MUST NOT claim native GTK is required for selection

### Requirement: Native selector is optional enhancement

When `native-gtk` is opt-in and active with `selector.inspect` capability, native inspect MAY be used; when lite path is active, iframe/proxy selector MUST remain the primary implementation.

#### Scenario: Opt-in native with edit mode

- GIVEN native opt-in build on Linux with selector ready
- AND effective runtime is `native-gtk`
- WHEN edit mode is on
- THEN native selector MAY be used

#### Scenario: Default lite build

- GIVEN default iframe-first build
- WHEN edit mode is on for proxied localhost
- THEN selection MUST use iframe/proxy instrumentation without native probe

## MODIFIED Requirements

None — extends existing visual-edit contracts; does not replace `visual-edits-selector-reliability` change archive.

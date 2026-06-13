# Delta Spec: terminal-renderer-selection

## Type: DELTA

This delta makes the static `xterm-webgl` capability report `ready: true` in the no-probe code path so that callers that do not wire a live readiness probe (settings, defaults resolver) honor the new `xterm-webgl` global default. It also pins the behavior so the static `resolveRendererSelection` no longer silently demotes `'xterm-webgl'` to `'xterm'`. The existing `vte-experimental` flow and all other term-02 scenarios remain intact.

## ADDED Requirements

### Requirement: TRS-DELTA-1 — Static `xterm-webgl` Capability Readiness

The system MUST report `getTerminalRendererCapability('xterm-webgl').ready === true` in the static (no live probe) path. The static `resolveRendererSelection` MUST NOT demote `'xterm-webgl'` to `'xterm'` when the static capability map is the only signal available. Callers that wire a live probe continue to use the probe's result and override the static default.

#### Scenario: TRS-DELTA-S1 — Static path reports `xterm-webgl` as ready

- GIVEN the static capability map in `terminalRendererCapabilities.js`
- WHEN `getTerminalRendererCapability('xterm-webgl')` is called without a live probe
- THEN the result reports `ready: true`

#### Scenario: TRS-DELTA-S2 — Static `resolveRendererSelection` honors `xterm-webgl`

- GIVEN a panel requests `'xterm-webgl'` and the runtime capability map is built from the static path only
- WHEN `resolveRendererSelection` runs without a live readiness probe
- THEN the resolved effective renderer is `'xterm-webgl'`
- AND the resolver MUST NOT silently demote the request to `'xterm'`

#### Scenario: TRS-DELTA-S3 — Existing `vte-experimental` flow is unchanged

- GIVEN a panel requests `'vte-experimental'`
- WHEN `resolveRendererSelection` runs with the static capability map
- THEN the effective renderer resolution path matches the term-02 contract
- AND the `'vte-experimental'` opt-in remains intact for Linux/Tauri operators

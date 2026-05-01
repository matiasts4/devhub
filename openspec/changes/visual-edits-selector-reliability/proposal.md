# Proposal: Visual Edits Selector Reliability

## Intent

Fix selector activation so DevHub behaves predictably instead of silently falling back to normal browsing and later showing the unsupported preview error.

## Scope

### In Scope

- Define support boundaries for localhost proxied previews, same-origin DOM fallback, remote instrumented previews, and unsupported remote/non-instrumented previews
- Detect when navigation escapes the proxy/instrumentation path and downgrade selector state deterministically
- Tighten activation UX, readiness states, and unsupported copy so users know immediately whether selection can work
- Add focused tests around selector activation, navigation escape, and unsupported transitions

### Out of Scope

- New visual-edit protocol features inside external preview apps
- Broad browser-pane refactors unrelated to selector/protocol reliability
- Support for arbitrary remote previews without same-origin access or preview instrumentation

## Capabilities

### New Capabilities

- `visual-edit-selector-reliability`: Deterministic selector activation and fallback handling across supported preview modes

### Modified Capabilities

- None

## Approach

Model preview support explicitly in `WorkspaceBrowserPane`: classify current preview mode, arm selector only when a supported path exists, and fail fast when no supported path remains. Keep localhost previews inside `/api/preview-proxy`, re-check support after every iframe load/navigation event, and surface unsupported state immediately when a remote preview is neither same-origin nor instrumented. Preserve current bridge integration; only harden state transitions, proxy escape detection, and user messaging.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/workspace/WorkspaceBrowserPane.jsx` | Modified | Canonical support-state model, activation flow, deterministic fallback/unsupported UX |
| `src/app/api/preview-proxy/route.js` | Modified | Harden proxy/instrumentation retention and escape detection for localhost previews |
| `src/components/workspace/WorkspaceBridgePane.jsx` | Modified | Keep forced edit-mode entry aligned with new selector state rules |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modified | Ensure dock/browser integration reflects reliable selector availability |
| `tests/e2e or component coverage for workspace browser` | Modified/New | Regression coverage for supported vs unsupported preview modes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Misclassifying a supported preview as unsupported | Medium | Centralize support detection and cover each mode with tests |
| Proxy hardening changes localhost navigation behavior | Medium | Limit scope to proxy retention and verify normal browsing still works |

## Rollback Plan

Revert the browser-pane/proxy changes and restore current activation logic. If regressions appear, ship existing behavior while keeping this change isolated to the modules above so rollback does not affect unrelated dock/editor flows.

## Dependencies

- Existing `@emergentbase/visual-edits` protocol
- Current localhost preview proxy route

## Success Criteria

- [ ] Localhost previews routed through the proxy MUST enter selection mode reliably or explain immediately why they cannot
- [ ] Same-origin non-instrumented previews MUST use DOM fallback deterministically
- [ ] Remote instrumented previews MUST keep protocol-based selection working after supported navigations
- [ ] Remote previews that are neither same-origin nor instrumented MUST show unsupported state without delayed false activation
- [ ] If navigation escapes proxy/instrumentation, DevHub MUST reset selector state and show the correct unsupported guidance

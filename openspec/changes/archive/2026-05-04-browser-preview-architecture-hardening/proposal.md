# Proposal: Browser Preview Architecture Hardening

## Intent

Harden the iframe/proxy preview stack so browser navigation, support classification, and selector readiness become deterministic, cheaper to reason about, and more responsive without changing the supported preview contract.

## Scope

### In Scope
- Split preview support classification, navigation observation, and inspection control out of `WorkspaceBrowserPane.jsx`
- Make iframe load/proxy escape recovery deterministic for localhost proxied previews
- Reduce preview-adjacent polling/logging churn where it materially affects responsiveness and diagnosis
- Add regression coverage for browser-pane and right-dock state transitions

### Out of Scope
- Chromium/CDP or browser-engine migration
- Support for remote cross-origin previews without same-origin access or visual-edit instrumentation
- New external preview protocol features

## Capabilities

### New Capabilities
- `browser-preview-lifecycle`: Deterministic preview navigation/support-state handling across iframe, proxy, and selector flows
- `browser-preview-responsiveness`: Bounded polling/logging behavior that avoids avoidable preview-adjacent churn

### Modified Capabilities
- None

## Approach

Extract lifecycle boundaries first: support classifier, navigation observer, inspection controller. Keep `/api/preview-proxy` limited to localhost retention/rewrite safety. Simplify iframe `onLoad` to reconcile observed state instead of driving retries. Trim noisy polling/tick/log paths only where they compete with preview responsiveness.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/workspace/WorkspaceBrowserPane.jsx` | Modified | Decompose coupled preview state machine |
| `src/components/workspace/` or `src/hooks/` | New/Modified | Extract classifier/lifecycle hooks/helpers |
| `src/app/api/preview-proxy/route.js` | Modified | Tighten proxy escape and rewrite boundaries |
| `src/hooks/useAgentRegistryPolling.js` | Modified | Lower non-essential polling pressure |
| `src/components/AgentRoomSidebar.jsx` | Modified | Remove 1s churn if not needed for preview-adjacent UX |
| `src/hooks/useClientErrorLogger.js` / `src/app/api/client-log/route.js` | Modified | Dedupe/throttle noisy preview diagnostics |
| `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` | Modified | Browser/selector lifecycle regressions |
| `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` | Modified | Dock/browser persistence integration |

## Rollout Shape

Ship in one isolated refactor change behind the existing preview contract: first extraction, then proxy/load hardening, then polling/logging tightening, with regression tests at each layer.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Contract drift implies unsupported remote previews now work | Medium | Encode unsupported boundary in specs/tests/copy |
| Proxy recovery refactor breaks localhost navigation | Medium | Keep proxy scope narrow and test escape/return paths |
| Reduced polling exposes hidden timing assumptions | Medium | Update tests to assert state, not timer frequency |

## Rollback Plan

Revert extracted lifecycle modules and proxy/polling/logging hardening together, restoring current `WorkspaceBrowserPane` orchestration and prior intervals. Because scope stays isolated to preview-adjacent modules, rollback should not affect terminal or browser-window features.

## Dependencies

- Existing visual-edit protocol package and current preview proxy route

## Success Criteria

- [ ] Supported preview modes behave exactly as today, including unsupported remote non-instrumented previews
- [ ] Preview load/navigation no longer relies on intertwined retry/timer paths inside one component
- [ ] Proxy escape and recovery transitions are deterministic and test-covered
- [ ] Preview-adjacent logging/polling generates less avoidable churn while preserving diagnostics

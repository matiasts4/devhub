# Tasks: Browser Preview Architecture Hardening

## Phase 1: Support Helpers + Diagnostics Foundation

- [x] 1.1 RED — Add `src/components/workspace/__tests__/browserPreviewSupport.test.js` for support classification, proxy URL helpers, unsupported remote copy, and localhost escape/return boundaries.
- [x] 1.2 RED — Add `src/lib/__tests__/browserPreviewDiagnostics.test.js` for normalized preview/proxy event payloads and stable reason categories.
- [x] 1.3 GREEN — Create `src/components/workspace/browserPreviewSupport.js` with support constants, classifier, proxy helpers, and explicit unsupported remote non-instrumented boundary.
- [x] 1.4 GREEN — Create `src/lib/browserPreviewDiagnostics.js` and wire shared event builders without introducing Chromium/CDP paths.

## Phase 2: Controller Extraction + Pane Wiring

- [x] 2.1 RED — Extend `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` for repeated iframe loads, deterministic inspect activation, and immediate unsupported remote rejection.
- [x] 2.2 GREEN — Create `src/components/workspace/useBrowserPreviewController.js` with reducer-style preview events, single retry scheduler, and selector state reconciliation.
- [x] 2.3 GREEN — Refactor `src/components/workspace/WorkspaceBrowserPane.jsx` into a thin shell that forwards submit/load/message/toggle events to the controller.
- [x] 2.4 REFACTOR — Remove redundant pane retry/state churn, keeping `src/components/workspace/browserHistory.js` navigation commits driven by observed lifecycle state.

## Phase 3: Proxy Recovery + Quiet Diagnostics

- [x] 3.1 RED — Extend `src/app/api/preview-proxy/route.test.js` and add `src/hooks/useClientErrorLogger.test.js` for localhost-only rewrites, proxy escape recovery, and repeated diagnostic dedupe.
- [x] 3.2 GREEN — Update `src/app/api/preview-proxy/route.js` to reuse shared diagnostics and preserve localhost-only proxy scope.
- [x] 3.3 GREEN — Update `src/hooks/useClientErrorLogger.js` and controller/support helpers so repeated preview failures coalesce while proxy loss, recovery, same-origin fallback, and missing instrumentation stay actionable.

## Phase 4: Polling Pressure + Right-Dock Regression Coverage

- [x] 4.1 RED — Extend `src/hooks/useAgentRegistryPolling.test.js` and `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` for visibility/backoff polling, dock persistence, and browser-pane correctness under slower timers.
- [x] 4.2 GREEN — Update `src/hooks/useAgentRegistryPolling.js` with optional visibility-aware backoff and keep its default contract unchanged.
- [x] 4.3 GREEN — Update `src/components/AgentRoomSidebar.jsx` to replace 1s elapsed-time churn with coarser refresh buckets; do not modify `App.js` polling.

## Phase 5: Verification

- [x] 5.1 Verify targeted Jest suites cover spec scenarios: repeated-load determinism, supported activation, unsupported remote rejection, proxy escape/return, diagnostic dedupe, and right-dock persistence.
- [x] 5.2 Verify code review boundaries: supported modes remain `same-origin-dom`, `localhost-proxy`, `remote-protocol`; remote cross-origin non-instrumented previews stay unsupported; no Chromium migration added.

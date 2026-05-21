# Exploration: browser preview architecture hardening

## Current State
The preview system is already capability-gated: same-origin DOM fallback, localhost proxy, and remote protocol are supported; remote cross-origin non-instrumented previews stay unsupported. The problem is not missing capability, it is coupling and churn inside `WorkspaceBrowserPane.jsx`.

Today that component owns URL submission, proxy selection, iframe load/error handling, support classification, selector activation, DOM inspection fallback, protocol handshake retries, unsupported downgrades, and browser-history syncing in one place. That creates repeated state flips on load/navigation and makes proxy escape recovery depend on several refs/timers staying aligned.

The surrounding app also adds noise: `useAgentRegistryPolling` polls every 5s, `AgentRoomSidebar` ticks every second for elapsed-time rendering, `App.js` polls project/task state on fixed intervals, and client logging forwards every prefixed console line without real dedupe. None of that is the browser preview problem, but it increases perceived lag and makes the preview harder to reason about.

## Affected Areas
- `src/components/workspace/WorkspaceBrowserPane.jsx` — main coupling hotspot; navigation lifecycle and inspection lifecycle are interwoven.
- `src/app/api/preview-proxy/route.js` — proxy determinism, escape detection, and recovery behavior for localhost previews.
- `src/hooks/useAgentRegistryPolling.js` — background polling pressure that competes with UI responsiveness.
- `src/components/AgentRoomSidebar.jsx` — 1s tick loop contributes avoidable render churn.
- `src/App.js` — multiple fixed-interval refresh loops; not preview-specific but part of responsiveness budget.
- `src/hooks/useClientErrorLogger.js` / `src/app/api/client-log/route.js` — verbose client logging path with no dedupe/throttle policy.
- `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` — dock/window integration coverage.
- `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` — existing selector/bridge regression coverage.
- `openspec/changes/visual-edits-selector-reliability/specs/visual-edit-selector-reliability/spec.md` — contract boundary that must not be broadened.

## Approaches
1. **Extract lifecycle boundaries without changing support contract** — move preview support classification, navigation observation, and selector/inspection state into focused helpers/hooks while keeping the same support modes.
   - Pros: highest leverage, low risk, preserves behavior boundary, makes proxy escape recovery deterministic.
   - Cons: requires careful refactor of a large component.
   - Effort: High.

2. **Hardening pass on proxy + timers only** — keep component structure mostly intact, but tighten iframe onLoad policy, proxy escape detection, retry backoff, and local logging/polling cadence.
   - Pros: smaller blast radius, quicker to ship.
   - Cons: leaves the core coupling in place, so future changes stay fragile.
   - Effort: Medium.

3. **Targeted observability reduction** — add dedupe/rate limits to client logging and trim global polling/tick loops.
   - Pros: improves perceived responsiveness and log signal quality fast.
   - Cons: does not materially solve the browser-preview architecture problem by itself.
   - Effort: Low/Medium.

## Recommendation
Do **1 + 2**, with 1 as the architectural spine and 2 as the safety hardening layer. Specifically: split `WorkspaceBrowserPane` into a pure preview-support classifier, a navigation lifecycle observer, and an inspection controller; keep localhost proxy support and remote instrumentation boundaries exactly as-is; then simplify the iframe `onLoad` path so it only reconciles state instead of driving retry logic. In parallel, lower noisy polling/tick pressure and dedupe client logs to improve responsiveness and diagnosis.

## Risks
- Refactor could accidentally blur the existing contract and start implying support for remote non-instrumented previews; that MUST stay unsupported.
- Proxy navigation rewriting is subtle; if recovery logic is too aggressive, it can trap legitimate same-origin navigation.
- Timer/poll reductions may surface hidden assumptions in tests that currently depend on frequent rerenders.

## Ready for Proposal
Yes. The system is ready for a proposal that scopes to architectural hardening only, with explicit non-goals preserved from selector reliability.

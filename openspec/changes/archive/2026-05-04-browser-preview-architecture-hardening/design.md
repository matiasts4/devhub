# Design: Browser Preview Architecture Hardening

## Technical Approach

Refactor `WorkspaceBrowserPane.jsx` into a thin view over a controller hook plus pure preview-support helpers. Keep the current contract from `visual-edits-selector-reliability`: supported modes stay `same-origin-dom`, `localhost-proxy`, and `remote-protocol`; remote cross-origin non-instrumented previews remain unsupported. Centralize retry, proxy escape recovery, and diagnostics so iframe `onLoad` and `postMessage` become event inputs, not ad-hoc state machines.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Preview orchestration | Add `useBrowserPreviewController.js` with reducer-style transitions and a single retry scheduler | Keep refs/effects inside `WorkspaceBrowserPane.jsx`; adopt XState | Matches current React patterns, removes intertwined timers/refs, avoids new dependency weight |
| Support classification boundary | Move constants, URL/proxy helpers, unsupported copy, and classifier into `browserPreviewSupport.js` | Leave logic inline in component | Makes same-origin/proxy/remote rules testable and preserves unsupported boundary explicitly |
| Diagnostics | Add shared `browserPreviewDiagnostics.js` used by pane and proxy route; dedupe repeated client emissions in `useClientErrorLogger.js` | Separate ad-hoc `console.warn/error` payloads everywhere | Stable event names and payload shape make proxy recovery/debugging deterministic |
| Timer-pressure scope | Reduce only preview-adjacent churn (`useAgentRegistryPolling`, `AgentRoomSidebar`, preview diagnostics) | Rewrite all app polling including `App.js` | Lowers contention without destabilizing unrelated project/task refresh flows |

## Data Flow

```text
WorkspaceBrowserPane
  -> useBrowserPreviewController
      -> browserPreviewSupport (classify, proxy/url helpers, unsupported copy)
      -> browserPreviewDiagnostics (normalized events)
      -> browserHistory.commitBrowserNavigation
      -> DOM inspector / postMessage bridge

/api/preview-proxy/route.js
  -> browserPreviewDiagnostics
```

### Sequence: navigation + inspect activation

```text
Same-origin
User Inspect -> controller classify(same-origin-dom) -> attach DOM inspector -> ARMED -> click -> SELECTED

Localhost proxy
Navigate localhost URL -> controller resolves /api/preview-proxy -> iframe load -> controller enters CONNECTING
-> ACTIVATE + retry policy waits for MODE_ACTIVATED -> support=remote-protocol
-> if later iframe src leaves proxy scope -> clear selection + UNSUPPORTED(proxy-escaped)

Unsupported remote
User Inspect -> classify(cross-origin-no-instrumentation) -> no retry timer scheduled
-> UNSUPPORTED immediately -> unsupported copy shown
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/components/workspace/WorkspaceBrowserPane.jsx` | Modify | Render-only shell; forwards submit/load/message/toggle events to controller |
| `src/components/workspace/browserPreviewSupport.js` | Create | Support constants, classification, proxy/url helpers, unsupported copy |
| `src/components/workspace/useBrowserPreviewController.js` | Create | Central state transitions, retry control, proxy recovery, URL sync, inspector lifecycle |
| `src/lib/browserPreviewDiagnostics.js` | Create | Shared preview/proxy diagnostic event builder |
| `src/app/api/preview-proxy/route.js` | Modify | Reuse diagnostics helper; keep localhost-only rewrite boundary |
| `src/hooks/useClientErrorLogger.js` | Modify | Dedupe/rate-limit repeated preview diagnostic envelopes before POST |
| `src/hooks/useAgentRegistryPolling.js` | Modify | Add visibility-aware/backoff polling options without changing default contract |
| `src/components/AgentRoomSidebar.jsx` | Modify | Replace 1s elapsed-time tick with coarser bucketed refresh; opt into polling backoff |
| `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` | Modify | Cover controller sequences, proxy escape, unsupported remote, same-origin fallback |
| `src/app/api/preview-proxy/route.test.js` | Modify | Cover normalized diagnostics and localhost proxy recovery boundaries |
| `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` | Modify | Guard right-dock/browser integration after controller extraction |

## Interfaces / Contracts

```js
previewState = {
  support: { mode, reason, viaProxy, checkedAt },
  selector: 'idle|checking|connecting|armed|selected|unsupported',
  inspecting: boolean,
  selectedElement: object | null,
};

dispatchPreviewEvent(type, payload);
// type: NAVIGATE | IFRAME_LOAD | IFRAME_ERROR | INSPECT_TOGGLE |
//       PROTOCOL_MESSAGE | PROXY_ESCAPED | RESET
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Classifier, retry policy, diagnostics dedupe | Jest on new pure helpers/modules |
| Integration | Inspect activation, iframe load/message flows, proxy escape recovery, dock persistence | Extend existing jsdom tests in workspace/right-dock suites |
| E2E | No new Playwright coverage in this change | Keep cross-origin semantics deterministic in Jest; add E2E only if regressions escape harness |

## Migration / Rollout

No migration required. Ship in one refactor: extract helpers/controller first, then switch pane wiring, then tighten polling/logging. `App.js` polling remains unchanged in this change.

## Open Questions

- [ ] Whether `/api/client-log` also needs server-side rate limiting after client-side dedupe; not blocking this refactor.

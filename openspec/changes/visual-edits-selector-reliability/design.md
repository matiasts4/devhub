# Design: Visual Edits Selector Reliability

## Technical Approach

Keep the current `WorkspaceBrowserPane` + `/api/preview-proxy` architecture, but separate **preview support classification** from **selector UI state**. `WorkspaceBrowserPane` will classify each loaded preview into an explicit support mode, then drive selector transitions from that mode instead of inferring support from timeouts and one-off side effects. References: proposal `sdd/visual-edits-selector-reliability/proposal`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Support modeling | Implicit booleans/timeout only; single state string; support model + selector state | Support model + selector state | Capability and transient UX are different concerns. This prevents false activation and makes failures diagnosable. |
| Localhost reliability path | Direct iframe + fallback; proxy only on inspect; proxy as canonical localhost edit path | Proxy as canonical localhost edit path | Current route already injects overlay and nav interception. Re-entering proxy late is what makes behavior flaky. |
| Unsupported timing | Always wait timeout; always fail immediately; reason-based timing | Reason-based timing | Immediate failure is correct for known-unsupported states; timeout is only valid while a protocol/proxy path is still plausible. |
| Forced edit mode | Keep wrapper implicit; honor `forceEditMode`; remove bridge wrapper | Honor `forceEditMode` in `WorkspaceBrowserPane` | `WorkspaceBridgePane` already passes it. Making it real keeps bridge entry deterministic and removes dead-contract ambiguity. |

## Data Flow

```text
edit mode / inspect / iframe load / postMessage
  -> classifyPreviewSupport()
  -> supportState { mode, reason, verifiedAt, viaProxy }
  -> transitionSelectorState()
  -> DOM fallback attach | proxy handshake wait | unsupported copy
```

Sequence:

```text
User inspect
  -> BrowserPane classifies current preview
    -> same-origin-dom: attach DOM inspector, state=armed
    -> localhost-proxy (not loaded yet): swap iframe to proxy, state=connecting
    -> localhost-proxy (loaded): post ACTIVATE, wait handshake
    -> remote-protocol: post ACTIVATE, wait handshake
    -> unsupported: clear selection, state=unsupported, show copy immediately

iframe onLoad
  -> verify proxy marker / same-origin access / current iframe src
  -> if proxy escaped or instrumentation lost: clear selection + downgrade support
  -> if support still valid: re-arm DOM fallback or resend ACTIVATE
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/components/workspace/WorkspaceBrowserPane.jsx` | Modify | Add support classifier, deterministic transition helpers, reason-specific unsupported copy, and `forceEditMode` handling. |
| `src/app/api/preview-proxy/route.js` | Modify | Preserve proxy identity across navigations, log escape/rewrite failures, and keep a stable proxy marker for load-time verification. |
| `src/components/workspace/WorkspaceBridgePane.jsx` | Modify | Keep bridge wrapper thin, but rely on real `forceEditMode` semantics instead of implicit edit-mode side effects. |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modify | Keep dock/browser integration on the same pane contract; no separate selector heuristics. |
| `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` | Modify | RED-first coverage for explicit unsupported, proxy escape, and forced-edit activation paths. |
| `src/app/api/preview-proxy/route.test.js` | Modify | RED-first coverage for proxy marker retention, navigation rewrite persistence, and escape diagnostics. |

## Interfaces / Contracts

```js
const PREVIEW_SUPPORT_MODE = {
  SAME_ORIGIN_DOM: 'same-origin-dom',
  LOCALHOST_PROXY: 'localhost-proxy',
  REMOTE_PROTOCOL: 'remote-protocol',
  UNSUPPORTED: 'unsupported',
};

// BrowserPane-local state
{
  supportMode,
  supportReason, // same-origin-access | proxy-active | proxy-escaped | handshake-timeout | cross-origin-no-instrumentation
  selectorState, // idle | checking | connecting | armed | selected | unsupported
  supportCheckedAt,
}
```

Rules:
- `unsupported` copy renders immediately for `cross-origin-no-instrumentation` and `proxy-escaped`.
- handshake timeout only applies to `localhost-proxy` and `remote-protocol` while a valid handshake path still exists.
- any downgrade to unsupported MUST clear timers, detach DOM listeners, clear selection, and stop inspecting.
- `WorkspaceBrowserPane` should emit structured logs on every state transition: `from`, `to`, `supportMode`, `reason`, `browserUrl`, `iframeSrc`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/component | Support classification and selector transitions | Extend `WorkspaceBridgePane.test.jsx` with RED-first cases for immediate unsupported, timeout-only protocol states, proxy escape, and `forceEditMode`. |
| API integration | Proxy persistence/escape detection | Extend `route.test.js` to assert proxy marker injection, preserved rewrite base, and logging-safe handling when navigation cannot stay proxied. |
| E2E smoke | Real iframe behavior | Add one Playwright smoke later if component tests expose browser/runtime gaps; not required for first implementation. |

RED-first order:
1. Unsupported remote preview shows copy immediately, without waiting `UNSUPPORTED_TIMEOUT_MS`.
2. Localhost proxy stays `connecting` only until verified load/handshake, then becomes `armed`.
3. Proxy escape clears `selectedElement`, detaches inspector, and shows proxy-escape copy.
4. Remote instrumented handshake timeout degrades once, with deterministic logging payload.
5. `WorkspaceBridgePane` forced entry auto-starts through the same classifier path.

## Migration / Rollout

No migration required. No storage changes. Rollout is direct because the change stays inside browser/proxy modules and tests. Rollback is also direct: revert the explicit support model and proxy verification changes in the files above. No persisted state needs cleanup.

## Open Questions

- [ ] None blocking design.

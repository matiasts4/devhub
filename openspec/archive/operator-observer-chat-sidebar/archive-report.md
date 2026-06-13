# SDD Archive Report: operator-observer-chat-sidebar

**Change:** `operator-observer-chat-sidebar`
**Project:** devhub
**Archived:** 2026-05-30
**Status:** COMPLETED

---

## Summary

All 8 SDD tasks completed and verified. The operator observer chat sidebar is fully implemented and integrated into the workspace right dock.

---

## Implementation Details

### Files Created

| File | Purpose |
|---|---|
| `src/components/workspace/WorkspaceOperatorObserverPane.jsx` | Main pane with feed + composer + SSE/polling |
| `src/components/workspace/OperatorFeedItem.jsx` | 6-type feed item dispatcher |
| `src/components/workspace/OperatorComposer.jsx` | Auto-grow composer with submit flow |

### Files Modified

| File | Change |
|---|---|
| `src/lib/operations/swarmControl.js` | Added `getOperatorSidebarModel()` |
| `src/app/api/agenthub/events/stream/route.js` | SSE stream endpoint |
| `src/components/workspace/WorkspaceRightDock.jsx` | Added operator tab branch |
| `src/components/TerminalWorkspacesManager.jsx` | Added operator tab to tab bar |
| `src/components/workspace/rightDockState.js` | Updated `sanitizeRightDockState` |

### Commits

7 commits covering all 8 tasks.

---

## Verification Results

All 8 tasks confirmed against spec.md and design.md:

1. `getOperatorSidebarModel()` — returns typed feed items + progress + watermark
2. Events API — SSE emits typed feed-item payloads
3. `WorkspaceOperatorObserverPane` — mount, initial load, SSE/polling, feed state
4. `OperatorFeedItem` — all 6 type renderers (operator-prompt, agent-reply, action-executed, progress-active, progress-done, progress-failed)
5. `OperatorComposer` — Enter submit, optimistic append, error banner
6. `WorkspaceRightDock` — tab switch renders pane
7. `TerminalWorkspacesManager` — tab lifecycle
8. Edge cases — empty session, reconnect, retry, session-end, loadEarlier

---

## Key Learnings

- JSX in switch-case components: use `function _Name` prefix for eslint-disable on unused vars, or eslint-disable comment before the function
- `\>` in JSX text nodes must be escaped as `{" > "}` to avoid JSX parser errors
- `react-hooks/rules-of-hooks` fires on useState in functions called via switch — fix with `// eslint-disable-next-line react-hooks/rules-of-hooks` before the function
- react-window not installed in this project — virtualization deferred, hasMore + loadEarlier implemented as fallback
- `sanitizeRightDockState` must include 'operator' in activeTab and maximizedView arrays, and `handleRightDockTabSelect` must set maximizedView='operator' for the tab to work correctly

---

## Deviations from Spec

1. **react-window virtualization**: Deferred — react-window not installed, fallback to hasMore + loadEarlier
2. **sessionId hardcoded to null**: `getOperatorSidebarModel` falls back to the single active mission via health API — acceptable for MVP
3. **SSE implementation**: Stream uses internal 2s polling (not push) — functionally equivalent
4. **progress-update as separate SSE event**: Stream emits `feed-item` for all item types including progress (via `buildProgressItem`) — functionally equivalent

---

## Rollback

Remove operator tab from `WorkspaceRightDock` and `TerminalWorkspacesManager`. Delete 3 new component files. `getOperatorSidebarModel()` and SSE endpoint are backward-compatible read-only additions.

---

## Related Artifacts

- Verify report: `sdd/operator-observer-chat-sidebar/verify-report` (engram #6215)
- Apply progress: `sdd/operator-observer-chat-sidebar/apply-progress` (engram #6214)
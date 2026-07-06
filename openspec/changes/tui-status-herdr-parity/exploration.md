# Exploration: TUI status indicators (herdr parity)

## Current State

DevHub panel badges combine three signals in `derivePanelStatus()` (`panelStatusHelpers.js`):

1. **Byte activity** — `panelActivityTracker` on PTY WS output (`TerminalTTY.jsx`).
2. **Semantic agent state** — herdr-style `agentStateDetection` on ~8KB buffer in `ttyServer.js` only.
3. **Polling** — `/api/terminal/sessions` and agenthub session status (`usePanelAgentStatus.js`).

Production **Tauri sidecar** (`sidecar-backend/server.js`) does **not** run the manifest engine; it uses per-chunk regex (`detectAgentStateFromOutput`). Desktop users get wrong `running`/`idle`/`blocked`.

Upstream reference: `.research/herdr` — evidence-based manifests, bottom viewport snapshot (~300ms loop), OSC title/progress, `AgentStateMachine` anti-flicker. Manifest diff script: `node scripts/compare-herdr-manifests.mjs`. See `investigation-notes.md`.

## Affected Areas

- `sidecar-backend/server.js`, `sessionTransport.js`, `agentTuiMetadata.js` — unify with ttyServer detector.
- `src/lib/terminal/ttyServer.js` — shared session detector module; bottom viewport extraction; WS `agent-state` events.
- `src/lib/terminal/agentStateDetection/` — regions (`osc_progress`, prompt-box variants), sync grok/claude manifests from herdr.
- `src/hooks/usePanelAgentStatus.js`, `panelStatusHelpers.js` — semantic-first arbitration vs `liveActivity`.
- `src/components/TerminalTTY.jsx` — consume semantic state events.
- Tests: `agentStateDetection`, `panelStatusHelpers`, sidecar session tests, new screen fixtures.

## Approaches

1. **Unify backend first (recommended)** — `createAgentSessionDetector()` shared by sidecar + ttyServer; CJS bundle or generated mirror for sidecar.
   - Pros: fixes desktop immediately; single source of truth.
   - Cons: ESM/CJS packaging work.
   - Effort: Medium.

2. **Manifest-only refresh** — port grok/claude rules without sidecar wiring.
   - Pros: fast for one agent.
   - Cons: badges still wrong in Tauri for semantic states.
   - Effort: Low — insufficient alone.

3. **Frontend-only xterm parsing** — duplicate herdr in client.
   - Pros: no sidecar change.
   - Cons: no state when disconnected; double maintenance.
   - Effort: High — rejected.

## Recommendation

Approach 1 + semantic-first UI policy. Keep byte tracker as fallback when semantic state is `unknown` or stale. Coordinate with change `terminal-tui-status-event-driven` (activity-status remains fallback, not primary when manifests match).

## Risks

- Buffer 8KB ≠ herdr bottom viewport → false positives; mitigate with `extractBottomViewport`.
- Dual `running` signals → document and test arbitration order.
- Sidecar CJS drift → build step from ESM source.

## Ready for Proposal

Yes. Clone and manifest diff complete (tasks 0.1–0.2).

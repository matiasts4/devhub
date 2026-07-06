# Proposal: TUI status indicators — herdr parity

## Intent

Terminal panel badges must show when agent TUIs are **working**, **idle**, **blocked** (permissions), or **unknown** — using visible UI evidence, not raw PTY bytes alone. [herdr](https://github.com/ogulcancelik/herdr) solves this with manifests, regions, OSC, and anti-flicker publishing. DevHub ported the engine but **sidecar (Tauri) does not use it**; UI arbitration between semantic state and byte activity is undefined.

## Scope

### In Scope

- Shared session detector (buffer, manifests, `AgentStateMachine`, OSC title/progress) in **sidecar and ttyServer**.
- WS notifications on published state transitions.
- Semantic-first `derivePanelStatus`; byte `liveActivity` only when semantic is stale/unknown.
- Manifest sync for kimi/claude/codex/opencode/**grok** (critical drift); missing regions in `ruleEngine.js`.
- Bottom-viewport extraction for detection input.
- Strict-TDD tests + screen fixtures under `tests/fixtures/agent-screens/`.
- Dev-only explain helper (matched rule + region snippet).

### Out of Scope

- Replacing herdr/tmux as multiplexer; remote manifest hot-reload in prod; new badge colors beyond existing `PANEL_STATUS`; agenthub DB rows for non-OpenCode agents.

## Capabilities

### New Capabilities

- `terminal-tui-herdr-detection`: Unified semantic PTY detection, WS state events, sidecar/ttyServer parity.

### Modified Capabilities

- `terminal-tui-activity-status` (change `terminal-tui-status-event-driven`): Byte-level activity is **explicit fallback** when semantic detection is unknown/stale — not co-equal with manifest state.

## Approach

1. Extract `createAgentSessionDetector` from ttyServer logic; wire sidecar output path identically.
2. Emit `agent-state` WS messages only on `AgentStateMachine.publish()` transitions.
3. Update UI arbitration per `design.md`.
4. Sync manifests from `.research/herdr`; add `scripts/compare-herdr-manifests.mjs` to CI/docs.
5. Port missing `getRegion` handlers from herdr `manifest.rs` region list.

## Affected Areas

| Area                                                  | Impact   | Description                   |
| ----------------------------------------------------- | -------- | ----------------------------- |
| `sidecar-backend/server.js`                           | Modified | Full detector pipeline        |
| `src/lib/terminal/ttyServer.js`                       | Modified | Use shared detector module    |
| `src/lib/terminal/agentStateDetection/`               | Modified | Regions, manifests            |
| `src/lib/terminal/sessionAgentDetector.js` (new)      | New      | Shared detector factory       |
| `src/hooks/usePanelAgentStatus.js`                    | Modified | Semantic events + arbitration |
| `src/components/terminal/utils/panelStatusHelpers.js` | Modified | Semantic-first policy         |
| `src/components/TerminalTTY.jsx`                      | Modified | Handle `agent-state` frames   |
| `scripts/compare-herdr-manifests.mjs`                 | New      | Upstream drift check          |

## Risks

| Risk                                   | Likelihood | Mitigation                                 |
| -------------------------------------- | ---------- | ------------------------------------------ |
| CJS/ESM split breaks sidecar           | Med        | Prebuild `agentStateDetection` for sidecar |
| Grok UI changes again                  | Med        | Periodic manifest diff from herdr          |
| Regression with activity-status change | Med        | Cross-change spec note + integration tests |

## Rollback Plan

Revert detector + UI commits. Sidecar reverts to chunk regex; `derivePanelStatus` prior priority restored. No DB migrations.

## Dependencies

- `.research/herdr` clone for manifest source (not runtime dep).
- Optional coordination with `terminal-tui-status-event-driven` if both land together.

## Success Criteria

- [ ] Same fixture → same `agentTuiState` on sidecar and ttyServer.
- [ ] Grok/Kimi permission UIs → `blocked` without slow polling only.
- [ ] Semantic idle while ANSI spinner runs → badge stays idle.
- [ ] Targeted Jest suites green; `investigation-notes.md` gaps closed for grok + osc_progress.

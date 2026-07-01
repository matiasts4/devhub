# Proposal: Terminal TUI Status — Event-Driven Detection

## Intent

Panel status badges never show `running` while an agent TUI (OpenCode, Kimi, Grok, Claude, Codex) works. Current detection uses 6s HTTP polling vs a 3s activity window, narrow footer-regex matching, and an OpenCode-only DB lookup. Four root causes compound the failure:

- **RC1** Routing mismatch — WS probes sidecar; poll reads in-process `ttyServer` → 404, `terminalActivity` nulled.
- **RC2** Regex too narrow — matches only Kimi's footer.
- **RC3** Temporal aliasing — 6000ms poll vs 3000ms window → >3s gaps measure as IDLE.
- **RC4** OpenCode-only DB rows — synthesized IDs for other agents 404.

## Scope

### In Scope

- Activity tracker in `TerminalTTY.jsx` consuming `data` frames from the already-open PTY WebSocket.
- Two-state model: `running`/`idle` only.
- Noise filter + debounce that demotes output gaps to `idle`.
- Bootstrap initial state from WS connect.
- `usePanelAgentStatus.js` consumes live WS signal; HTTP poll demoted to fallback.
- `PanelStatusBadge.jsx` wired via existing `PANEL_STATUS`.
- Strict-TDD tests for hook, badge, helpers, `TerminalTTY` WS handler.

### Out of Scope

- Sub-states (working/thinking/generating) — agent-specific, not universally useful.
- Fixing RC1 routing — irrelevant once live WS drives the badge.
- Broadening `AGENT_STATE_PATTERNS` regex — no longer the primary signal.
- agenthub DB rows for non-OpenCode agents.
- New UI states/animations/badges beyond existing `RUNNING`/`IDLE`.

## Capabilities

> Existing `openspec/specs/terminal-panel-state/spec.md` covers suspended-connection state; NOT modified here.

### New Capabilities

- `terminal-tui-activity-status`: Event-driven agent-TUI activity detection over the existing PTY WebSocket, exposing `running`/`idle` to panel status badges.

### Modified Capabilities

- None. `terminal-panel-state` requirements are unchanged.

## Approach

Event-driven model on the WS already open to the PTY:

1. `TerminalTTY.jsx` (~L4859): augment existing `socket.onmessage` with a tracker — substantial `data` frame (PTY→client) → `running`; debounce ~2s no output → `idle`.
2. Only `data` direction counts. User input (`write`, client→PTY) does NOT — typing in prompt stays `idle`.
3. Noise filter: ignore <~50-byte chunks and pure ANSI cursor-control/whitespace (`\x1b[?25h/l`, bare `\r`/`\n`).
4. Debounce ~1500–2500ms → `idle`.
5. Bootstrap on connect: WS open + initial `ready`/`snapshot` → set state or default `idle`.
6. `PanelStatusBadge.jsx` consumes the live signal reusing `PANEL_STATUS.RUNNING`/`IDLE`.

## Affected Areas

| Area                                                                                                                      | Impact                                              |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `src/components/TerminalTTY.jsx`                                                                                          | Activity tracker in WS onmessage                    |
| `src/hooks/usePanelAgentStatus.js`                                                                                        | Live WS primary; HTTP poll fallback                 |
| `src/components/terminal/utils/panelStatusHelpers.js`                                                                     | Thresholds; keep `PANEL_STATUS`/`derivePanelStatus` |
| `src/components/terminal/components/PanelStatusBadge.jsx`                                                                 | Wire to live signal                                 |
| `__tests__/usePanelAgentStatus.test.js`, `PanelStatusBadge.test.jsx`, `panelStatusHelpers.test.js`, `TerminalTTY.test.js` | Strict-TDD tests                                    |

## Risks

| Risk                                        | Likelihood | Mitigation                                                     |
| ------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Noise filter too strict masks real activity | Med        | Fake timers + PTY fixtures; low configurable 50-byte threshold |
| Wrong debounce → flicker/stuck `running`    | Med        | Default ~2s; tests assert rising/falling edges                 |
| HTTP poll removal loses liveness            | Low        | Keep poll as fallback if WS silent >N s                        |
| `TerminalTTY.test.js` WS mock fragile       | Med        | Minimal WS stub emitting `data`/`ready`/`snapshot` only        |

## Rollback Plan

Revert the commit. Hook reverts to HTTP-poll primary; `AGENT_STATE_PATTERNS` regex and 6s poll remain. No migrations or persisted state. Tests guard both directions.

## Dependencies

- Existing live PTY WebSocket in `TerminalTTY.jsx` (already open) — no new transport.

## Success Criteria

- [ ] Badge shows `running` within ~1 frame of real PTY output across OpenCode, Kimi, Grok, Claude, Codex.
- [ ] Badge returns to `idle` within ~2s of last substantial PTY output (debounce).
- [ ] User typing in a prompt does NOT mark the badge `running`.
- [ ] `npm test` green for `usePanelAgentStatus`, `PanelStatusBadge`, `panelStatusHelpers`, `TerminalTTY`.
- [ ] HTTP poll no longer primary; badge driven by WS `data` frames.

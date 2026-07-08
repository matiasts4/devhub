# Design: TUI status — herdr parity

## Technical Approach

Centralize PTY semantic detection in `src/lib/terminal/sessionAgentDetector.js` (name TBD): per-session ring buffer, OSC parsers, `detectAgentState`, `AgentStateMachine`. Sidecar requires a CJS entry (`sidecar-backend/sessionAgentDetector.cjs` generated from ESM or hand-maintained thin wrapper calling shared logic). ttyServer and sidecar call the same `ingestOutput(session, chunk, oscMeta)` API.

## Architecture Decisions

| Decision             | Choice                                               | Rationale                                            |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| D1 Semantic vs bytes | Semantic wins when fresh                             | Matches herdr; avoids spinner false running          |
| D2 Sidecar parity    | Required for v1                                      | Tauri is primary desktop path                        |
| D3 State naming      | `working` → `running` at API boundary                | Existing `PANEL_STATUS` vocabulary                   |
| D6 Display labels    | `idle` shown as **Idle** / **idle** (not _inactivo_) | Align UI with Grok/OpenCode/herdr enum tokens        |
| D4 CJS delivery      | Build script copies/bundles detection package        | Sidecar cannot import ESM manifests at runtime today |
| D5 Viewport rows     | Default 40 lines, env-tunable                        | Bridge until true ghostty-style viewport read exists |

## Data Flow

```
PTY chunk → filter noise → append buffer → extractBottomViewport
          → parse OSC title/progress → detectAgentState → SM.publish
          → if published: session.agentTuiState + WS agent-state
          → TerminalTTY → panelActivityStore / hook → derivePanelStatus
```

## File Changes

| File                        | Action | Description                    |
| --------------------------- | ------ | ------------------------------ |
| `sessionAgentDetector.js`   | Create | Shared ingest + publish        |
| `extractBottomViewport.js`  | Create | Bottom slice helper            |
| `oscProgressParser.js`      | Create | OSC progress for claude rules  |
| `ttyServer.js`              | Modify | Delegate to shared module      |
| `sidecar-backend/server.js` | Modify | Replace regex-primary path     |
| `ruleEngine.js`             | Modify | Missing regions from herdr     |
| `manifests/grok.js`         | Modify | Sync from herdr 2026.07.03.1   |
| `manifests/claude.js`       | Modify | Add osc_progress_idle          |
| `panelStatusHelpers.js`     | Modify | Semantic-first table           |
| `TerminalTTY.jsx`           | Modify | `agent-state` handler          |
| `usePanelAgentStatus.js`    | Modify | Optional live semantic from WS |

## Testing Strategy

| Layer       | What                                                  | How                                    |
| ----------- | ----------------------------------------------------- | -------------------------------------- |
| Unit        | ruleEngine regions, SM publish, extractBottomViewport | Jest fixtures from herdr TOML snippets |
| Unit        | derivePanelStatus arbitration                         | Table-driven conflict cases            |
| Integration | sidecar vs ttyServer same fixture                     | Shared test vectors file               |
| Unit        | grok/claude manifest rules                            | Port herdr manifest test strings       |

## Migration / Rollout

No migration. Feature is behavioral only. Rollback = revert commits.

## Open Questions

- [ ] Single PR vs chained (see tasks forecast) — user decision before apply.
- [ ] Hermes manifest in v1 or v1.1?

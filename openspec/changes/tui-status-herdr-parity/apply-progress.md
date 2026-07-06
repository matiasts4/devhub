# Apply progress: tui-status-herdr-parity

**Work unit 1** (Phase 1 foundation) — branch `feature/terminal-decompose`, chained commits on same branch.

## Completed (batch 1)

| Task                                             | Status |
| ------------------------------------------------ | ------ |
| 1.1 sessionAgentDetector + extractBottomViewport | done   |
| 1.2 oscProgressParser + ruleEngine osc_progress  | done   |
| 1.3 ttyServer ingest refactor                    | done   |
| 1.4 sidecar bundle + server.js wire              | done   |
| 1.5 sessionAgentDetector parity test             | done   |

## Files

- `src/lib/terminal/sessionAgentDetector.js`, `extractBottomViewport.js`, `oscProgressParser.js`, `sidecarAgentDetectionEntry.js`
- `scripts/build-sidecar-agent-detection.mjs`
- `sidecar-backend/bundled/agentDetection.cjs` (generated)
- `sidecar-backend/server.js`, `src/lib/terminal/ttyServer.js`
- Tests: `extractBottomViewport.test.js`, `sessionAgentDetector.test.js`

## TDD

| Task         | RED                           | GREEN  |
| ------------ | ----------------------------- | ------ |
| 1.1 viewport | extractBottomViewport.test.js | impl   |
| 1.5 parity   | sessionAgentDetector.test.js  | ingest |

## Completed (batch 2 — work unit 2)

| Task                                 | Status |
| ------------------------------------ | ------ |
| 2.1 WS agent-state                   | done   |
| 2.2 client store + hook              | done   |
| 2.3 semantic-first derivePanelStatus | done   |
| 2.4 panelStatusHelpers TTAS-S6       | done   |

## Next batch

Phase 3 (manifests grok/claude/regions) — work unit 3 on same branch.

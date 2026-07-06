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

## Completed (batch 3–4)

- Manifest parity (grok 8 rules, claude osc_progress_idle)
- Fixtures + explain script
- Sidecar bundle rebuilt
- verify-report: PASS WITH WARNINGS

## Completed (batch 3–4 — work unit 3)

| Task                                                          | Status |
| ------------------------------------------------------------- | ------ |
| 3.1 osc_progress region (+ deferred herdr regions documented) | done   |
| 3.2 grok manifest 8 rules                                     | done   |
| 3.3 claude osc_progress_idle + oscProgressParser tests        | done   |
| 3.4 fixtures README + compare script doc                      | done   |
| 4.1 explain-agent-detection.mjs                               | done   |
| 4.2 targeted Jest (40+ panel suite)                           | done   |
| 4.3 verify-report.md                                          | done   |

**Checkpoint commit:** WU3–4 (manifests, fixtures, DX, bundle rebuild, `build:sidecar-detection`).

## SDD apply

All implementation tasks complete except optional hermes manifest (cancelled).

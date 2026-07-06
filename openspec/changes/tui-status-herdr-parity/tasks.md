# Tasks: TUI status — herdr parity

## Review Workload Forecast

| Field                   | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| Estimated changed lines | 900–1400                                                                         |
| 400-line budget risk    | High                                                                             |
| Chained PRs recommended | Yes                                                                              |
| Suggested split         | PR1 foundation + sidecar · PR2 UI/WS · PR3 manifests/fixtures                    |
| Delivery strategy       | ask-on-risk                                                                      |
| Chain strategy          | feature-branch-chain (same branch `feature/terminal-decompose`, stacked commits) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                     | Likely PR | Notes                           |
| ---- | -------------------------------------------------------- | --------- | ------------------------------- |
| 1    | Shared detector + sidecar/ttyServer parity               | PR1       | CJS bundle, tests TTHD-S1       |
| 2    | WS `agent-state` + semantic-first UI                     | PR2       | TTHD-S3, TTAS-S6, TerminalTTY   |
| 3    | Manifests (grok/claude/regions) + fixtures + explain dev | PR3       | TTHD-S5, compare script in docs |

## Phase 1: Foundation (shared detector)

- [x] 1.0 Clone `.research/herdr` and manifest compare script
- [x] 1.1 Create `src/lib/terminal/sessionAgentDetector.js` + `extractBottomViewport.js`
- [x] 1.2 Add `oscProgressParser.js` and wire OSC title/progress on session
- [x] 1.3 Refactor `ttyServer.js` to use shared ingest (no behavior regression)
- [x] 1.4 Generate/configure `sidecar-backend` CJS wrapper; wire `server.js` output path
- [x] 1.5 Integration test: shared fixture → same `agentTuiState` (TTHD-S1)

## Phase 2: Transport and UI

- [x] 2.1 Emit `agent-state` WS payload on SM publish (sidecar + ttyServer)
- [x] 2.2 `useTerminalV2Session` + `panelSemanticStateStore` for hook
- [x] 2.3 Update `derivePanelStatus` semantic-first (TTHD-2 / TTAS-S6)
- [x] 2.4 Tests: `panelStatusHelpers.test.js` (TTAS-S6)

## Phase 3: Manifests and regions

- [x] 3.1 Port missing `getRegion` cases from herdr (`osc_progress`, prompt-box variants) — `osc_progress` wired; other herdr regions deferred (see verify-report)
- [x] 3.2 Sync `grok.js` from `.research/herdr/.../grok.toml` + detector tests
- [x] 3.3 Add claude `osc_progress_idle` + parser tests
- [x] 3.4 Add `tests/fixtures/agent-screens/` samples; document compare script in change README

## Phase 4: Verification and DX

- [x] 4.1 Dev route or script `explain-agent-detection` (rule id + region preview)
- [x] 4.2 Run targeted Jest: agentStateDetection, panel\*, sidecar tests
- [x] 4.3 `verify-report.md` via `/sdd-verify tui-status-herdr-parity`

## SDD pipeline status

Planning phases: explore → propose → spec → design → tasks **complete**.  
Apply: **complete** (WU1–2 `97116ba`, WU3–4 stacked on `feature/terminal-decompose`).  
Next: **`/sdd-archive tui-status-herdr-parity`** after user review (verify: PASS WITH WARNINGS).

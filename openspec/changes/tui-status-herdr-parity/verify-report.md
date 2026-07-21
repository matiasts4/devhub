# Verification Report: tui-status-herdr-parity

**Change:** tui-status-herdr-parity  
**Mode:** Standard (strict_tdd: tests written/extended with implementation)  
**Verdict:** PASS WITH WARNINGS

## Completeness

| Artifact          | Status                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| proposal.md       | present                                                                      |
| specs (2)         | present                                                                      |
| design.md         | present                                                                      |
| tasks.md          | 17/17 implementation tasks complete (3.1 herdr regions partial — documented) |
| apply-progress.md | present                                                                      |

## Build / tests (executed)

| Command                                          | Result                         |
| ------------------------------------------------ | ------------------------------ |
| `npx jest` (4 targeted suites, 103 tests)        | PASS                           |
| `node scripts/compare-herdr-manifests.mjs`       | PASS — 5 agents rule ID parity |
| `node scripts/build-sidecar-agent-detection.mjs` | PASS — bundle regenerated      |

Suites:

- `agentStateDetection/__tests__/detector.test.js`
- `sessionAgentDetector.test.js`, `extractBottomViewport.test.js`
- `panelStatusHelpers.test.js`
- `oscProgressParser.test.js` (added; run in full CI via root jest)

## Spec compliance (matrix)

| Requirement              | Scenario | Evidence                                                      |
| ------------------------ | -------- | ------------------------------------------------------------- |
| TTHD-1 unified detection | TTHD-S1  | `sessionAgentDetector.test.js` two sessions                   |
| TTHD-1 blocked           | TTHD-S2  | detector kimi + grok tests                                    |
| TTHD-2 viewport          | TTHD-S3  | `extractBottomViewport.test.js`                               |
| TTHD-3 WS notify         | TTHD-S4  | code: ttyServer + sidecar `agent-state` (no automated WS e2e) |
| TTHD-4 manifests         | TTHD-S5  | compare script grok 8/8                                       |
| TTAS-6 semantic vs bytes | TTAS-S6  | `panelStatusHelpers.test.js`                                  |

## Issues

### WARNING

- **TTHD-S4** — no Playwright/WS integration test for `agent-state` frames (manual/code review only).
- **3.1** — herdr regions `before_current_prompt_marker`, `whole_recent_without_*`, etc. not fully ported (deferred; current manifests pass parity).
- **Hermes manifest** — optional task 3.4 skipped.

### SUGGESTION

- Add `npm run build:sidecar-detection` script in package.json for release checklist.
- E2E badge test with mocked WS `agent-state` payload.

## Design coherence

| Decision             | Implemented                             |
| -------------------- | --------------------------------------- |
| D1 semantic-first UI | yes — `panelStatusHelpers.js`           |
| D2 sidecar parity    | yes — bundled detector                  |
| D3 working→running   | yes — manifests use `running`           |
| D4 CJS bundle        | yes — `agentDetection.cjs`              |
| D5 bottom viewport   | yes — `extractBottomViewport` in ingest |

## Final verdict

**PASS WITH WARNINGS** — core apply complete; archive acceptable after user review of WS e2e gap.

---

## Addendum: Fixes for Kimi Code & Cascading Staleness (2026.07.20)

To resolve issues where agent status was incorrectly displayed as "Inactivo" (idle), we implemented the following corrections:

1. **Cascading Staleness Fix**:
   - Updated `stableVisibleSignalRefreshDue` in `stateMachine.js` to refresh visible working states as well as blocker states.
   - Implemented `tickAgentDetection` in `sessionAgentDetector.js` to periodically refresh stable/pending-idle signals.
   - Wired the tick interval in `ttyServer.js` and `sidecar-backend/server.js` (running every 500ms by default, adjustable via `AGENT_DETECTION_TICK_MS` env) and cleaned up/evicted properly.

2. **Kimi Manifest Expansion**:
   - Added new manifest rules to `manifests/kimi.js` to match the Kimi Code TUI footer (`working_footer_esc_interrupt`, `thinking_progress_working`, and `kimi_idle_prompt`).
   - Extended `detector.test.js` to validate these new rules using realistic screen fixtures.

3. **ANSI Sequence Stripping**:
   - Created a shared `stripAnsi.js` helper and integrated it into `detector.js` and `sessionAgentDetector.js` to clean raw terminal streams (CSIs, erase sequences, DCS/APC/PM/OSC, `\r`) prior to applying manifest checks.

4. **Activity Tracker Integration & apiStatus Staleness**:
   - Updated `useTerminalV2Session.js` to decode base64 terminal append streams and properly pass the decoded characters to the activity tracker.
   - Enforced a 30s freshness constraint on `apiStatus` inside `panelStatusHelpers.js` to prevent stale database states from showing persistent "Running" status.


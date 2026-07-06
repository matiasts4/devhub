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

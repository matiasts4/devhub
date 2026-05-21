## Exploration: Desktop QA plan for multi-agent runs

### Current State

- Playwright E2E already exists in `tests/e2e/` and is configured for trace/screenshot/video capture in `playwright.config.ts` (`playwright-report/`, `test-results/results.json`, `trace: on-first-retry`, failure screenshots/videos).
- The current Swarm/Control Room coverage is mostly smoke-level: `tests/e2e/04_swarm_control.spec.ts` only checks page load, route 5xx, and generic JS crashes.
- Control Room UI coverage is stronger at the unit layer: `src/views/__tests__/SwarmControl.test.jsx`, `src/lib/operations/__tests__/swarmControl.test.js`, and the director-approval route/projection tests cover durable snapshot shape, approval decisions, queue state, and evidence rendering.
- Desktop/runtime smoke exists, but it is split by concern: `scripts/tauri-cli.cjs` hardens `tauri:dev`, `scripts/native-vte-smoke.cjs` runs a standalone native GTK/VTE smoke, and `bin/agenthub-smoke.js` exercises the headless AgentHub flow with JSON reporting and DB/audit-trail checks.
- Evidence already flows durably through local DB tables and projections: `agent_traces`, `agent_hub_sessions`, audit-trail JSON files, `health` snapshot projection, `swarmControl` normalization, and `evidence_timeline`/`approvals` selectors.
- No repo evidence of a PhantomPane-specific integration or QA harness was found.

### Affected Areas

- `tests/e2e/04_swarm_control.spec.ts` — current Swarm smoke is too shallow for dispatcher/approval/recovery coverage.
- `playwright.config.ts` — already provides artifact capture and is the cleanest place to standardize QA output paths.
- `src/views/SwarmControl.jsx` — the current browser seam for Director queue, approvals, workspaces, runs, and evidence timeline.
- `src/lib/operations/swarmControl.js` — read-model normalization seam that QA should assert against, not mutate.
- `scripts/tauri-cli.cjs` / `scripts/native-vte-smoke.cjs` / `bin/agenthub-smoke.js` — existing Linux-first runtime smoke surfaces that can be reused for reproducible QA without product changes.
- `src/lib/db/localDb.js` and `src/lib/operations/health.js` — durable evidence and snapshot authority boundaries.

### Approaches

1. **Add a dedicated multi-agent Playwright QA suite** — extend E2E with a deterministic Control Room scenario matrix for open terminals, dispatch, approvals, recovery, and closure, plus evidence artifacts per step.
   - Pros: lowest runtime impact; uses existing Playwright capture/reporting; reproducible in Linux-first CI.
   - Cons: still needs stable fixtures/seeding and a clear artifact naming contract.
   - Effort: Medium.

2. **Add a small desktop QA runner script around existing smoke flows** — a thin Node script that orchestrates `tauri:dev`/Playwright/agenthub-smoke/native smoke and emits one durable JSON manifest.
   - Pros: centralizes evidence and run metadata; good for operator handoff.
   - Cons: more glue code; risks becoming a mini test platform if scope is not bounded.
   - Effort: Medium.

3. **Build PhantomPane integration now** — wire a new desktop QA surface directly into runtime.
   - Pros: potentially tighter operator workflow.
   - Cons: high coupling, unclear ROI, and it expands runtime logic instead of test harnesses.
   - Effort: High.

### Recommendation

Use **Approach 1** with a tiny amount of supporting harness glue only if needed for artifact naming. The plan should stay read-only and Linux-first: drive the existing Control Room UI through Playwright, reuse the native/headless smoke commands for runtime validation, and persist evidence as test artifacts plus durable run metadata. PhantomPane should remain out of scope unless a separate product requirement proves it is the canonical operator surface.

### Risks

- If QA shares state with runtime logic, it will blur the authority boundary and make failures non-reproducible.
- If evidence paths are ad hoc, runs will be impossible to compare across Linux sessions and CI.
- If the plan tries to cover every control-plane surface, it will turn into a platform rewrite instead of a testable workflow.
- If SW-9.1A recovery semantics are not stable first, QA results will be noisy or misleading.

### Ready for Proposal

Yes — the next step is a narrow proposal for a multi-agent QA matrix, with explicit artifact paths, seeded scenarios, and a separation between browser E2E, native smoke, and durable evidence capture.

# Exploration: SW-9.5A end-to-end demo prompt → handoff

## Current State

The repo already has most of the demo chain as separate durable seams:

- Director prompt intake exists in `src/app/api/agenthub/headless/route.js` and the Mission Kernel / composer path in `src/views/SwarmControl.jsx` + `src/components/control-room/MissionKernelPanel.jsx`.
- Team coordination exists via `devhub-mcp/server.js` `team_tell`, `register_agent`, `update_agent_status`, and task/milestone planning tools.
- Execution/lease/recovery is already durable through `get_next_task`, `claim_next_task`, `renew_task_lease`, `release_task`, and the supervisor loop/state machine in `devhub-mcp/tests/integration/supervisor-loop.test.js`.
- Terminal lifecycle is already modeled by SW-8.4A around durable binding vs runtime evidence.
- Approval authority is already snapshot-first via `src/app/api/agenthub/operations/health/route.js`, `src/lib/operations/swarmControl.js`, and `src/components/control-room/ApprovalsErrorsPanel.jsx`.
- Handoff/claim UI already exists in `src/views/SwarmControl.jsx` and `src/components/control-room/DirectorQueuePanel.jsx`.
- Evidence capture is already covered by `src/app/api/agenthub/sessions/stream/route.js`, `src/app/api/agenthub/traces/persist/route.js` (deprecated), and the mission/evidence timeline projection.

## Existing Coverage That Already Supports the Demo

- **Prompt → durable intent**: `headless/route.js` can accept a prompt and create durable session/tracing work.
- **Prompt → team**: `team_tell.test.js` proves bounded mission messaging, delivery persistence, and binding-aware fanout.
- **Team → terminal/workspace evidence**: `telegram-external-adapter.test.js` and `supervisor-loop.test.js` already prove workspace/run/approval/evidence interplay.
- **Supervisor/approval loop**: `operations/health/route.js` projects approvals, director queue, and evidence timeline from durable truth.
- **UI handoff path**: `SwarmControl.jsx` can render queue, approvals, workspaces, runs, evidence, and submit bounded approval/handoff actions.
- **Operational status**: `opencode/start`, `opencode/stop`, `opencode/status`, and `sessions/stream` cover the live runtime and streaming surfaces needed for a demo run.

## Gaps Remaining

1. **Seeded demo scenario**
   - No single scripted fixture assembles prompt → team creation → workspace/run → approval → QA/handoff in one reproducible path.
   - Need a deterministic seed strategy for project/task/workspace/run/mission IDs.

2. **Demo orchestration script**
   - No dedicated walkthrough runner that sequences the existing endpoints/tools in the right order.
   - Need an acceptance script or test harness that can produce a stable narrative and evidence bundle.

3. **Acceptance checklist**
   - No explicit end-to-end checklist tying user prompt, team creation, terminal open, subtask dispatch, approvals, checks, and PR/handoff readiness.
   - Need visible pass/fail criteria, not just component-level tests.

4. **Evidence capture**
   - Existing evidence is distributed; the demo needs a curated bundle: snapshot JSON, logs, screenshots, and optional recording artifacts.
   - Need a canonical location/path for demo evidence output.

5. **Optional video/screenshot generation**
   - No dedicated automation for Playwright screenshots or a narrated capture of the flow.
   - This is optional, but useful for the acceptance package.

## Best Implementation Candidates

- `src/views/SwarmControl.jsx` — best UI entry for a demo walkthrough and handoff state.
- `src/app/api/agenthub/operations/health/route.js` — best authoritative snapshot seam for assembling demo-ready state.
- `src/app/api/agenthub/headless/route.js` — best prompt intake / session kickoff seam.
- `devhub-mcp/server.js` + `devhub-mcp/tests/integration/*.test.js` — best durable backend primitives and scenario proofs.
- `src/components/control-room/DirectorQueuePanel.jsx`, `ApprovalsErrorsPanel.jsx`, `MissionKernelPanel.jsx` — best visible end-to-end checkpoints.
- `src/app/api/agenthub/opencode/*` and `sessions/stream/route.js` — best runtime/control and live evidence surfaces.

## Dependency Notes

- This should **depend on** SW-9.1A for queue leases / stale recovery, SW-9.2A for team dispatch semantics, SW-9.3A for terminal lifecycle/demo runtime truth, and SW-9.4A for approval / supervisor gating.
- SW-9.5A should **compose** those seams into a reproducible demo package, not duplicate their core contracts.
- If any gap forces new durable truth, that belongs back in the earlier SW-9.x change, not here.

## Recommendation

Build SW-9.5A as a **demo/acceptance harness**: one scripted path, one deterministic seed set, one checklist, one evidence bundle, optional screenshots/video. Keep the platform surface unchanged.

## Non-Goals

- No new orchestration engine.
- No new durable schema for demo-only state.
- No rewrite of queue, terminal, or approval semantics.
- No expansion of the MCP surface beyond what the demo needs.
- No platform-wide video pipeline.

## Ready for Proposal

Yes. The change is ready to propose as an acceptance package layered on top of existing SW-9.x primitives.

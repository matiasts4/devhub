# Specs Index: planning-launch-hardening

> Manifest of every spec file this change introduces. Read in order: prompt/command/dispatch/gate-skip → preflight → event bus.

## New Specs (3)

| Capability              | Path                                                  | Requirements | Scenarios | Purpose                                                                                                                          |
| ----------------------- | ----------------------------------------------------- | ------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `planning-agent-launch` | `specs/planning-agent-launch.md`                      | 5            | 12        | Dedicated planning launch surface: prompt builder, `DEVHUB_PROJECT_ID` env, `update_project`-only close, reliable dispatch, gate skip |
| `agenthub-preflight`    | `specs/agenthub-preflight.md`                         | 5            | 11        | Async preflight (OpenCode + LLM + MCP + context) that blocks the launch on hard errors and surfaces Spanish actionable messages      |
| `terminal-event-bus`    | `specs/terminal-event-bus.md`                         | 2            | 5         | `dispatchPlanningAgentRun` retry loop with bounded `MAX_ATTEMPTS` so late-mounting listeners still receive the run                |

## Total

- **3 spec files** written (3 new; no deltas, no removed specs)
- **12 requirements** total
- **28 scenarios** covering happy paths, error states, retries, warnings, and the gate-skip boundary cases

## Out of Scope (per proposal)

- `swarm-control-launchpad` (mentioned in the proposal as MODIFIED "solo nota"). The proposal confirms the planning skip lives in `handleRunAgent`; `swarm-control-launchpad` keeps the gate. No spec change is needed; the design phase will note this explicitly.
- `docopsPrompts.js` semantics (no change). The planning path uses a separate builder; `enforceDocOpsGateOnLaunchCommand` and `isDocOpsPlanningPrompt` are not modified.
- Project Hub modal (`ProjectHub.jsx`), swarm UI (`SwarmControl.jsx`, `agentLaunchWrapper.js` bus helpers), and the `enqueueSwarmLaunchRequest` path. Out of scope per the delegation doc.
- Redesign of `Planificacion.jsx` UX, modes, or form. The preflight integrates into the existing `handleStartPlanning`; no visual redesign.
- DB schema changes, MCP contract changes, or new OpenCode agent registration.

## Next Phase

`sdd-design` — write the technical design covering:

- File-by-file diff forecast (`buildPlanningLaunchPrompt.js`, `buildPlanningLaunchCommand.js`, `validatePlanningLaunch.js`, `dispatchPlanningAgentRun.js`, `src/app/api/agenthub/llm/status/route.js`)
- TDD ordering aligned with `openspec/config.yaml` `strict_tdd: true` (test first, then implementation)
- Gate-skip site decision (terminal handler vs gate function) with rationale that the handler owns `launchOrigin`
- Chained-PR strategy if the cumulative diff exceeds the D2 = 800 LOC budget (split: builders → preflight → dispatch+skip+docs)
- Acknowledgement signal (or lack thereof) for `dispatchPlanningAgentRun`: keep the recommendation A (retry-queue) and document why option B is deferred

# Tasks: Swarm Director Durable Feed

## Review Workload Forecast

| Field                   | Value                                                    |
| ----------------------- | -------------------------------------------------------- |
| Estimated changed lines | 560-760                                                  |
| Review budget           | 800 lines                                                |
| 400-line budget risk    | High                                                     |
| Chained PRs recommended | Yes                                                      |
| Suggested split         | Single current-branch apply in 3 commit-sized work units |
| Delivery strategy       | single-pr-default                                        |
| Chain strategy          | size-exception                                           |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                             | Likely PR      | Notes                                     |
| ---- | ------------------------------------------------ | -------------- | ----------------------------------------- |
| 1    | Canonical event writes + feed projector core     | Current branch | Schema, events, read-model tests together |
| 2    | Health, SSE, and CLI adapters on shared contract | Current branch | No adapter-specific truth                 |
| 3    | MCP 24-tool boundary + docs/tests                | Current branch | Keep review slices logical, not PR-based  |

## Phase 1: Durable event foundation

- [x] 1.1 RED `src/lib/swarm/__tests__/agentEvents.test.js` and `src/app/api/agenthub/events/__tests__/route.test.js` for `task_completed`/`handoff_ready`, linked IDs, and `binding_missing` visibility.
- [x] 1.2 GREEN `src/lib/db/schema.js` and `src/lib/swarm/agentEvents.js` to admit canonical event types and require projection-ready payload fields.
- [x] 1.3 GREEN `src/app/api/agenthub/events/route.js` to persist normalized linked metadata into `agent_events` and compatible `mission_messages`.

## Phase 2: Director feed read model

- [x] 2.1 RED `src/lib/db/swarmMissions.test.js` for ordered `director_feed`, honest empty state, watermark stability, and metadata-only delivery status.
- [x] 2.2 GREEN `src/lib/db/swarmMissions.js` to add `listMissionDirectorFeedItems()` and extend `getSwarmMissionDirectorSnapshot()` with `director_feed`, `handoff`, and durable watermark inputs.
- [x] 2.3 RED/GREEN `src/lib/db/compactReads.test.js` and `src/lib/db/compactReads.js` for shared `readDirectorFeedSummary()` presenter reused by adapters.

## Phase 3: Adapter wiring

- [x] 3.1 RED create `src/app/api/agenthub/sessions/stream/route.test.js` plus extend `src/app/api/agenthub/operations/health/route.integration.test.js` for shared order and watermark-only-on-durable-mutation.
- [x] 3.2 GREEN `src/app/api/agenthub/operations/health/route.js` and `src/app/api/agenthub/sessions/stream/route.js` to emit durable `director_feed` snapshots/events, never trace-only syntheses.
- [x] 3.3 GREEN `devhub-cli/commands/mission.js` and `devhub-cli/commands/mission.test.js` to print/json the same `director_feed` contract.

## Phase 4: Public contract correction

- [x] 4.1 RED/GREEN `devhub-mcp/tests/integration/tools-list.test.js`, `devhub-mcp/server.js`, `devhub-mcp/tools/tasks.js`, `devhub-mcp/tools/workspaces.js`, and `devhub-mcp/tools/agents.js` to expose only 24 public tools and remove `team_tell` plus runtime mutations from registration.
- [x] 4.2 REFACTOR `devhub-mcp/README.md` and touched feed presenters for one contract vocabulary, then run `npm test` as final strict-TDD guard.

# Delta for swarm-process-lifecycle

## MODIFIED Requirements

### Requirement: REQ-2 — Spawn Coordination — Single Instance Guarantee

The system MUST ensure that only one OpenCode `serve` process runs on port 4153 at any time. If a process is already bound to port 4153, the system MUST adopt it rather than spawn a duplicate. OpenCode durable sessions with `sessionType=opencode-durable` and an `opencodeSessionId` are relaunched via `opencode --session <id>` command-based resume, covered under this adopt-over-spawn guarantee.
(Previously: Same; OpenCode durable session relaunch already covered under REQ-2)

#### Scenario: REQ-2-S2 — Second component detects existing process

- GIVEN an OpenCode serve process is already running on port 4153
- WHEN another component requests the process to start
- THEN no new process is spawned
- AND the existing process is adopted by the process manager
- AND the component receives confirmation the process is ready

#### Scenario: REQ-2-S3 — Orphaned process from previous session detected

- GIVEN a stale OpenCode serve process exists on port 4153 from a crashed session
- WHEN Next.js starts and the process manager initializes
- THEN the manager detects the process via port check and `/health` endpoint
- AND adopts the process instead of killing it
- AND registers it for future cleanup

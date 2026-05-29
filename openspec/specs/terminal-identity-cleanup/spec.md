# Delta for terminal-identity-cleanup

## ADDED Requirements

### Requirement: TIC-1 — Workspace Close Unbinds Terminal Identity State

The system MUST remove all `devhub_agent_runs` entries associated with a workspace when `removeWorkspace` is called. The cleanup MUST occur before the workspace state is removed from React state to prevent stale identity bleeding into new workspaces.

#### Scenario: TIC-S1 — Agent identity removed on workspace close

- GIVEN a swarm workspace with three panels: director, primary, and coder
- WHEN `removeWorkspace(workspaceId)` is invoked
- THEN all `devhub_agent_runs` entries whose `panelId` matches a panel in that workspace are deleted from localStorage
- AND the next new workspace starts with no inherited agent labels in the top bar

#### Scenario: TIC-S2 — Workspace close cleans all panel identities

- GIVEN a workspace with panels `p1`, `p2`, `p3` bound to different agent runs
- WHEN the workspace is closed
- THEN localStorage keys matching `devhub_agent_runs:{p1}`, `devhub_agent_runs:{p2}`, `devhub_agent_runs:{p3}` are removed
- AND no agent identity persists under those panel IDs

### Requirement: TIC-2 — Panel ID Counter Randomized on Init

The system MUST initialize the panel ID counter to a random high value on startup or when the first workspace is created. Newly created panels MUST NOT reuse low-numbered IDs that could collide with stale `devhub_agent_runs` entries from previous sessions.

#### Scenario: TIC-S3 — New panel IDs start high to avoid collision

- GIVEN `panelCounterRef` was previously initialized to low values (p1, p2, ...)
- WHEN a new application session starts or the first workspace is created
- THEN `panelCounterRef` is set to a random value in the range [1000, 10000]
- AND newly created panels receive IDs from this randomized baseline

#### Scenario: TIC-S4 — Stale localStorage entries do not match new panels

- GIVEN a stale `devhub_agent_runs:p3` entry exists from a previous session
- WHEN a new session creates a panel
- THEN the new panel ID is NOT `p3` (counter is randomized out of that range)
- AND the stale entry is never accidentally bound to a live panel

### Requirement: TIC-3 — Restore Binding Requires Explicit Valid Binding

The system MUST distinguish between an explicit restore request and accidental ID reuse when restoring agent identities. A panel ID with a stale `devhub_agent_runs` entry MUST NOT be restored unless the entry's `agentRunId` or `swarmId` is confirmed active in the current runtime snapshot.

#### Scenario: TIC-S5 — Stale entry not restored on new workspace

- GIVEN `devhub_agent_runs:p5` contains an agent identity from a workspace that no longer exists
- WHEN a new workspace is created and a panel receives ID `p5`
- THEN the panel MUST NOT automatically inherit the stale entry
- AND the top bar shows no agent label until an explicit restore binding is established

#### Scenario: TIC-S6 — Explicit restore only if binding is valid

- GIVEN a panel ID `p7` with a `devhub_agent_runs:p7` entry
- AND the entry's `agentRunId` is present in the current `runtimeSnapshot`
- WHEN `restoreSessions()` evaluates panel bindings
- THEN the agent identity is restored to the panel
- OTHERWISE the entry is treated as stale and not restored

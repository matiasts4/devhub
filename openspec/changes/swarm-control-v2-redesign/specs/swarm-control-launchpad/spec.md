# Delta for Swarm Control Launchpad

## ADDED Requirements

### Requirement: Compact Panel Density

The system MUST render each of the six lower panels (AgentsClaims, Workspaces, RunsArtifacts, DirectorQueue, ApprovalsErrors, EvidenceTimeline) within a strict height budget of `max-h-[300px]` with `overflow-y-auto` for bounded scrolling. Panel bodies MUST use `p-2` for row padding and `p-3` for the container. Primary text MUST be `text-xs`, secondary metadata `text-[10px]`. All timestamps MUST use `formatRelativeTime`, all IDs MUST use `truncateId`, and all statuses MUST use `StatusPill`. A reusable `CompactRow` helper in `utils.js` MUST provide the single-line row pattern with status pill, truncated primary label, and optional metadata badges.

#### Scenario: Panel renders within height budget

- GIVEN a panel with 15+ data rows
- WHEN the panel renders
- THEN the panel body height does not exceed 300px
- AND rows scroll within the panel body, not at page level

#### Scenario: CompactRow renders single-line entry

- GIVEN an agent with ID, status, and task title
- WHEN CompactRow renders for that agent
- THEN it shows a StatusPill on the left, truncated ID as primary text, and task title as secondary metadata
- AND the entire row is a single line with `flex items-center gap-2 min-w-0`

#### Scenario: Empty state is compact

- GIVEN a panel with zero data rows
- WHEN the panel renders
- THEN it shows a compact "Sin datos" message
- AND no card-style empty state or large placeholder is rendered

#### Scenario: Timestamps and IDs use utility functions

- GIVEN a run with ISO timestamp and UUID
- WHEN the run renders in any panel
- THEN the timestamp displays as relative time (e.g., "2m ago")
- AND the ID is truncated (e.g., "abc12345…f6789")

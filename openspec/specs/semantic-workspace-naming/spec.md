# Delta for semantic-workspace-naming

## ADDED Requirements

### Requirement: WSN-1 — Swarm Semantic Label Derivation

The system MUST derive a `workspace_label` from swarm metadata for any workspace that has `swarmRole` or `swarmId` present. The label format MUST be `swarm-{role}` when `swarmRole` exists, otherwise `swarm-{index}` using the workspace's index in the swarm roster.

#### Scenario: WSN-S1 — Label uses swarm role when present

- GIVEN a swarm workspace with `swarmRole=primary` and `swarmId=swarm-abc`
- WHEN the workspace label is computed
- THEN the label MUST be `swarm-primary`

#### Scenario: WSN-S2 — Label uses index when role is absent

- GIVEN a swarm workspace with no `swarmRole` but `swarmId=swarm-xyz`
- WHEN the workspace label is computed
- THEN the label MUST be `swarm-0` (or appropriate roster index)

#### Scenario: WSN-S3 — Non-swarm workspace falls back to workspace.name

- GIVEN a workspace with no `swarmRole` and no `swarmId`
- WHEN the workspace label is computed
- THEN the system MUST fall back to `workspace.name`

### Requirement: WSN-2 — Label Used in Panel Name Normalization

The system MUST use `workspace_label` in `panelHelpers.js` workspace name normalization before the `workspace.name` fallback. Panel UI displays and tab labels MUST reflect the semantic label for swarm workspaces, but only when the workspace has an explicit valid binding to a restored swarm/agent context. A newly created workspace without explicit restore binding MUST NOT display a semantic swarm label.

#### Scenario: WSN-S4 — Panel shows semantic label, not raw name

- GIVEN a swarm workspace with `swarmRole=worker` and an active agent run
- WHEN the panel or tab label is rendered
- THEN the displayed name MUST be `swarm-worker`
- AND NOT the raw `workspace.name` value

#### Scenario: WSN-S5 — New workspace without explicit binding stays clean

- GIVEN a new workspace created after closing a swarm workspace
- AND no explicit restore binding exists for this workspace
- WHEN the panel or tab label is rendered
- THEN the system MUST fall back to `workspace.name`
- AND NOT display a stale swarm label from a previously closed workspace

#### Scenario: WSN-S6 — Semantic label only on confirmed active binding

- GIVEN a workspace labeled with semantic name `swarm-director`
- AND the corresponding agent run is no longer in the current `runtimeSnapshot`
- WHEN the workspace is reopened after restart
- THEN the semantic label MUST NOT be displayed
- AND the system falls back to `workspace.name` until a valid binding is confirmed

### Requirement: WSN-3 — SwarmControl Snapshot Includes Naming Metadata

The system MUST write `sessionType` and swarm role/id metadata to the SwarmControl snapshot so that `semanticMetadata.js` can derive labels on restore.

#### Scenario: WSN-S7 — Snapshot preserves naming fields

- GIVEN a swarm workspace with `swarmRole=coordinator`
- WHEN SwarmControl writes the session snapshot
- THEN the snapshot MUST include `sessionType`, `swarmRole`, and `swarmId`
- AND these fields are readable by `semanticMetadata.js` on restore

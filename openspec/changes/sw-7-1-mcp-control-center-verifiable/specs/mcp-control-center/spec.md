# MCP Control Center Specification

## Purpose

Define a verifiable MCP diagnostic surface for UI and operators without creating a second control plane.

## Requirements

### Requirement: Doctor Verification Contract

The system MUST expose `doctor` as a diagnostic snapshot for each MCP client. Each probe MUST report `status` (`healthy`, `degraded`, `unavailable`), `authority` (`durable`, `live`, `configured`), `freshness` (`current`, `stale`, `unknown`), and evidence references. Probe classes MUST cover environment/path, Node/runtime, permissions boundary, DB/connectivity, and tool inventory availability. Missing evidence MUST NOT be reported as healthy.

#### Scenario: Doctor returns verifiable evidence

- GIVEN durable supervisor evidence and live runtime probes are available
- WHEN an operator requests `doctor`
- THEN each probe reports status, authority, freshness, and evidence references
- AND the response identifies why the client is healthy or degraded

#### Scenario: Inventory probe cannot verify live MCP

- GIVEN OpenCode does not expose live inventory metadata
- WHEN `doctor` evaluates tool inventory
- THEN the inventory probe reports `degraded` or `unavailable`
- AND the response cites configured or durable evidence instead of inferred health

### Requirement: List-Tools Authority Contract

The system MUST expose `list-tools` as read-only inventory. Each tool entry MUST include its source authority and evidence source, and MUST distinguish DevHub durable control-plane tools from executor-local or configured-only tools. The system MUST NOT promote Git, worktree, branch, merge, or filesystem verbs as MCP Control Center actions.

#### Scenario: Durable and live tools share one inventory view

- GIVEN DevHub MCP tools are durable and an executor exposes live tools
- WHEN `list-tools` is requested
- THEN the response lists both with explicit authority labels
- AND only DevHub control-plane tools are marked durable authority

#### Scenario: Unsafe verbs remain non-goals

- GIVEN discovered inventory includes filesystem or Git verbs from an executor
- WHEN `list-tools` is rendered in the control center
- THEN those verbs are marked non-control-plane or omitted from safe actions
- AND the response does not imply they are approved MCP control-plane operations

### Requirement: Smoke Verification Boundaries

The system MUST expose `smoke` only for safe read and visibility checks against the shared diagnostic read model and bounded live probes. `smoke` MUST verify observable paths without mutating durable DevHub truth, MUST treat GTK/VTE as optional attach evidence only, and MUST require human approval for any risky or destructive action outside this boundary.

#### Scenario: Smoke verifies safe observability path

- GIVEN the diagnostic read model and safe live probes are reachable
- WHEN `smoke` runs
- THEN it verifies read access, evidence sourcing, and bounded connectivity
- AND it returns pass/fail evidence without changing task, workspace, run, or artifact records

#### Scenario: Attach surface unavailable

- GIVEN GTK/VTE attach support is unavailable for a client
- WHEN `smoke` runs
- THEN attach checks report `unavailable` evidence
- AND the overall result stays diagnostic instead of blocking swarm runtime truth

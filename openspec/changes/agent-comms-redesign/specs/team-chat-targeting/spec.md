# Delta Spec: team-chat-targeting

## Type: DELTA

This delta adds a one-release compatibility shim so that consumers of the legacy `pending_deliveries` table continue to work while the new `team_inbox` bus becomes the durable director-to-worker path. The shim lives in `src/app/api/agenthub/operations/health/route.js` and is removed in the next release.

## ADDED Requirements

### Requirement: `team_inbox` as Primary Inbox Source

The system MUST read from `team_inbox` first when an inbox query is made. The shim MUST fall back to `pending_deliveries` only when `team_inbox` is empty for the queried `(mission_id, to_role)`. This applies to:

- `GET /api/agenthub/operations/health` (the supervisor health view)
- Any `teamTell` JS API consumer that historically read `pending_deliveries`
- The CLI `devhub inbox list` subcommand

#### Scenario: TCT-DELTA-S1 — Health endpoint reads team_inbox

- **Given** mission `m1` has 3 rows in `team_inbox` for `to_role='worker'`
- **When** the supervisor calls `GET /api/agenthub/operations/health?mission_id=m1&role=worker`
- **Then** the response payload's `inbox` array contains the 3 rows from `team_inbox`
- **AND** no rows from `pending_deliveries` are included
- **AND** the response's `inbox_source` field is `"team_inbox"`

#### Scenario: TCT-DELTA-S2 — Shim falls back to pending_deliveries

- **Given** mission `m1` has 0 rows in `team_inbox` for `to_role='worker'`
- **And** mission `m1` has 2 rows in `pending_deliveries` for the same role
- **When** the same health endpoint is called
- **Then** the response includes the 2 rows from `pending_deliveries`
- **AND** `inbox_source` is `"pending_deliveries_legacy"`
- **AND** a `shim_warning` field is set to `"pending_deliveries fallback active; remove after next release"`

#### Scenario: TCT-DELTA-S3 — Mixed rows prefer team_inbox

- **Given** `team_inbox` has 1 row and `pending_deliveries` has 2 rows for the same role
- **When** the health endpoint is called
- **Then** only the `team_inbox` row is returned
- **AND** `inbox_source` is `"team_inbox"`
- **AND** no `shim_warning` is included

### Requirement: Director Writes to `team_inbox`

When the Director (or any role using `_devhub_chat --to <role>`) targets a specific worker, the system MUST write a row to `team_inbox` for that target. The shim MUST also accept the legacy `pending_deliveries` write path for one release window so that any Director-side code that still uses the old `message_deliveries` table works unchanged.

#### Scenario: TCT-DELTA-S4 — Director chat writes both paths

- **Given** Director calls `_devhub_chat "new directive" --to worker`
- **When** the helper writes the row
- **Then** a row exists in `team_inbox` with `from_role='director'`, `to_role='worker'`
- **AND** a row exists in `pending_deliveries` (legacy mirror) with the same body
- **AND** the worker's `_devhub_inbox_check` returns the team_inbox row on bootstrap

#### Scenario: TCT-DELTA-S5 — Worker offline re-injects on bootstrap

- **Given** a row in `team_inbox` for `to_role='worker'`, `consumed_at IS NULL`
- **When** the worker restarts and its bootstrap calls `_devhub_inbox_check`
- **Then** the row is re-injected into the worker's prompt
- **AND** the worker is no longer "offline" after the bootstrap completes
- **AND** the row's `consumed_at` is set

### Requirement: Shim Deprecation Marker

The shim MUST emit a single log line per request when fallback is used: `WARN shim: pending_deliveries fallback active for mission=<id> role=<role>; remove after release X`. The shim MUST be removable by deleting the fallback branch and the corresponding `INSERT INTO pending_deliveries` mirror in `_devhub_chat`. A feature flag `DEVHUB_INBOX_SHIM_DISABLED=true` MUST bypass the shim and force the team_inbox-only path for emergency cutover.

#### Scenario: TCT-DELTA-S6 — Shim warning is logged once per request

- **Given** the shim is active
- **When** a request falls back to `pending_deliveries`
- **Then** exactly one `WARN shim: ...` line appears in the request log
- **AND** the response includes `shim_warning` in its JSON body

#### Scenario: TCT-DELTA-S7 — Feature flag bypasses the shim

- **Given** `DEVHUB_INBOX_SHIM_DISABLED=true` is set in the Director's env
- **When** the Director calls `_devhub_chat "x" --to worker`
- **Then** no row is written to `pending_deliveries`
- **AND** only `team_inbox` is populated
- **AND** a log line `INFO devhub-helper: shim disabled via env flag` is emitted

## MODIFIED Requirements

### Requirement: Existing `team_tell` Behavior (TCT-1 in main spec)

The `team_tell` MCP tool's behavior is unchanged for callers that pass `recipients` and/or `target_role`. Internally, the tool now writes a row to `team_inbox` (the new bus) AND, while the shim is active, a mirror row to `pending_deliveries`. The MCP tool's external contract — the function signature, return type, and error semantics — is unchanged.

(Previously: `team_tell` wrote to `mission_messages` + `message_deliveries` and resolved recipients via `mission_participants`. The bus adds a parallel write path; it does not replace the supervisor API.)

#### Scenario: TCT-DELTA-S8 — `team_tell` signature is stable

- **Given** an existing caller invokes `team_tell({ recipients: ['agent-A'], target_role: 'worker', mission_id: 'm1', body: 'hi' })`
- **When** the tool executes
- **Then** the return value matches the pre-change contract (delivered list, errors, etc.)
- **AND** internally, a row is written to `team_inbox` in addition to the legacy path
- **AND** no caller code needs to change

## REMOVED Requirements

### Requirement: `pending_deliveries` as Sole Inbox Source

(Reason: `pending_deliveries` is the legacy table; `team_inbox` is the new durable bus. After the shim's one-release window, all reads go through `team_inbox` and `pending_deliveries` is no longer queried.)

#### Scenario: TCT-DELTA-S9 — Shim is removed in next release

- **Given** the next release of this codebase
- **When** the shim branch is removed
- **Then** `team_inbox` is the only inbox source
- **AND** any consumer still reading `pending_deliveries` MUST be migrated before that release
- **AND** a regression test asserts no `pending_deliveries` queries remain in the codebase (`grep -r pending_deliveries src/ devhub-mcp/ devhub-cli/ | wc -l` returns 0)

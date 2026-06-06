# Migrations

Forward-only, additive migrations for DevHub. Apply in numeric order.

## Files

| File                            | Purpose                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sql/0001_workspaces.sql`       | Tenancy tables + Postgres RLS policies for `workspaces`, `workspace_members`, `workspace_invitations`, `project_members`, `project_invitations`, `devhub_audit_log`. REQ-TEN-1, REQ-TEN-2.                                                 |
| `sql/0002_tenancy_policies.sql` | RLS for the existing `projects`, `tasks`, `milestones`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots`, `swarm_missions`, `mission_messages`, `operator_inbox`. Adds `workspace_id` column (nullable for legacy data). REQ-TEN-2. |
| `parity/scenarios.json`         | The 12 tenancy scenarios from REQ-TEN-3. Source of truth for the cross-driver parity tests.                                                                                                                                                |

## Invariants

- **Forward-only, additive.** No destructive ALTER on existing rows.
- **Schema is source of truth.** The role hierarchy in REQ-TEN-1 (`owner`, `admin`, `member`, `viewer`) is encoded as a CHECK constraint. The same hierarchy is mirrored in `src/lib/tenancy/policy.js` (the policy module that drives the SQLite `withWorkspaceContext` wrapper). A change to the hierarchy must land in both places and re-run the 12-scenario parity suite.
- **RLS uses a per-request actor.** The driver sets `devhub.user_id` via `set_config('devhub.user_id', ..., false)` before each query. The helper `devhub_is_member(workspace_id)` resolves the actor's membership. RLS reads via this helper; the helper queries `workspace_members` which is intentionally **not** RLS'd so the membership lookup can iterate freely.

## SQLite path

The SQLite path mirrors the same tables via `ensureRuntimeSchema` in `src/lib/db/schema.js`. The membership write path is gated at the application layer (the policy module). The `withWorkspaceContext(actor, workspaceId, fn)` wrapper is the only gate for resource reads/writes on the SQLite path.

## Running the RLS parity harness

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=entreruedas PGPASSWORD=entreruedas PGDATABASE=entreruedas \
  node scripts/rls-harness/runner.js
```

Expected output: 12/12 scenarios passed.

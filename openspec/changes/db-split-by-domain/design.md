# Design: db-split-by-domain

## Technical Approach

Facade-first extraction: pull `core.js` first (singleton + schema), then domain modules in strict leaf-to-root dependency order, then convert `localDb.js` into a pure re-export barrel. `index.js` serves as the forward-compatible barrel for new code. No importer outside `src/lib/db/` is touched.

---

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Barrel shape (`index.js`) | Named re-exports only — no default export | Default + named | CJS consumers use destructuring; default would add indirection without benefit |
| `localDb.js` transition | Stays as forwarding file (re-exports from domain modules) | Replace with `index.js` symlink; delete it | 35 importers use this path — keeping it as the barrel is zero-churn rollback |
| `index.js` purpose | New internal barrel — same shape as `localDb.js` barrel | Single unified barrel | Separates "legacy compat" path from "new code" path; future importers target `index.js` |
| Singleton ownership | `core.js` exclusively; domain modules call `getDb()` from `core.js` | Pass `db` as param everywhere | Matches existing call pattern (`dbOrX` convention); no API signature change |
| Circular-dep guard | `npx madge --circular src/lib/db/` in a pre-commit `lint-staged` check + manual CI step | ESLint `import/no-cycle` | `madge` works on CJS without transform; `eslint-plugin-import` needs resolver config for CJS |
| `makeTableOps` / `LocalQuery` / `tables` placement | `core.js` — they are infrastructure, not domain | Separate `queryBuilder.js` | Keeps the file count down; these are not independently useful outside the db layer |

---

## Extraction Order (dependency graph)

```
core.js                    ← no db/ imports (only pathResolver, agentRunArtifacts)
  └── artifacts.js         ← imports core only
  └── telegram.js          ← imports core only
  └── workspaces.js        ← imports core only
  └── agentRuns.js         ← imports core + (workspaces for resolvePreparationProjectId)
  └── supervisor.js        ← imports core + agentRuns (getAgentRunById in approval logic)
  └── swarmMissions.js     ← imports core + agentRuns + workspaces
  └── observability.js     ← imports core only (traces, sessions, swarm config)
index.js / localDb.js      ← re-export all 8 modules
```

**Rationale**: `agentRuns.js` depends on `workspaces.js` via `resolvePreparationProjectId`. `supervisor.js` calls `getAgentRunById`. `swarmMissions.js` uses workspace and run lookups internally. Extract in this exact order to avoid forward-references.

---

## Singleton Integrity Design

```
pathResolver.js
      │
      ▼
core.js  ──exports──▶  getDb(), closeDb(), ensureRuntimeSchema()
      │
      ▼
domain modules (import { getDb } from './core')
      │
      ▼
index.js / localDb.js (re-export everything)
```

- `_db` variable and `DB_PATH` constant live **only** in `core.js`.
- Domain modules never call `new Database(...)` — they call `getDb()`.
- Jest module cache ensures the singleton is shared across test imports.

---

## Symbol Audit Process (pre-split checklist)

Run before extraction begins:

```bash
# 1. Dump all exports from original localDb.js
node -e "const m = require('./src/lib/db/localDb'); console.log(Object.keys(m).sort().join('\n'))" > /tmp/exports_before.txt

# 2. After split, dump barrel exports
node -e "const m = require('./src/lib/db/index'); console.log(Object.keys(m).sort().join('\n'))" > /tmp/exports_after.txt

# 3. Diff — must be empty
diff /tmp/exports_before.txt /tmp/exports_after.txt
```

Also verify `localDb.js` barrel matches:
```bash
node -e "const m = require('./src/lib/db/localDb'); console.log(Object.keys(m).sort().join('\n'))" > /tmp/exports_compat.txt
diff /tmp/exports_before.txt /tmp/exports_compat.txt
```

**Internal-only functions** (defined but not exported — do not need to appear in barrel):
`listRecentMissionMessages`, `listPendingMessageDeliveriesForMission`, `getTelegramActorMappingByActorId`, `buildTelegramActorId`, `buildTelegramDeliveryKey`, `buildDirectorSnapshotWatermark`, `pickSnapshotFields`, and all other private helpers. These stay private in their domain module.

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/db/core.js` | Create | `getDb`, `closeDb`, `ensureRuntimeSchema`, `buildSelectQuery`, `buildWhere`, `tableExists`, `tableHasColumn`, `makeTableOps`, `LocalQuery`, `tables`, shared constants, `resolveDbArgs` |
| `src/lib/db/workspaces.js` | Create | Workspace CRUD, `buildWorkspaceIntentId`, `validatePrepareAgentWorkspaceIdentity`, `buildPrepareAgentWorkspaceAck`, `prepareAgentWorkspaceLease` |
| `src/lib/db/agentRuns.js` | Create | Agent run CRUD, `createAgentRun`, `updateAgentRunTerminal`, `getAgentRunById`, `listAgentRuns`, `getLatestAgentRunForWorkspace`, `getLatestAgentRunForTask`, `resolveAgentRuntimeBinding` |
| `src/lib/db/artifacts.js` | Create | `appendAgentArtifact`, `listAgentArtifacts`, `getLatestAgentArtifactForRun` |
| `src/lib/db/supervisor.js` | Create | Supervisor snapshots, approval checkpoints, `getLatestTaskComment` |
| `src/lib/db/swarmMissions.js` | Create | Swarm mission CRUD, participants, messages, presence, delivery, director snapshot |
| `src/lib/db/telegram.js` | Create | Telegram actor mapping, intents, delivery receipts, subscriptions, channel snapshot |
| `src/lib/db/observability.js` | Create | Traces, sessions, messages, session hierarchy, swarm config/processes, agent counts |
| `src/lib/db/index.js` | Create | Named re-export barrel — identical surface to `localDb.js` barrel |
| `src/lib/db/localDb.js` | Modify | Replace body (~3,800 lines) with named re-exports from domain modules (~120 lines) |
| `src/lib/db/localDb.test.js` | No change | Tests import from `localDb.js`; barrel preserves all symbols |

---

## Circular Dependency Guard

```bash
# Install once
npm install --save-dev madge

# Run check (add to lint-staged or CI)
npx madge --circular src/lib/db/
```

Add to `package.json` scripts:
```json
"lint:circular": "npx madge --circular src/lib/db/"
```

Enforce in CI alongside existing `lint` step. Zero cycles = pass.

---

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Regression | All existing `localDb.test.js` cases | `npm test` unmodified — barrel re-exports ensure coverage |
| Symbol audit | Export surface identical pre/post split | Node `diff` script above |
| Circular deps | No cycles in `src/lib/db/` | `npx madge --circular` |
| Lint | 0 new ESLint errors | `npm run lint` |

No new test files required. All coverage already exists.

---

## Migration / Rollout

No migration required. Rollback = `git revert` of `src/lib/db/`. No other files touched.

---

## Open Questions

- [ ] `AGENT_WORKSPACE_BASE_COMMIT` constant — goes in `core.js` (currently exported from `localDb.js`). Confirm this is the right owner vs. `workspaces.js`. Recommendation: `core.js` since it's a shared baseline constant.
- [ ] `tables` / `LocalQuery` / `from()` — treat as query-builder infrastructure → `core.js`. Confirm acceptable (alternative: `queryBuilder.js` sub-module).

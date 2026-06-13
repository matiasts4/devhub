# Audit Report: DevHub MCP Server

**Audited**: 2026-05-30
**Auditor**: Workflow — 3 sub-agents, 208k tokens
**Status**: 🟠 Issues found

---

## Files Analyzed

| File                                   | Purpose                                             |
| -------------------------------------- | --------------------------------------------------- |
| `devhub-mcp/server.js`                 | Main MCP server — 24 tools via StdioServerTransport |
| `devhub-mcp/tools/projects.js`         | Project management tools                            |
| `devhub-mcp/tools/tasks.js`            | Task management tools                               |
| `devhub-mcp/tools/workspaces.js`       | Workspace lifecycle tools                           |
| `devhub-mcp/tools/inbox.js`            | Operator inbox tools                                |
| `devhub-mcp/tools/operate.js`          | Agent operation tools                               |
| `devhub-mcp/tools/schemas/common.js`   | Shared schema utilities                             |
| `src/lib/mcp/control-center.js`        | Diagnostic snapshots, tool safety classification    |
| `src/app/api/mcp/connections/route.js` | MCP connections CRUD API                            |
| `src/app/api/mcp/engram/route.js`      | Engram MCP proxy endpoint                           |
| `src/lib/sdd/engramSync.js`            | Engram MCP sync module                              |

---

## 🔴 CRITICAL — BUG: `.sort()` Return Value Misuse

**File**: `devhub-mcp/tools/tasks.js`, line ~875

```javascript
const activeTask = db.prepare('...').all(...).filter(...).sort(...)[0];
```

`.sort()` **modifies the array in-place and returns the sorted array** — it does not return a separate array. The chaining is technically correct in JavaScript (sort returns the same array, now sorted), but the intent is fragile. More critically, if the intent was to avoid mutating the original filtered array, this code does mutate it.

**Impact**: Low — sort returns the same array reference, so `[0]` works as expected. But if `.filter()` returns an empty array, `.sort()` on an empty array returns `[]` and `[0]` is `undefined` — silent failure.

---

## 🔴 CRITICAL — BUG: Supabase Inbox Path Not Implemented

**File**: `devhub-mcp/tools/inbox.js`

Both inbox tools return:

```javascript
err('Supabase driver not implemented for operator_inbox');
```

If `DB_DRIVER=supabase`, inbox tools **always fail**. The Supabase path is stubbed out, not implemented.

**Impact**: Inbox features completely unavailable for Supabase deployments.

---

## 🔴 CRITICAL — BUG: PROCEED = "No Executor Wired"

**File**: `devhub-mcp/tools/operate.js`, line ~86-87

```javascript
// when routeDispatch returns PROCEED:
result = { status: 'PROCEED', action_id, note: 'action allowed (no executor wired yet)' };
```

Actions always "succeed" without actually executing. The `note` field says "no executor wired yet" — meaning the action never actually runs, but the caller receives a success-like response.

**Impact**: High — `devhub_operate` always succeeds without executing. If a caller checks `result.status === 'PROCEED'` and treats it as success, they are misled about whether the action actually ran.

---

## 🟠 High — Port Mismatch Between Routes

**File**: `src/app/api/agenthub/mcp/status/route.js` vs `src/app/api/mcp/engram/route.js`

```javascript
// /api/agenthub/mcp/status — default port 4153:
const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4153;

// /api/mcp/engram — default port 4154:
const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4154;
```

If `OPENCODE_PORT` is unset, the two routes probe **different ports** on the same OpenCode server. Status checks hit 4153, engram proxy calls 4154.

**Fix**: Unify to a single port constant.

---

## 🟡 Medium — No Authentication Forwarding on Engram Proxy

**File**: `src/app/api/mcp/engram/route.js`

The route proxies tool calls to OpenCode but does not forward auth credentials, session context, or project ID. OpenCode's MCP endpoint likely needs DevHub authentication context to properly attribute and authorize tool calls.

**Impact**: Tool calls to OpenCode may be unauthenticated or attributed to wrong project.

---

## 🟡 Medium — No Health Check Endpoint

No `ping`/`pong` or equivalent health check in the MCP server. Cannot verify the server is alive without calling a full tool.

---

## 🟡 Medium — Transport Layer Limited to StdioServerTransport

Only `StdioServerTransport` is available. No HTTP or WebSocket transport for remote clients.

---

## 🟡 Medium — SqliteQueryAdapter.selectRows() Ignores selectFields

**File**: `devhub-mcp/tools/schemas/common.js`, line ~172

The `selectRows()` method ignores the `selectFields` parameter — it passes `select` to `tableOps.select` but the WHERE clause is built as raw tuples instead of proper query builder format.

---

## Architecture Strengths

- **24-tool contract** fully documented and smoke-tested
- **Dual-driver architecture** (SQLite/Supabase) with clean adapter layer
- **Bulk operations idempotent** by title via `seenTitles` dedup
- **Git checkpoint gate** enforced before task completion
- **Graceful fallbacks** in operate.js — tries adapter-boundary, then intent-router, then reports uninitialized
- **Test harness** uses isolated temp DB per run

---

## Recommendations

1. **Fix PROCEED executor stub** — either implement the executor or return a distinct error status
2. **Implement Supabase inbox** or document it as out-of-scope
3. **Unify OPENCODE_PORT** across all routes
4. **Add auth forwarding** to Engram proxy route
5. **Add ping/pong** health check tool
6. **Fix `.sort()[0]`** to use `[...filtered].sort()[0]` to avoid mutating source
7. **Add HTTP/WebSocket transport** for remote MCP clients

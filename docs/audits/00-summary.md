# DevHub Codebase Audit — Summary

**Date**: 2026-05-30
**Scope**: 5 domains audited in parallel (SWARM, MCP, CLI, Pizarra, Sed)
**Tokens consumed**: ~1M across all workflows
**Workflow count**: 5 parallel workflows, 17 sub-agents

---

## Audit Results at a Glance

| Domain      | Status                       | Critical Bugs | Medium Issues |
| ----------- | ---------------------------- | ------------- | ------------- |
| **SWARM**   | ✅ Done                      | 1             | 4             |
| **MCP**     | ✅ Done — **first priority** | 4             | 3             |
| **CLI**     | ✅ Done (deferred)           | 4             | 6             |
| **Pizarra** | ✅ Done                      | 3             | 3             |
| **Sed**     | ⚪ Not Found                 | 0             | 0             |
| **Zed**     | ✅ Done                      | 2             | 4             |

---

## Critical Bugs Requiring Immediate Attention

### 1. SWARM — Reactivation contract interpolation broken

`{{mission_id}}` and `{{session_id}}` appear as **literal text** in reactivation prompts. Agents reactivating from checkpoint **lose their mission/session context**.

**File**: `src/lib/sdd/SwarmPromptEngine.js`
**Fix**: Call `interpolate()` on `contract.reactivationContract` before injecting into section.

---

### 2. Pizarra — Multi-select transformer broken

Each shape's ref callback calls `transformerRef.nodes(node)` which **overwrites** the array instead of appending. Only the last selected shape gets transform anchors.

**File**: `src/components/pizarra/PizarraCanvas.jsx`
**Fix**: Remove per-renderer ref callbacks that overwrite nodes; rely on parent's `useEffect` node mapping.

---

### 3. Pizarra — Circle creation puts center at start point

`x: startX, y: startY` sets the **start corner** as the circle center instead of the **midpoint of the drag**. User drags corner-to-corner but circle ends up at origin.

**File**: `src/components/pizarra/PizarraCanvas.jsx`
**Fix**: `x: (startX + pos.x) / 2, y: (startY + pos.y) / 2` for center.

---

### 4. Pizarra — No live preview during drawing

`handleMouseMove` does nothing when `drawing`. User cannot see the shape being created until mouseup.

**File**: `src/components/pizarra/PizarraCanvas.jsx`
**Fix**: Update preview shape state in `handleMouseMove`.

---

### 5. MCP — `operate.js` PROCEED status means "no executor wired"

Actions return `{status: 'PROCEED', note: 'no executor wired yet'}` — the action "succeeds" without actually executing. Callers are misled about whether the action ran.

**File**: `devhub-mcp/tools/operate.js`
**Fix**: Either implement the executor or return a distinct error status.

---

### 6. MCP — Supabase inbox path not implemented

Both inbox tools return `err('Supabase driver not implemented for operator_inbox')`. Inbox completely unavailable for Supabase deployments.

**File**: `devhub-mcp/tools/inbox.js`
**Fix**: Implement Supabase path or document as out-of-scope.

---

### 7. MCP — Port mismatch 4153 vs 4154

Status endpoint probes port 4153, engram proxy calls 4154 — different ports for same server.

**Files**: `src/app/api/agenthub/mcp/status/route.js`, `src/app/api/mcp/engram/route.js`
**Fix**: Unify to single port constant.

---

### 8. CLI — Presence tautology `args[0] === 'list' ? 'list' : 'list'`

Always returns `'list'`, no other subcommand possible.

**File**: `src/components/.../presence.js`
**Fix**: `args[0] || 'list'`.

---

### 9. CLI — Network errors throw instead of returning error object

`httpClient.js` throws `Error` on network failures instead of returning `{status, data, error}`. Callers crash.

**File**: `bin/agenthub-*/httpClient.js`
**Fix**: Return `{status: 0, error: string, data: null}` instead of throwing.

---

### 10. CLI — `setInterval` never cleared on shutdown

`events.js` polling interval keeps running after SIGINT/SIGTERM — process doesn't exit cleanly.

**File**: `bin/agenthub-*/events.js`
**Fix**: Add SIGINT/SIGTERM handlers calling `clearInterval`.

---

## Current Focus

**MCP is the first priority for fixes** (2026-05-30). See [02-mcp.md](./02-mcp.md).

CLI will be addressed by a separate agent. Pizarra and SWARM are lower priority for now.

Zed agent audit completed — see [06-zed.md](./06-zed.md).

---

## Audit Scope

| Domain      | Status                            | Report                                        |
| ----------- | --------------------------------- | --------------------------------------------- |
| **MCP**     | ✅ Done                           | [02-mcp.md](./02-mcp.md) — **first priority** |
| **CLI**     | ✅ Done (deferred to later agent) | [03-cli.md](./03-cli.md)                      |
| **Zed**     | ✅ Done                           | [06-zed.md](./06-zed.md)                      |
| **SWARM**   | ✅ Done                           | [01-swarm.md](./01-swarm.md)                  |
| **Pizarra** | ✅ Done                           | [04-pizarra.md](./04-pizarra.md)              |
| **Sed**     | ✅ Done (not found)               | [05-sed.md](./05-sed.md)                      |

## MCP Critical Bugs — First Priority

1. **`operate.js` PROCEED = "no executor wired"** — actions succeed without executing
2. **Supabase inbox path not implemented** — inbox unavailable on Supabase deployments
3. **Port mismatch 4153 vs 4154** — status and engram routes probe different ports
4. **`.sort()[0]` on empty array** — `activeTask` could be `undefined` at runtime

---

## Sed Agent Note

**No "Sed" agent exists in the codebase.** This was likely a planned but never-implemented agent. See [05-sed.md](./05-sed.md) for details.

---

## Audit Reports

- [01-swarm.md](./01-swarm.md) — Full SWARM audit
- [02-mcp.md](./02-mcp.md) — Full MCP audit (first priority)
- [03-cli.md](./03-cli.md) — Full CLI audit (deferred)
- [04-pizarra.md](./04-pizarra.md) — Full Pizarra audit
- [05-sed.md](./05-sed.md) — Sed agent (not found)
- [06-zed.md](./06-zed.md) — Zed agent audit

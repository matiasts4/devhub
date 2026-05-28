# AUDITOR REPORT — RESUME-SWARM Feature Delivery
**Date:** 2026-05-23
**Auditor:** QA Agent (Architect role)
**Scope:** Runtime diagnostics endpoint, swarm launch system, swarm-related code quality

## Files Audited
1. `src/app/api/swarm/runtime-diagnostics/route.js` (134 lines)
2. `src/components/TerminalWorkspacesManager.jsx` (3823 lines)
3. `src/components/terminal/hooks/useSwarmLaunchController.js` (426 lines)
4. `src/lib/swarm/processManager.js` (598 lines)
5. `src/lib/agentRegistryLive.js` (256 lines)

## Issue Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| P0 (Critical) | 1 | Duplicate `persistAgentRunMetadata` with data loss |
| P1 (High) | 4 | Duplicate code, race condition, counter mutation, no-op function |
| P2 (Medium) | 3 | Missing error handling, async fire-and-forget, no input validation |
| P3 (Low) | 3 | Test suite failures, missing lint errors, minor code quality |

**Total: 11 issues**

---

## P0 — Critical Issues

### P0-1: Duplicate `persistAgentRunMetadata` — Data Loss Risk

**Files:** `TerminalWorkspacesManager.jsx:2153` vs `useSwarmLaunchController.js:196`

The function is duplicated in two places with **different signatures and different data tracked**:

| Field | Manager version | Hook version |
|-------|----------------|--------------|
| `workspacePath` | NOT tracked | Tracked |
| `actualWorkspacePath` | NOT tracked | Tracked |
| `workspaceId` | NOT tracked | Tracked |
| `runId` | NOT tracked | Tracked |
| `sessionId` | NOT tracked | Tracked |
| `evidenceRef` | NOT tracked | Tracked |
| `workspaceVerified` | NOT tracked | Tracked |
| `panelCwd` param | NOT accepted | Accepted (4th param) |

**Impact:** When swarm launches from the manager (via `devhub:run-agent` event, line 2880), the manager's version is called — losing workspace verification data. When launched from the hook's `createWorkspaceForSwarmLaunchRequests` (line 372), the hook's richer version is used. This creates **inconsistent metadata** depending on launch path.

**Recommendation:** Extract a single shared implementation to `src/components/terminal/utils/agentRunMetadata.js` and import from both consumers. The hook version is the correct one (tracks workspace verification).

---

## P1 — High Issues

### P1-1: Duplicate `shortenCommandSummary` — 3 copies

**Files:**
- `TerminalWorkspacesManager.jsx:483`
- `useSwarmLaunchController.js:421`
- `src/components/terminal/utils/semanticMetadata.js:55`

Identical function in 3 places. Any bugfix or behavior change must be applied 3x.

**Recommendation:** Keep single copy in `semanticMetadata.js`, export, import everywhere.

### P1-2: Duplicate `buildSwarmRoleMetadata` — 2 copies

**Files:**
- `TerminalWorkspacesManager.jsx:312`
- `src/components/terminal/utils/swarmRoleMeta.js:58`

The hook correctly imports from `swarmRoleMeta.js` (line 11), but the manager defines its own copy. Both implementations appear identical but drift risk is real.

**Recommendation:** Manager should import from `swarmRoleMeta.js` instead of defining inline.

### P1-3: Race condition in swarm launch flush mechanism

**File:** `useSwarmLaunchController.js:396-403` and `TerminalWorkspacesManager.jsx:2314-2321`

```js
const enqueueSwarmLaunchRequest = useCallback(
  (request) => {
    pendingSwarmLaunchRequestsRef.current.push(request);
    if (swarmLaunchFlushTimerRef.current) return;
    swarmLaunchFlushTimerRef.current = window.setTimeout(flushPendingSwarmLaunchRequests, 0);
  },
  [flushPendingSwarmLaunchRequests]
);
```

The `setTimeout(..., 0)` batches requests in a single microtask, but:
- If two `devhub:run-agent` events fire in rapid succession (e.g., from `handleTerminalSwarmLaunch` dispatching multiple `runtime_requests`), both push to the ref before flush fires — this is **correct** behavior.
- However, if a flush is in progress (React setState is async) and a new request arrives, the timer is already cleared, so a **new timer is set** — potentially creating a second workspace while the first is still being rendered.

**Impact:** Rapid swarm launches could create overlapping workspaces with counter collisions.

**Recommendation:** Add a `flushingRef` flag to prevent concurrent flushes:
```js
const flushingRef = useRef(false);
const flushPendingSwarmLaunchRequests = useCallback(() => {
  if (flushingRef.current) return;
  flushingRef.current = true;
  // ... existing logic ...
  flushingRef.current = false;
}, [...]);
```

### P1-4: Counter mutation outside React setState

**File:** `useSwarmLaunchController.js:299-325` and `TerminalWorkspacesManager.jsx:2231-2253`

```js
wsCounterRef.current += 1;           // Mutated BEFORE setState
const newWsId = `ws${wsCounterRef.current}`;
// ...
colCounterRef.current += 1;          // Mutated inside .map() callback
// ...
panelCounterRef.current += 1;        // Mutated inside nested .map()
```

Counters are mutated synchronously before React's setState is called. If React batches or defers the state update, a re-render could read stale counters. Also, mutations inside `.map()` callbacks are side effects in a pure function context.

**Impact:** Panel/column IDs could collide if multiple swarm launches interleave.

**Recommendation:** Calculate all needed IDs first, then mutate counters once, then setState:
```js
const neededPanels = launchRequests.length;
const panelStart = panelCounterRef.current;
panelCounterRef.current += neededPanels;
// Use panelStart + index for IDs
```

### P1-5: `syncActiveWindowSnapshot` is a no-op in the hook

**File:** `useSwarmLaunchController.js:262-265`

```js
const syncActiveWindowSnapshot = useCallback((wsId, columns, nextActivePanelId = null) => {
  // This needs setWorkspaceWindows and activeWindowIds from orchestrator
  // For now, this is a placeholder — the orchestrator will handle this
}, []);
```

The hook exports this as a no-op but the manager's version (line 1915) actually does work. The hook's `createWorkspaceForSwarmLaunchRequests` doesn't call it, but the manager's version does (line 2298). This creates **inconsistent window synchronization** between the two launch paths.

**Recommendation:** Either implement the hook version or remove the placeholder and document that the orchestrator handles it.

---

## P2 — Medium Issues

### P2-1: Missing error handling in `handleTerminalSwarmLaunch`

**File:** `useSwarmLaunchController.js:144-194` and `TerminalWorkspacesManager.jsx:1576-1626`

```js
const payload = await response.json();  // Can throw if response is not JSON
```

If the server returns a non-JSON error response (e.g., 502 HTML), `response.json()` throws and the catch block shows a generic error. The code also dispatches `devhub:run-agent` events without validating the request structure:
```js
(payload.launch_result?.runtime_requests || []).forEach((request) => {
  window.dispatchEvent(new window.CustomEvent('devhub:run-agent', { detail: request }));
});
```

**Recommendation:** Add response content-type check and validate request structure before dispatch.

### P2-2: `persistAgentRunMetadata` called with `forEach` — async fire-and-forget

**File:** `TerminalWorkspacesManager.jsx:2300-2302`

```js
panelAssignments.forEach(({ request, panelId }) => {
  persistAgentRunMetadata(request, panelId, request.commandToRun);
});
```

`persistAgentRunMetadata` is `async` but called without `await` inside `forEach`. DB write failures are silently swallowed by the catch block. If localStorage write succeeds but DB fails, metadata is inconsistent.

**Recommendation:** Use `Promise.allSettled` with proper error logging:
```js
await Promise.allSettled(
  panelAssignments.map(({ request, panelId }) =>
    persistAgentRunMetadata(request, panelId, request.commandToRun)
  )
);
```

### P2-3: No input validation on swarm launch requests

**File:** `useSwarmLaunchController.js:268-277` and `TerminalWorkspacesManager.jsx:2201-2209`

```js
const commandToRun = enforceDocOpsGateOnLaunchCommand(
  request.command || `opencode --agent ${request.selectedAgent || 'sdd-orchestrator'}`
);
```

The `request.selectedAgent` value is interpolated directly into a shell command without sanitization. While `enforceDocOpsGateOnLaunchCommand` adds a prefix, a malicious `selectedAgent` value like `"; rm -rf / #` could still cause issues if the gate function doesn't properly escape.

**Recommendation:** Validate `selectedAgent` against a whitelist of known agent names before interpolation.

---

## P3 — Low Issues

### P3-1: Test suite has native module compilation failures

Running `npm test -- --testPathPattern="swarm"` shows:
- 4 test suites failed to run (better-sqlite3 compiled against wrong Node version)
- 1 test failed out of 234 total
- ESM/CJS compatibility issues in some test files

**Impact:** Swarm-related tests cannot validate correctness on this environment.

### P3-2: Lint errors exist in codebase (not swarm-specific)

`npm run lint` shows 15+ errors across the codebase (unused variables, no-redeclare, no-undef). None are in the audited swarm files specifically, but the overall codebase health is degraded.

### P3-3: `handleRunAgent` event handler destructures without validation

**File:** `TerminalWorkspacesManager.jsx:2865-2866`

```js
const { taskId, command, selectedAgent, launchOrigin, promptSummary, taskTitle } = e.detail;
```

If `e.detail` is undefined or null, this throws. The event is dispatched from two places: `handleTerminalSwarmLaunch` (validated) and external sources (unvalidated).

---

## Verification Results

### Runtime Diagnostics Endpoint — READ-ONLY: CONFIRMED

`src/app/api/swarm/runtime-diagnostics/route.js`:
- Only exports `GET` handler (line 84)
- No POST/PUT/DELETE/PATCH handlers
- No database writes (only `readDatabaseRows` with `select`)
- File operations are all reads (`fs.existsSync`, `fs.readFileSync`, `fs.readdirSync`)
- **Verdict: Truly read-only endpoint**

### Swarm Launch Creates Panels in Correct Workspace: CONFIRMED (with caveats)

The swarm launch flow:
1. `handleTerminalSwarmLaunch` (or `devhub:run-agent` event) triggers launch
2. `createWorkspaceForSwarmLaunchRequests` creates a NEW workspace with `wsCounterRef.current + 1`
3. Panels are created with `cwd: request.workspacePath || cwd` — uses request's workspace path or falls back to manager's cwd
4. `setActiveWsId(newWsId)` switches to the new workspace
5. `setActivePanelIds` sets the director panel (or first panel) as active

**Caveat:** The workspace path verification (`workspaceVerified` field) is only tracked in the hook's `persistAgentRunMetadata`, not the manager's. If launched via the manager's event handler, workspace path is not verified against the actual panel cwd.

---

## Recommendations Priority Order

1. **P0-1:** Unify `persistAgentRunMetadata` — single source of truth, use hook's richer version
2. **P1-1, P1-2:** Deduplicate `shortenCommandSummary` and `buildSwarmRoleMetadata`
3. **P1-3:** Add flush guard to prevent concurrent swarm launches
4. **P1-4:** Pre-calculate IDs before counter mutation
5. **P2-1:** Add response validation in `handleTerminalSwarmLaunch`
6. **P2-2:** Use `Promise.allSettled` for async metadata persistence
7. **P2-3:** Whitelist-validate `selectedAgent` before command interpolation
8. **P3-1:** Fix test environment (native module rebuild)

## Conclusion

The swarm launch system is **functionally correct** — panels are created in the right workspace with proper role ordering and director placement. The runtime diagnostics endpoint is safely read-only.

However, the **code duplication between the manager and hook is the most critical issue**. Two different `persistAgentRunMetadata` implementations tracking different metadata fields creates a data integrity risk that compounds over time. This should be addressed before any production release.

The race condition in the flush mechanism (P1-3) is unlikely to manifest in normal usage but could cause issues under rapid successive launches or automated testing scenarios.

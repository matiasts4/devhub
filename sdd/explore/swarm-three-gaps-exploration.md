## Exploration: DevHub Swarm — 3 Remaining Plyrium-Style Gaps

### Current State

DevHub Swarm already implements worktree management (`agentWorkspaceManager.js`), reconciliation (`reconciliation.js`), process lifecycle (`processManager.js`), agent launch wrappers (`agentLaunchWrapper.js`), and serialized DB writes (`writeQueue.js`). However, three low-priority gaps remain when compared against Plyrium-style operational robustness:

1. **No worktree manifest file** — reconciliation and listing always shell out to `git worktree list --porcelain`.
2. **No file locks with TTL** — DB writes are serialized via `withDbWriteQueue`, but there is no file-based locking for concurrent worktree or manifest operations.
3. **No token-optimized command shims** — agent commands run directly without output interception or context-marker prefixing.

---

### Gap 1: Worktree Manifest File

#### What EXISTS

- `agentWorkspaceManager.js` exports `listLaunchWorktrees(repoRoot, launchId)` and `listAllDevHubWorktrees(repoRoot)`.
- Both functions call `git worktree list --porcelain` on **every invocation**, then filter by path prefix.
- `reconciliation.js` uses `getDiskWorktrees()` which also shells out to `git worktree list --porcelain` on every startup/reconcile.
- The DB (`agent_workspaces` table) stores `worktree_path`, `branch_name`, `observed_head`, etc., but this is the _metadata_ layer, not a fast-reconcile manifest.
- The `.devhub/worktrees/` directory is the on-disk layout, but there is **no `manifest.json`** or equivalent.

#### What is MISSING

- A `.devhub/worktrees/manifest.json` (or similar) that caches the current worktree list, branch mappings, heads, and last-updated timestamps.
- A manifest writer that updates the file atomically whenever worktrees are created/removed.
- A manifest reader that reconciliation and listing can use instead of shelling out to git.

#### Affected Areas

- `src/lib/swarm/agentWorkspaceManager.js` — add `writeManifest` / `readManifest` helpers.
- `src/lib/swarm/reconciliation.js` — replace `getDiskWorktrees()` shell-out with manifest read + optional git fallback.
- `src/lib/db/localDb.js` — optional: store manifest path in `agent_workspaces` metadata.

#### Approaches

| Approach                     | Description                                                                                                                       | Pros                                                   | Cons                                           | Effort |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------- | ------ |
| **A. JSON manifest**         | Write `.devhub/worktrees/manifest.json` on every worktree mutation. Reconcile reads it first, falls back to git if stale/missing. | Simple, human-readable, fast reads                     | Must keep in sync; stale if crash during write | Low    |
| **B. SQLite manifest table** | Add a `worktree_manifest` table in local DB.                                                                                      | Same transaction as workspace update; no separate file | DB read still required; doesn't avoid DB query | Low    |
| **C. Hybrid (A + B)**        | Keep JSON for fast reconcile, but write it inside the same DB transaction via a trigger or helper.                                | Fast + consistent                                      | More complexity                                | Medium |

#### Recommendation for Gap 1

**Approach A (JSON manifest)**. Reconciliation is a startup/periodic operation, not a hot path. The cost of `git worktree list --porcelain` is acceptable for now. The manifest is a nice optimization but not critical. **Defer** until reconciliation latency becomes a problem (e.g., >50 worktrees).

#### Risks

- Stale manifest after unclean shutdown.
- Additional file to clean up when worktrees are removed.
- No significant performance issue today; premature optimization.

---

### Gap 2: File Locks with TTL

#### What EXISTS

- `src/lib/db/writeQueue.js` implements `withDbWriteQueue`, which serializes all DB writes through a single async queue. This prevents `SQLITE_BUSY` from concurrent DB access.
- `processManager.js` uses a PID file (`data/.opencode_4154.pid`) for the OpenCode server process, with `savePid`, `readPidFile`, `removePidFile`. It checks `isProcessRunning(pid)` before adoption.
- `agentWorkspaceManager.js` has idempotent worktree creation (`prepareAgentWorktree`) that checks `worktreeExists()` before creating.

#### What is MISSING

- No `flock` (or Node `fs-ext` / `proper-lockfile`) usage on the manifest file, worktree directory, or PID file.
- No `.lock` files with TTL / stale-detection for concurrent worktree operations.
- If two `prepareAgentWorktree` calls race for the same launch+role, both could pass the `worktreeExists` check before either creates it.

#### Concurrent Access Scenarios

1. **Multiple `prepareAgentWorktree` calls** for the same launch+role (e.g., rapid retry after failure).
2. **Reconciliation running while `removeAgentWorktree` is executing**.
3. **Two agents claiming the same workspace** (mitigated by DB unique indexes on `agent_workspaces`, but not at the file level).
4. **Manifest read/write race** (if Gap 1 is implemented).

#### Approaches

| Approach                | Description                                                                                                | Pros                               | Cons                                               | Effort |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- | ------ |
| **A. proper-lockfile**  | Use `proper-lockfile` npm package on `.devhub/.lock` with `stale: 5000` and `updateInterval: 1000`.        | Well-tested, TTL/stale built-in    | Extra dependency                                   | Low    |
| **B. Custom lock file** | Write `.devhub/worktrees/<launch-id>/.lock` with PID + timestamp; readers check PID + TTL.                 | Zero deps, simple                  | Must implement stale detection yourself            | Low    |
| **C. DB-as-lock**       | Rely on SQLite partial unique indexes (`idx_agent_workspaces_active_worktree`) as the lock. Already works. | Already implemented, transactional | Doesn't protect file ops (mkdir, git worktree add) | None   |

#### Recommendation for Gap 2

**Defer**. The DB unique indexes (`idx_agent_workspaces_active_worktree`, `idx_agent_workspaces_active_branch`, `idx_agent_workspaces_active_owner`) already enforce mutual exclusion at the data layer. `withDbWriteQueue` serializes writes. The only unprotected window is the brief gap between `worktreeExists()` and `git worktree add`, which is extremely narrow. If race conditions are observed in production, implement **Approach A** (`proper-lockfile`) around `prepareAgentWorktree` and `removeAgentWorktree`.

#### Risks

- Rare race condition creating duplicate worktrees for the same launch+role.
- File-system operations (mkdir, git worktree add) are not atomic with DB inserts.
- If Gap 1 (manifest) is implemented without locks, manifest corruption is possible.

---

### Gap 3: Token-Optimized Shims

#### What EXISTS

- `agentLaunchWrapper.js` generates a bash script that exports env vars, verifies identity, sends a signed heartbeat, and then runs `innerCommand` directly.
- `processManager.js` spawns `opencode serve` directly with `spawn(local.cmd, local.args)`.
- `agentWorkspaceManager.js` uses `spawnSync` for git operations.

#### What is MISSING

- No binary/command shims that intercept stdout/stderr of `git`, `npm`, `node`, or `opencode`.
- No output prefixing with context markers (e.g., `[DEVHUB_CTX: git status]`).
- No token-reduction layer that summarizes or truncates long command outputs before they reach the LLM context.

#### What would the shims intercept?

- **Git output**: `git status`, `git diff`, `git log` can be very long. A shim could truncate or summarize.
- **NPM/Node output**: Build logs, test output.
- **OpenCode server output**: Already piped to log files in `processManager.js`, but not context-marked.

#### Approaches

| Approach                    | Description                                                                                                                      | Pros                                            | Cons                                                      | Effort |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- | ------ |
| **A. Shell-function shims** | In `agentLaunchWrapper.js`, define bash functions like `devhub_git()` that call real `git` but pipe output through a summarizer. | No binary compilation; easy to maintain         | Only works inside the wrapper shell session               | Low    |
| **B. Node shim binary**     | Create a small Node.js wrapper script (`devhub-shim.js`) that execs the real command and intercepts output.                      | Cross-platform, can use JS for truncation logic | Requires PATH manipulation or symlink replacement         | Medium |
| **C. LLM-side truncation**  | Keep commands native; rely on the LLM client (OpenCode) to truncate tool output.                                                 | Zero infra change                               | DevHub has no control over OpenCode's truncation behavior | None   |

#### Recommendation for Gap 3

**Defer indefinitely**. Token optimization is highly dependent on the LLM client (OpenCode) and its tool output handling. OpenCode already has its own truncation/summarization logic. Adding a shim layer would create maintenance overhead and potential command incompatibility. If token pressure becomes a measurable problem, evaluate **Approach A** (shell-function shims for git) as a targeted fix.

#### Risks

- Shim layer adds complexity and potential for command behavior divergence.
- PATH manipulation can break agent environment.
- Not a current bottleneck; OpenCode handles large outputs internally.

---

### Summary Table

| Gap                   | Exists?                                        | Missing                               | Complexity | Risk               | Recommendation |
| --------------------- | ---------------------------------------------- | ------------------------------------- | ---------- | ------------------ | -------------- |
| Worktree Manifest     | `listLaunchWorktrees` shells to git every time | JSON manifest file for fast reconcile | Low        | Stale data         | **Defer**      |
| File Locks with TTL   | `withDbWriteQueue` + DB unique indexes         | File-level lock on worktree ops       | Low        | Rare race          | **Defer**      |
| Token-Optimized Shims | Direct command execution                       | Output interception / summarization   | Medium     | Command divergence | **Defer**      |

### Ready for Proposal

**No**. All three gaps are low-priority optimizations or safeguards. The current implementation is operationally sound. No proposal should be created for these gaps unless:

1. Reconciliation latency exceeds acceptable thresholds (manifest gap).
2. Race conditions in worktree creation are observed in logs (file lock gap).
3. Token usage analysis shows command output is a significant cost driver (shim gap).

**Recommendation**: Monitor metrics. Do not allocate implementation effort now.

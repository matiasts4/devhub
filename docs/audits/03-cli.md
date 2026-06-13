# Audit Report: DevHub Internal CLI

**Audited**: 2026-05-30
**Auditor**: Workflow — 3 sub-agents, 156k tokens
**Status**: 🟠 Issues found

---

## Files Analyzed

| File                                           | Purpose                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| `bin/agenthub-test.js`                         | Test runner CLI with parallel execution, lock management |
| `bin/agenthub-smoke.js`                        | Headless smoke test for AgentHub flow                    |
| `scripts/tauri-cli.cjs`                        | Tauri CLI wrapper with GTK dependency detection          |
| `scripts/native-vte-smoke.cjs`                 | VTE smoke test runner                                    |
| `scripts/qa/run-multi-agent-desktop.cjs`       | Desktop QA harness                                       |
| `scripts/setup-gemini-accounts.sh`             | Gemini CLI multi-account setup                           |
| `src/components/TerminalWorkspacesManager.jsx` | Terminal workspace management UI                         |

---

## 🔴 CRITICAL — BUG: Presence Tautology

**File**: `src/components/.../presence.js`, line ~16

```javascript
args[0] === 'list' ? 'list' : 'list';
```

This is a **tautology** — `args[0] === 'list' ? 'list' : 'list'` always returns `'list'`. No other subcommand is possible regardless of what the user typed. The subcommand dispatch relies on the caller always passing `'list'` — effectively hardcoded.

**Impact**: Presence `list` is the only available subcommand. Any other subcommand silently becomes `list`.

---

## 🔴 CRITICAL — BUG: Network Errors Throw Instead of Returning Error Object

**File**: `bin/agenthub-*/httpClient.js`, lines ~68-70

```javascript
// Network errors (ECONNREFUSED, DNS failure) throw a plain Error:
throw new Error('...'); // NOT returned as {status, data, error}
```

Callers that use `if (result.error)` or `result.status >= 400` will **crash** instead of handling errors gracefully.

**Impact**: Any network failure in CLI commands causes an unhandled exception instead of a clean error message.

---

## 🔴 CRITICAL — BUG: `setInterval` Never Cleared on Shutdown

**File**: `bin/agenthub-*/events.js`, lines ~106-144

```javascript
const interval = setInterval(poll, intervalMs);
// ...no clearInterval on SIGINT/SIGTERM
```

The polling interval runs forever. When the process receives `SIGINT`/`SIGTERM` (Ctrl+C), the interval **keeps firing**. The stream also doesn't clear the interval on error.

**Impact**: Process doesn't exit cleanly — continues polling in background after "exit".

---

## 🟠 High — `swarm-launch.js` Uses Raw `http.request()` Instead of Shared Helper

**File**: `bin/agenthub-*/swarm-launch.js`

Uses raw `Node.js http.request()` instead of the shared `httpClient.request()` helper that all other commands use. Error handling is inconsistent — `swarm-launch` has its own JSON error parsing that differs from the rest of the CLI.

**Impact**: Inconsistent error handling, harder to maintain.

---

## 🟡 Medium — Catch Block Swallows Errors in Events Stream

**File**: `bin/agenthub-*/events.js`, line ~136

```javascript
catch (err) {
  process.stderr.write(`Error: ${err.message}\n`);
  // Does NOT re-throw or set error flag
}
```

Error is only written to stderr — the function never propagates it. The interval continues polling without any indication that errors are occurring.

---

## 🟡 Medium — Auth DB Provision Failure Swallowed Silently

**File**: `bin/agenthub-*/auth.js`, lines ~62-69

DB provisioning failure is swallowed silently. Login "succeeds" and auth file is written even if the DB provision step fails. No warning or fallback behavior.

**Impact**: Subsequent commands relying on DB-backed auth may behave unexpectedly with no indication why.

---

## 🟡 Medium — Clock Skew Between API and CLI on First Poll

**File**: `bin/agenthub-*/events.js`, line ~100

```javascript
const cursor = new Date().toISOString(); // local clock as initial cursor
```

If the API server's clock differs from the local clock, events could be skipped on the first poll.

---

## 🟡 Medium — Exit Code Convention Not Documented or Consistent

| Command     | "Not found" exit code |
| ----------- | --------------------- |
| `heartbeat` | 0                     |
| `status`    | 1                     |
| `release`   | 1                     |
| Most others | 1                     |

No documented convention. `claim` and `release` use exit(0) for success cases differently from other commands.

---

## 🟡 Medium — Format Inconsistencies

- `task.js` has its own local `truncate()` helper instead of importing from `lib/format`
- `swarm.js` manually computes `key=value` pairs instead of using format helpers
- Each command hand-rolls error messages — some say `error:`, some say `error: usage:`, some say just `Task ID required`

---

## 🟡 Medium — `update-status` Has All Positional Args Marked [optional]

```javascript
const parser = new Argument('update-status')
  .argument('[agent-id]')
  .argument('[status]')
  .argument('[note]');
```

The command is useless without all three args but no validation enforces them as required.

---

## Architecture Strengths

- **Parallel test runner** with lock management and worker pool
- **Smoke test harness** with SLA timeouts, session abort, QA metadata
- **Dual SQLite/Supabase driver** support
- **Bulk operations idempotent** by title

---

## Recommendations

1. **Fix presence tautology** — `args[0] || 'list'` to default properly
2. **Wrap network errors** in httpClient — return `{status: 0, error: string, data: null}` instead of throwing
3. **Add SIGINT/SIGTERM handlers** in events to `clearInterval` before exit
4. **Use shared httpClient.request** in swarm-launch.js
5. **Re-throw or flag errors** in events catch block
6. **Document exit code convention** and normalize across commands
7. **Extract truncate helper** and use it consistently
8. **Add `--kind` validation** before option merge for clearer error messages
9. **Add subcommand discovery** to `--help` output

# Design: AgentHub Testing System with Distributed LOCKS

## Technical Approach

Build a SQLite-based distributed locking system (`lib/test-locks.js`) that coordinates parallel test execution, paired with Jest-based test harnesses for API routes, MCP tools, Telegram commands, and end-to-end flows. The system uses `:memory:` SQLite databases for test isolation while the persistent `data/devhub.db` hosts the `test_locks` table for cross-process coordination. Tests follow an acquire → execute → verify → release pattern enforced by the harness. A CLI runner (`bin/agenthub-test.js`) orchestrates discovery, parallel execution, and reporting.

## Architecture Decisions

| Decision            | Options                                    | Tradeoff                                                  | Decision                                                          |
| ------------------- | ------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Lock storage        | `:memory:` vs file DB                      | In-memory loses cross-process coordination                | File DB (`data/devhub.db`) for `test_locks` only                  |
| Test framework      | Jest vs custom runner                      | Jest has ecosystem, custom gives lock control             | Jest for assertions + custom harness for lock lifecycle           |
| API route testing   | `next/test` vs `fetch` to running server   | `next/test` requires Next.js test harness                 | `fetch` against `next dev` server — simpler, matches real traffic |
| MCP tool invocation | `spawn` subprocess vs dynamic `import()`   | Subprocess is slow, import is fast but ESM/CJS            | Dynamic `import()` with `createRequire` bridge                    |
| Telegram testing    | Full bot instance vs mock ctx              | Full bot needs token, mock ctx is instant                 | Mock ctx objects with jest.fn() for reply methods                 |
| Flow definitions    | YAML vs JS objects                         | YAML needs parser, JS is native                           | JS objects — no extra dependency, type-safe                       |
| CLI framework       | `commander` vs `cac` vs manual             | `commander` is battle-tested, `cac` is lighter            | `commander` — subcommands, help, and option parsing built-in      |
| Parallel workers    | `child_process.fork()` vs `worker_threads` | `fork()` isolates globals, `worker_threads` shares memory | `child_process.fork()` — each worker gets its own DB connection   |

## Data Flow

```
CLI (bin/agenthub-test.js)
  │
  ├── discover tests ──→ glob tests/agenthub/**/*.test.js
  │
  ├── run --all --parallel
  │     │
  │     ├── Worker Pool (N workers)
  │     │     │
  │     │     ├── Worker 1 ──→ acquire lock ──→ run test ──→ verify ──→ release
  │     │     ├── Worker 2 ──→ acquire lock ──→ run test ──→ verify ──→ release
  │     │     └── Worker 3 ──→ wait for lock ──→ acquire ──→ run ──→ release
  │     │
  │     └── aggregate results ──→ display (human/JSON)
  │
  └── lock status ──→ query test_locks table ──→ format output
```

```
Test Execution Flow (per test):
  beforeAll  → expireStale() → create :memory: DB → run migrations
  beforeEach → acquire locks (with retry/backoff)
  test       → execute → validate response → verify side effects
  afterEach  → release locks (even on failure)
  afterAll   → close :memory: DB → cleanup temp dirs
```

## File Changes

| File                                              | Action       | Description                                                         |
| ------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| `lib/test-locks.js`                               | Create       | Distributed LOCKS module — acquire, release, expire, extend, status |
| `lib/test-schema.js`                              | Create       | Schema migration helper for `:memory:` test databases               |
| `tests/agenthub/harness.js`                       | Create       | Base harness — lock lifecycle, DB setup, assertion helpers          |
| `tests/agenthub/api/harness.js`                   | Create       | API-specific harness — request builder, response validator          |
| `tests/agenthub/api/*.test.js`                    | Create (~20) | One test file per API route                                         |
| `tests/agenthub/mcp/harness.js`                   | Create       | MCP-specific harness — tool invoker, schema validator               |
| `tests/agenthub/mcp/*.test.js`                    | Create (~8)  | Grouped by tool category                                            |
| `tests/agenthub/telegram/harness.js`              | Create       | Telegram-specific harness — mock ctx, response capture              |
| `tests/agenthub/telegram/*.test.js`               | Create (~4)  | Grouped by command category                                         |
| `tests/agenthub/flows/headless-lifecycle.test.js` | Create       | End-to-end headless flow                                            |
| `tests/agenthub/flows/mcp-toolchain.test.js`      | Create       | MCP tool chain flow                                                 |
| `tests/agenthub/flows/telegram-flow.test.js`      | Create       | Telegram command flow                                               |
| `tests/agenthub/flow-verifier.js`                 | Create       | Flow execution engine with assertions                               |
| `bin/agenthub-test.js`                            | Create       | CLI runner with commander                                           |
| `data/migrations/001_test_locks.sql`              | Create       | SQL migration for test_locks table                                  |
| `src/lib/db/localDb.js`                           | Modify       | Export `ensureRuntimeSchema` for reuse in test migrations           |
| `tests/concurrency-test.js`                       | Modify       | Add LOCKS integration                                               |
| `tests/headless-test.js`                          | Modify       | Add flow lock integration                                           |
| `tests/integration/telegram-opencode.test.js`     | Modify       | Use Telegram harness + session locks                                |
| `tests/integration/sse-reconnect.test.js`         | Modify       | Add endpoint lock                                                   |
| `package.json`                                    | Modify       | Add `agenthub-test` script, add `commander` devDep                  |

## Interfaces / Contracts

### LOCKS Module (`lib/test-locks.js`)

```js
// Returns a singleton instance bound to the persistent DB
function getLockManager() → LockManager

class LockManager {
  // Acquire a lock. Retries with exponential backoff on contention.
  acquire(type: 'session'|'endpoint'|'resource'|'flow', key: string, owner: string, options?: { ttl?: number, maxRetries?: number })
    → Promise<{ success: true, lockId: string, expiresAt: string } | { success: false, reason: string, owner?: string }>

  // Release a lock. Only the owner can release.
  release(lockId: string, owner: string)
    → Promise<{ success: true } | { success: false, reason: 'not_owner'|'not_found' }>

  // Extend TTL on an existing lock.
  extend(lockId: string, owner: string, extraSeconds: number)
    → Promise<boolean>

  // Delete all expired locks. Returns count of deleted rows.
  expireStale() → Promise<number>

  // Get all current locks with is_expired flag.
  status() → Promise<{ locks: LockEntry[], total: number, expired: number }>

  // Get a specific lock by type+key.
  statusByKey(type: string, key: string) → Promise<LockEntry | null>
}

type LockEntry = {
  lockId: string,
  lockType: string,
  lockKey: string,
  owner: string,
  acquiredAt: string,
  expiresAt: string,
  isExpired: boolean,
  metadata: string | null
}
```

### Base Harness (`tests/agenthub/harness.js`)

```js
class TestHarness {
  constructor(options: { dbPath?: string, lockOwner?: string })

  // Create fresh :memory: DB with full schema
  async setupDb() → Database

  // Tear down :memory: DB
  async teardownDb()

  // Acquire one or more locks with retry
  async acquireLocks(locks: { type, key }[]) → string[]  // returns lockIds

  // Release all acquired locks
  async releaseLocks(lockIds: string[])

  // Expire stale locks before suite
  async cleanupStale() → number

  // Query helper for :memory: DB
  query(sql, params?) → any[]

  // Verify DB side effect
  async verifyDb(table, conditions, expected) → boolean
}
```

### API Harness (`tests/agenthub/api/harness.js`)

```js
class ApiTestHarness extends TestHarness {
  constructor(baseUrl: string, options?)

  // Build and execute HTTP request
  async request(method, path, options?: { body?, headers?, query? })
    → { status, headers, body }

  // Validate response status
  assertStatus(actual, expected)

  // Validate response body shape
  assertBodyShape(body, requiredFields: string[])

  // Validate error response
  assertError(body, expectedMessage?)

  // Verify DB side effect after request
  async verifySideEffect(table, where, expected)
}
```

### MCP Harness (`tests/agenthub/mcp/harness.js`)

```js
class McpTestHarness extends TestHarness {
  // Dynamically load MCP server (ESM)
  async loadMcpServer() → { tools: Map<string, Tool> }

  // Invoke a tool directly with validated input
  async invokeTool(toolName: string, input: object)
    → { result, duration, error? }

  // Validate tool response shape
  assertToolResponse(result, requiredFields: string[])

  // Verify DB state after tool execution
  async verifyDbState(table, where, expected)
}
```

### Telegram Harness (`tests/agenthub/telegram/harness.js`)

```js
class TelegramTestHarness extends TestHarness {
  // Create a mock Telegram context
  createMockCtx(options: { chatId?, userId?, text?, command?, callbackData? })
    → { message, match, reply: jest.fn, editMessageText: jest.fn, ... }

  // Load a command handler module
  loadCommand(name: string) → Function

  // Execute a command handler with mock context
  async executeCommand(commandName: string, ctx) → void

  // Capture all replies sent
  getReplies(ctx) → string[]

  // Verify reply content
  assertReply(ctx, expectedText)

  // Verify DB state after command
  async verifyBackendState(table, where, expected)
}
```

### Flow Verifier (`tests/agenthub/flow-verifier.js`)

```js
class FlowVerifier {
  constructor(harness: TestHarness)

  // Execute a flow definition
  async execute(flow: FlowDefinition) → FlowResult

  // Built-in assertion evaluators
  assertions: {
    db.rowExists(db, { table, where }) → boolean,
    db.rowCount(db, { table, where, min?, max? }) → boolean,
    db.fieldValue(db, { table, where, field, value }) → boolean,
    http.status(response, expected) → boolean,
    http.body(body, { has: string[] }) → boolean,
    sse.events(consumer, { event, min, timeout }) → boolean,
    file.exists(path) → boolean,
    process.running(pid) → boolean,
  }
}

type FlowDefinition = {
  name: string,
  lock: { type: 'flow', key: string },
  globalTimeout?: number,  // default 300000 (5min)
  steps: FlowStep[]
}

type FlowStep = {
  name: string,
  action: Function | string,  // function or named action
  timeout: number,
  assert: object,
  onFailure?: 'abort' | 'retry' | 'continue'  // default: 'abort'
}

type FlowResult = {
  flow: string,
  status: 'passed' | 'failed' | 'timed_out',
  duration: number,
  steps: StepResult[],
  lockReleased: boolean
}

type StepResult = {
  name: string,
  status: 'passed' | 'failed' | 'timed_out',
  duration: number,
  assertions: { passed: number, failed: number },
  error?: string
}
```

### CLI Runner (`bin/agenthub-test.js`)

```
agenthub-test <command> [options]

Commands:
  run [target]     Run one or more tests
  lock <action>    Manage locks (status, release, expire, clear)
  list             List available tests
  flow [name]      Run or list flow tests

Options (run):
  --all            Run all tests
  --parallel       Run in parallel with lock coordination
  --lock <id>      Use specific lock ID
  --suite <name>   Run specific suite (api, mcp, telegram, flow)
  --timeout <ms>   Global timeout (default: 300000)
  --verbose        Show detailed output
  --json           Output results as JSON
  --workers <n>    Number of parallel workers (default: CPU count, max 8)
```

Parallel execution uses `child_process.fork()`:

```
Main Process
  ├── discover test files
  ├── group by lock key (tests needing same lock → same worker queue)
  ├── spawn N workers
  │     ├── Worker receives test file path
  │     ├── Worker creates :memory: DB
  │     ├── Worker acquires locks via shared test_locks table
  │     ├── Worker runs Jest on single file
  │     ├── Worker releases locks
  │     └── Worker sends results to main via IPC
  └── aggregate + display results
```

## Testing Strategy

| Layer       | What                     | Approach                                                                                                              |
| ----------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Unit        | LOCKS module itself      | Jest tests in `tests/unit/test-locks.test.js` — test acquire/release/expire/extend/retry with mocked `better-sqlite3` |
| Unit        | Flow verifier assertions | Jest tests — each assertion type tested with mock DB/responses                                                        |
| Integration | API routes               | `fetch` against `next dev` server, verify response + DB side effects                                                  |
| Integration | MCP tools                | Dynamic `import()` of `devhub-mcp/server.js`, invoke tools directly, verify DB                                        |
| Integration | Telegram commands        | Import handlers, mock `ctx`, verify replies + DB                                                                      |
| E2E         | Full flows               | Flow verifier executes spawn → SSE → traces → abort lifecycle                                                         |
| Concurrency | Parallel execution       | `--parallel` flag with intentional lock collisions to verify no race conditions                                       |

### Mock Strategy

| Dependency         | Mock Approach                                                     |
| ------------------ | ----------------------------------------------------------------- |
| SQLite (test data) | `:memory:` database per suite via `better-sqlite3(':memory:')`    |
| OpenCode binary    | Unit tests: mock `spawn()`; Integration: real binary with timeout |
| Telegram Bot API   | Mock `ctx.reply`, `ctx.editMessageText` as `jest.fn()`            |
| LLM API (OpenAI)   | Mock `fetch` for `/api/agenthub/chat` tests; skip for flow tests  |
| File system        | `fs.mkdtemp()` for isolated temp directories per test             |

### SSE Consumer Testing

The headless route spawns a background SSE consumer. Testing strategy:

1. **Polling pattern**: After triggering an action, poll the DB for expected traces with a timeout (proven pattern from existing `sse-reconnect.test.js`)
2. **Event buffer**: For direct SSE tests, use the existing `SSEClient` class from `sse-reconnect.test.js`
3. **Timeout**: 30s default poll timeout, configurable per test

## Migration / Rollout

No production impact — all changes are test-only. Phased rollout:

1. **Phase 1**: Create `lib/test-locks.js` + migration — LOCKS work independently
2. **Phase 2**: Create harnesses (`tests/agenthub/harness.js`, api/, mcp/, telegram/) — no existing tests changed
3. **Phase 3**: Write new test files — additive only
4. **Phase 4**: Create CLI runner — can be used alongside existing `npm test`
5. **Phase 5**: Refactor existing tests (`concurrency-test.js`, `headless-test.js`, integration tests) to use LOCKS

Rollback: `git revert` all new files, `DROP TABLE IF EXISTS test_locks`, remove script from `package.json`.

## Open Questions

- [ ] Should the CLI runner use Jest's programmatic API (`jest.runCLI`) or spawn Jest as subprocess? Spawning is simpler but loses fine-grained control over individual test results.
- [ ] For API route tests, should we run `next dev` as a prerequisite (requiring the server to be running) or use Next.js's test server? The former matches real traffic but requires setup; the latter is slower to start.
- [ ] Should MCP tool tests run against the actual `devhub-mcp/server.js` (which reads from `data/devhub.db`) or a fully mocked version? The spec says `:memory:` DB, but the MCP server imports `localDb.js` which defaults to the file DB. We'll need to inject the `:memory:` DB path via environment variable or module mocking.

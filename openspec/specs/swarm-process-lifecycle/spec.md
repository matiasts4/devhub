# Swarm Process Lifecycle Specification

## Purpose

Define the behavior for centralized management of the OpenCode `serve` process lifecycle, including spawn coordination between bot and Next.js contexts, process tracking, graceful shutdown, and orphan cleanup. This prevents memory leaks from orphaned processes (~1.8GB RAM each) and ensures only one instance runs on port 4153.

## Requirements

### REQ-1: Process Manager Singleton

The system MUST provide a singleton process manager module that owns the complete lifecycle of the OpenCode `serve` process. The singleton MUST track the process PID, port binding state, spawn timestamp, and health status. Multiple imports of the module across the application MUST return the same instance.

#### Scenario: Singleton returns same instance

- **Given** the process manager module is imported in two different files
- **When** both files access the process manager instance
- **Then** both references point to the same object in memory

#### Scenario: Process state is tracked

- **Given** no OpenCode serve process is running
- **When** the process manager starts the process
- **Then** the manager records the PID, port 4153, and spawn timestamp
- **AND** `isRunning()` returns `true`

### REQ-2: Spawn Coordination — Single Instance Guarantee

The system MUST ensure that only one OpenCode `serve` process runs on port 4153 at any time, regardless of how many components (bot, Next.js API routes, UI) attempt to start it. If a process is already bound to port 4153, the system MUST adopt it rather than spawn a duplicate. OpenCode durable sessions with `sessionType=opencode-durable` and an `opencodeSessionId` are relaunched via `opencode --session <id>` command-based resume, covered under this adopt-over-spawn guarantee.

#### Scenario: First component spawns process

- **Given** no process is running on port 4153
- **When** any component requests the OpenCode serve process to start
- **Then** a new process is spawned on port 4153
- **AND** the process manager records it as the active process

#### Scenario: Second component detects existing process

- **Given** an OpenCode serve process is already running on port 4153
- **When** another component requests the process to start
- **Then** no new process is spawned
- **AND** the existing process is adopted by the process manager
- **AND** the component receives confirmation the process is ready

#### Scenario: Orphaned process from previous session detected

- **Given** a stale OpenCode serve process exists on port 4153 from a crashed session
- **When** Next.js starts and the process manager initializes
- **Then** the manager detects the process via port check and `/health` endpoint
- **AND** adopts the process instead of killing it
- **AND** registers it for future cleanup

### REQ-3: Graceful Shutdown on Exit

The system MUST register handlers for `SIGTERM`, `SIGINT`, and Next.js `beforeExit` events that gracefully terminate the managed OpenCode `serve` process. The shutdown MUST send `SIGTERM` first, wait up to 5 seconds, then send `SIGKILL` if the process has not exited.

#### Scenario: Next.js shuts down normally

- **Given** an OpenCode serve process is running and managed
- **When** Next.js receives `SIGTERM`
- **Then** the process manager sends `SIGTERM` to the OpenCode process
- **AND** waits up to 5 seconds for graceful exit
- **AND** sends `SIGKILL` if still running after timeout
- **AND** the port 4153 is freed

#### Scenario: User presses Ctrl+C

- **Given** an OpenCode serve process is running and managed
- **When** the user presses `Ctrl+C` (`SIGINT`)
- **Then** the process manager performs the same graceful shutdown sequence
- **AND** no orphaned process remains consuming RAM

#### Scenario: Process already exited before shutdown

- **Given** the managed OpenCode process exited unexpectedly
- **When** Next.js shuts down
- **Then** the shutdown handler completes without error
- **AND** no kill signal is sent to a non-existent PID

### REQ-4: Health Verification Before Operations

The system MUST verify an existing process on port 4153 is actually an OpenCode `serve` instance before adopting or terminating it. Verification MUST be done by calling the `/health` endpoint and confirming a valid response.

#### Scenario: Process on port is OpenCode serve

- **Given** a process is listening on port 4153
- **When** the process manager queries `http://localhost:4153/health`
- **Then** a valid health response is received
- **AND** the process is confirmed as OpenCode serve and adopted

#### Scenario: Process on port is not OpenCode serve

- **Given** an unrelated process is listening on port 4153
- **When** the process manager queries `http://localhost:4153/health`
- **Then** the health check fails or returns an unexpected response
- **AND** the process is NOT adopted or terminated
- **AND** an error is logged

### REQ-5: Status API for External Consumers

The system MUST expose a GET endpoint at `/api/agenthub/opencode/status` that returns the current state of the managed OpenCode serve process. The response MUST include: `running` (boolean), `pid` (number or null), `port` (number), `uptime` (seconds or null), and `health` (boolean).

#### Scenario: Process is running and healthy

- **Given** the process manager has an active OpenCode serve process
- **When** a GET request is made to `/api/agenthub/opencode/status`
- **Then** the response status is 200
- **AND** the body contains `running: true`, `pid`, `port: 4153`, `uptime`, and `health: true`

#### Scenario: No process is running

- **Given** no OpenCode serve process is managed
- **When** a GET request is made to `/api/agenthub/opencode/status`
- **Then** the response status is 200
- **AND** the body contains `running: false`, `pid: null`, `uptime: null`

### REQ-6: Bot Process Coordination

The Telegram bot MUST query the `/api/agenthub/opencode/status` endpoint before attempting to spawn an OpenCode serve process. If a process is already running, the bot MUST use the existing process and MUST NOT spawn a new one.

#### Scenario: Bot starts when Next.js already spawned process

- **Given** Next.js has an active OpenCode serve process on port 4153
- **When** the Telegram bot initializes and checks process status
- **Then** the bot detects the running process
- **AND** skips its own spawn logic
- **AND** uses the existing process for agent sessions

#### Scenario: Bot starts first, Next.js starts later

- **Given** the bot spawned an OpenCode serve process independently
- **When** Next.js starts and the process manager initializes
- **Then** the process manager adopts the existing process (per REQ-2)
- **AND** both bot and Next.js share the same process

### REQ-7: Manual Process Control API

The system MUST provide programmatic `start()`, `stop()`, and `isRunning()` methods on the process manager. The `start()` method MUST be idempotent — calling it when a process is already running MUST return the current state without spawning a new process.

#### Scenario: start() called when process is running

- **Given** an OpenCode serve process is already running
- **When** `processManager.start()` is called
- **Then** no new process is spawned
- **AND** the method returns the current process state immediately

#### Scenario: stop() called when no process is running

- **Given** no process is managed or running
- **When** `processManager.stop()` is called
- **Then** the method returns without error
- **AND** no signals are sent

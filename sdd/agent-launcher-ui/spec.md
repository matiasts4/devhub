# Specification: Agent Launcher UI

## Purpose

This specification outlines the requirements and scenarios for launching, monitoring, and managing OpenCode AI agents from the DevHub UI. It covers the frontend interface, the Next.js API route execution, and the state tracking system.

## Domain: API

### Requirement: Agent Launch Endpoint

The system MUST provide a Next.js API endpoint (`/api/agents/launch`) to securely execute the OpenCode CLI.
The endpoint MUST spawn the CLI as a child process using `child_process.spawn`.
The endpoint MUST execute the CLI in detached (fire-and-forget) mode to prevent blocking the HTTP request.

#### Scenario: Successful Launch

- GIVEN a valid request with authorized credentials
- WHEN the client calls `/api/agents/launch` with valid agent parameters
- THEN the system spawns the `opencode` CLI as a detached process
- AND returns a generated Task ID immediately without waiting for the process to complete

### Requirement: Strict Input Sanitization

The system MUST sanitize and validate all inputs passed to the `opencode` command.
The system MUST NOT pass raw user strings directly to the shell to prevent command injection.

#### Scenario: Malicious Input Rejected

- GIVEN a user request containing shell operators (e.g., `&&`, `;`, `|`) in parameters
- WHEN the `/api/agents/launch` endpoint receives the request
- THEN the system rejects the request with a 400 Bad Request error
- AND the CLI process is not spawned

### Requirement: Zombie Process Prevention

The system MUST manage process detachment correctly and handle timeouts to prevent zombie processes.

#### Scenario: Process Timeout

- GIVEN a running agent process spawned by the API
- WHEN the process exceeds the maximum allowed execution time
- THEN the system safely terminates the child process and updates the task state to `failed`

## Domain: State Tracking

### Requirement: Task State Registry

The system MUST persist task IDs, status (`pending`, `in_progress`, `completed`, `failed`), and metadata using Supabase.

#### Scenario: State Initialization

- GIVEN a new agent launch request
- WHEN the system generates a Task ID
- THEN it inserts a new record into the task registry with status `pending`

#### Scenario: State Update

- GIVEN a running CLI process
- WHEN the process emits output or exits
- THEN the system updates the task registry status to `in_progress`, `completed`, or `failed` accordingly

## Domain: UI

### Requirement: Agent Trigger Component

The system MUST provide a UI component to configure and trigger agent execution.

#### Scenario: Triggering an Agent

- GIVEN the user is on the Cerebro view
- WHEN the user fills the agent configuration and clicks "Launch"
- THEN the UI calls the `/api/agents/launch` endpoint
- AND clears the form upon receiving a successful Task ID

### Requirement: Active Tasks View

The system MUST display running and completed tasks.
The UI MUST subscribe to Supabase real-time updates for task state synchronization without polling.

#### Scenario: Task Status Real-time Update

- GIVEN the user is viewing the Active Tasks component
- WHEN a task's status changes from `pending` to `in_progress` in the registry
- THEN the UI updates automatically to reflect the new status

# Proposal: Agent Launcher UI

## Intent

Enable users to launch OpenCode AI agents directly from the DevHub UI. This integrates the command-line agent capabilities into the web interface, providing a seamless way to trigger, monitor, and manage agent executions without leaving the browser.

## Scope

### In Scope

- Next.js API route to securely spawn the `opencode` CLI as a child process.
- UI components to trigger agent execution (e.g., from ChatAgente/Cerebro or a dedicated view).
- Task execution tracking (fire and forget) with status updates (using local registry or Supabase real-time).
- Active tasks view to display running/completed agents.

### Out of Scope

- Full bidirectional interactive terminal inside the UI (agents run in fire-and-forget mode).
- Managing agent installations or updates (assumes OpenCode CLI is installed and configured).

## Approach

1. **Backend Execution**: Create a Next.js API route (`/api/agents/launch`) that uses Node.js `child_process.spawn` to execute `opencode run ... --agent X` in detached/fire-and-forget mode.
2. **Status Tracking**: Implement a tracking mechanism. We will use Supabase real-time (or a robust local task registry) to persist task ID, status (queued, running, completed, failed), and metadata.
3. **Frontend UI**:
   - Add a trigger button/form within the existing ChatAgente/Cerebro view (or a dedicated "Agents" view).
   - Create an "Active Tasks" component that subscribes to status changes and displays current agent activities.

## Affected Areas

| Area                               | Impact   | Description                                 |
| ---------------------------------- | -------- | ------------------------------------------- |
| `app/api/agents/launch/route.ts`   | New      | API endpoint to spawn the CLI process.      |
| `components/AgentTrigger.tsx`      | New      | UI to configure and launch an agent.        |
| `components/ActiveTasks.tsx`       | New      | UI to display running/completed tasks.      |
| `lib/tasks/registry.ts`            | New      | Task tracking logic (Supabase integration). |
| `app/(dashboard)/cerebro/page.tsx` | Modified | Integrate trigger and task views.           |

## Risks

| Risk                              | Likelihood | Mitigation                                                                                                                               |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Zombie processes from spawned CLI | Medium     | Ensure proper process detachment and timeout handling in the API route.                                                                  |
| Security/Command Injection        | High       | Strictly sanitize and validate all inputs passed to the `opencode` command arguments. Never pass raw user strings directly to the shell. |
| UI State Sync Issues              | Low        | Use Supabase real-time subscriptions for robust state sync instead of polling.                                                           |

## Rollback Plan

- Revert the UI components integration in `cerebro/page.tsx`.
- Disable or remove the `/api/agents/launch` route to prevent execution.
- Drop/clear the task tracking table in Supabase if schema changes were made.

## Dependencies

- OpenCode CLI installed and accessible by the Next.js Node environment.
- Supabase (if used for real-time tracking).

## Success Criteria

- [ ] User can successfully trigger an agent from the UI.
- [ ] The Next.js API route spawns the process without blocking the request.
- [ ] The UI displays the task status updating from "running" to "completed" or "failed".
- [ ] No zombie processes are left behind after execution.

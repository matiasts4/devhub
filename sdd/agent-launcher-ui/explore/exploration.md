## Exploration: Agent Launcher UI & OpenCode Integration

### Current State

Currently, `src/app/api/agent/execute/route.js` contains an API endpoint that registers a task as `in_progress` and `working` within Supabase, and it checks out a new git branch. However, it does not actually trigger any agent. In the UI, `src/components/TareasActivas.jsx` displays a static, mocked list of active agent tasks. The OpenCode CLI provides `opencode run [message..] --agent [agent_name]` for direct execution and `opencode serve` for a headless server mode. `src/components/ChatAgente.jsx` (Cerebro) serves as the primary conversational AI view, currently marked as "En Construcción".

### Affected Areas

- `src/app/api/agent/execute/route.js` — Needs to be updated to spawn the `opencode run` CLI command asynchronously.
- `src/components/TareasActivas.jsx` — Needs to connect to Supabase Realtime to stream actual task states from the DB.
- `src/components/ChatAgente.jsx` — Ideal placement for a conversational trigger ("Hey Cerebro, launch Nexus for issue 5").
- `Database (tasks table)` — Needs to accurately reflect terminal output or final execution status.

### Approaches

1. **Fire & Forget via CLI Spawn with DB Polling** — Launch the agent by executing `opencode run ... --agent X` in a detached `child_process.exec` asynchronously. The API returns `202 Accepted` instantly. When the process finishes, the async function updates the Supabase `tasks` table with a `completed` or `failed` status.
   - Pros: Simple to implement, works well with the existing Next.js API route architecture, and leverages Supabase Realtime for UI updates.
   - Cons: Capturing real-time execution logs for the UI requires either polling a log file or streaming log chunks into a DB table.
   - Effort: Medium

2. **Headless Server & WebSockets (ACP/MCP)** — Run `opencode serve` in the background and have the Next.js API connect to it via WebSockets or MCP/ACP to manage long-lived agent sessions and stream back terminal output directly.
   - Pros: True real-time interactivity, allows for pause/resume or interactive agent approval steps.
   - Cons: High architectural complexity, requires managing persistent connection states in Next.js.
   - Effort: High

### Recommendation

**Approach 1 (Fire & Forget via CLI Spawn)** is the recommended path. It aligns with the existing architecture and the async requirement. Since OpenCode acts as an orchestrator CLI, firing it via `child_process.exec` and updating the database upon completion is robust. The UI can easily listen to Supabase Realtime updates on the `TareasActivas` component. For launching, `ChatAgente.jsx` (Cerebro) is the most natural entry point, integrating execution seamlessly into the conversational flow.

### Risks

- Using `child_process.exec` inside a serverless/Next.js function can lead to orphaned processes if the Node container crashes before updating the DB status.
- Running heavy agent tasks locally could consume significant CPU/Memory resources on the host machine.
- Without a mechanism to kill the process via the UI, runaway agents might be hard to stop.

### Ready for Proposal

Yes. The orchestrator can proceed with proposing Approach 1, leveraging `child_process.exec`, Supabase Realtime, and the `TareasActivas` component.

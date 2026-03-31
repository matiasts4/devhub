## Exploration: terminal-state

### Current State

The terminal feature is fully implemented and operational. It consists of three main pieces:

1. **Frontend PTY (`TerminalTTY.jsx`)**: Renders the terminal using `xterm.js` and `xterm-addon-fit`. It connects to a backend WebSocket server to send input commands and window resize events.
2. **Frontend Multiplexer (`TerminalWorkspacesManager.jsx`)**: Organizes terminals in tabs and split panes using `react-resizable-panels`. It persists the layout state in `localStorage` and listens to global events like `devhub:run-agent`.
3. **Backend PTY (`ttyServer.js`)**: Runs native shell processes using `node-pty` and exposes a WebSocket Server on a dynamically found port (defaults to 4077). It maintains sessions in a global map (`__DEVHUB_TTY_SERVER__`) so that terminals and their history (up to 100k chars) survive Next.js Fast Refresh and page reloads.

### Affected Areas

- `src/components/TerminalTTY.jsx` — The core visual component rendering the terminal shell.
- `src/components/TerminalWorkspacesManager.jsx` — The grid manager handling pane splits and tabs.
- `src/lib/terminal/ttyServer.js` — The backend WebSocket server managing Node-pty instances.
- `src/app/api/terminal/session/route.js` — The API route used to establish connections to the backend server.
- `docs/13_BridgeSpace_Integration_Roadmap.md` — Mentions that terminal processes live in the background, but can cause memory leaks if accumulated since they lack Garbage Collection (an identified action item).

### Approaches

_(This is a general state exploration, so approaches depend on what change is being proposed next. However, addressing the known Garbage Collection issue is the main potential action item.)_

1. **Garbage Collection Implementation (Recommended Next Step)** — Implement a mechanism in `ttyServer.js` to kill `.pty` instances if no WebSocket has reconnected to them after a certain timeout (e.g., 2 hours), or when explicitly closed from the UI.
   - Pros: Prevents memory leaks and zombie processes.
   - Cons: Requires tracking last-seen timestamps and heartbeat checks.
   - Effort: Low/Medium

2. **Standalone MCP/Desktop Process Extraction** — Extract the `ttyServer.js` into a separate native desktop binary or sidecar service (`devhub-mcp`), entirely decoupling it from the Next.js API lifecycle.
   - Pros: Much more stable; no longer tied to Next.js dev server quirks.
   - Cons: High architectural change and requires inter-process communication changes.
   - Effort: High

### Recommendation

If the goal of the next change is to improve or fix the terminal, addressing the "Garbage Collection" of orphaned processes (Approach 1) is highly recommended. It is a known technical debt documented in `docs/13_BridgeSpace_Integration_Roadmap.md`.

### Risks

- Touching `ttyServer.js` can break the hot-reload resilience of the DevHub terminal.
- Killing processes too early could interrupt long-running background tasks (e.g., a dev server or an agent running in the terminal).

### Ready for Proposal

Yes — The terminal architecture is clearly understood and documented. The orchestrator can proceed to ask the user what specific changes they want to propose for the terminal based on this architecture.

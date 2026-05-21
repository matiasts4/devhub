# Proposal: Agent Room Sidebar

## Intent

Add a collapsible agent room sidebar to the Terminals & IDE page that displays active and inactive agents for the current project, enabling users to monitor agent activity and quickly focus on the terminal panel where a specific agent is running. This mirrors OpenCode's native agent panel pattern and improves the developer experience when managing multiple concurrent agents.

## Scope

### In Scope

- Collapsible sidebar between global nav and terminal grid
- Toggle button in terminal toolbar
- Visibility state persisted in localStorage
- Two sections: Active agents (top) and inactive agents (bottom)
- Agent cards with avatar, name, model, elapsed time, status indicator
- Click-to-focus: switches workspace and focuses terminal panel
- Launch button with dropdown selector at sidebar bottom
- 5-second polling interval for agent registry updates
- TaskId ↔ agent_id lookup bridge

### Out of Scope

- Changes to global sidebar, terminal grid, workspace tabs, splits
- Keyboard shortcuts modifications
- PTY functionality changes
- Real-time WebSocket subscriptions (polling only)
- Agent management beyond display and focus

## Capabilities

### New Capabilities

- `agent-room-sidebar`: Collapsible sidebar displaying active/inactive agents with click-to-focus and launch capabilities

### Modified Capabilities

- `agent-registry`: Add taskId ↔ agent_id lookup bridge to resolve key mismatch

## Approach

1. **Layout**: Insert sidebar as a new panel in the existing react-resizable-panels hierarchy between the global navigation sidebar and the terminal grid
2. **State Management**: Use localStorage for visibility state alongside existing workspace state persistence
3. **Data Flow**: Poll agent_registry every 5s → compute active/inactive lists → render cards → handle click events
4. **Key Resolution**: Create lookup bridge mapping taskId (devhub_agent_runs key) ↔ agent_id (agent_registry field)
5. **Focus Logic**: On card click, find agent's panelId, switch workspace if needed, set active panel

## Affected Areas

| Area                                           | Impact   | Description                                                |
| ---------------------------------------------- | -------- | ---------------------------------------------------------- |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Add sidebar panel to layout, integrate toggle button       |
| `src/components/AgentRoomSidebar.jsx`          | New      | Main sidebar component with active/inactive sections       |
| `src/components/AgentCard.jsx`                 | New      | Individual agent card with status, elapsed time            |
| `src/components/AgentLaunchDropdown.jsx`       | New      | Dropdown selector for launching agents                     |
| `src/lib/agentRegistryLive.js`                 | Modified | Fix getAgentLaunchMetadata key mismatch, add lookup bridge |
| `src/lib/agentRegistryTelemetry.js`            | Modified | Add polling hook for sidebar updates                       |

## Risks

| Risk                                    | Likelihood | Mitigation                                                  |
| --------------------------------------- | ---------- | ----------------------------------------------------------- |
| react-resizable-panels layout conflicts | Medium     | Test panel resizing thoroughly, use existing Panel patterns |
| TaskId ↔ agent_id mapping incomplete    | Medium     | Graceful fallback to agent_id if taskId mapping fails       |
| Polling performance impact              | Low        | 5s interval matches existing SwarmControl pattern           |
| localStorage state corruption           | Low        | Validate state on load, reset to defaults if invalid        |

## Rollback Plan

1. Remove sidebar toggle button from terminal toolbar
2. Remove AgentRoomSidebar component import and usage
3. Revert agentRegistryLive.js key resolution changes
4. Clear devhub_agent_room_sidebar_visibility from localStorage
5. All changes are additive — no destructive modifications to existing components

## Dependencies

- Existing react-resizable-panels infrastructure
- agent_registry table with task_id field (verify schema)
- getAgentRegistryLiveSnapshot, getAgentDisplayMeta, isActiveAgent utilities
- localClient for SQLite queries

## Success Criteria

- [ ] Sidebar toggles visibility with state persisted across sessions
- [ ] Active agents display with green status indicator and elapsed time
- [ ] Inactive agents display with gray status indicator
- [ ] Clicking active agent card focuses correct terminal panel
- [ ] Agent launch dropdown creates new panel with selected agent
- [ ] Polling updates agent status every 5 seconds
- [ ] No regressions in workspace tabs, splits, or PTY functionality

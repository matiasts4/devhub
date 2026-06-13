# Proposal: Operator Observer Chat Sidebar

## Intent

Decision: the MVP Operator View SHALL be a read-first, chat-like tab inside `WorkspaceRightDock`, not a separate window or freeform canvas. This slice combines observer mode with the integrated view because prompt, reply, execution, and progress only become debuggable when they are visible in one sidebar flow that feels like a cloud-IDE assistant.

## Scope

### In Scope
- Add a new right-dock tab sized and behaved like the current topology/right-side surface.
- Show one ordered transcript-plus-timeline narrative with operator prompts, agent replies, recent executed actions, and live progress states.
- Pin a bottom composer so the operator can continue the same thread without leaving the workspace.
- Reuse existing dock resize, maximize, visibility, and persistence patterns.

### Out of Scope
- Freeform canvas, floating windows, or a separate operator product shell.
- Voice, push-to-talk, or multimodal input.
- Redefining the action policy itself; this UI depends on the action contract and execution timeline slices.
- Replacing Swarm Control or broader control-room surfaces.

## Capabilities

### New Capabilities
- `operator-observer-sidebar`: integrated right-dock operator surface for transcript, execution feedback, progress, and composer.

### Modified Capabilities
- `agent-events`: add sidebar-ready execution/progress semantics for what started, is running, completed, or failed.
- `swarm-observability`: expose a compact read model for recent actions, active step, and progress summary in the dock.

## Approach

Extend `WorkspaceRightDock` with a dedicated operator tab and pane instead of inventing a new container. The pane renders a single vertical feed that mixes transcript bubbles, execution timeline rows, and progress indicators, with the composer anchored at the bottom. Data stays selector-first and read-mostly: the pane consumes the existing/forthcoming action contract and execution timeline so the UI explains what the agent said, what it executed, and how far it progressed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/workspace/WorkspaceRightDock.jsx` | Modified | Add the operator tab/pane to the existing dock shell. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Wire tab trigger, sizing, maximize, and right-dock lifecycle. |
| `src/components/workspace/WorkspaceOperatorObserverPane.jsx` | New | Render transcript, action feed, progress states, and composer. |
| `src/lib/operations/swarmControl.js` | Modified | Provide compact read models for dock-friendly recent activity and progress. |
| `src/app/api/agenthub/events` and related read models | Modified | Normalize execution/timeline payloads the sidebar depends on. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Event payloads are too coarse for useful progress feedback | Med | Spec the required timeline/action fields before UI wiring. |
| Sidebar becomes noisy and unreadable | Med | Keep MVP read-first: active step, latest actions, and collapsible history only. |
| Scope drifts toward canvas/voice work | Low | Keep MVP container fixed to the right dock and defer alternate inputs/views. |

## Rollback Plan

Remove the operator tab and pane, then restore the current browser/editor/swarm-only dock. Any event/timeline contracts added for this slice remain backward-compatible read models.

## Dependencies

- Action contract and permissions slice.
- Execution timeline/read-model slice.
- Existing chat transport for composer submissions.

## Success Criteria

- [ ] The workspace right dock exposes a chat-like operator tab at topology-like size.
- [ ] Operators can see prompt, reply, executed actions, and live progress in one integrated feed.
- [ ] The composer stays inside the dock, while canvas and voice remain explicitly out of scope for MVP.
# Proposal: Chat Profesional Fase 2

## Intent

Completar la evolución del chat AgentHub desde una interfaz funcional hasta una experiencia profesional de nivel Cursor/Claude Code. Fase 1 cubrió ~80% (theme unification, message editing, cmd palette, terminal output, bug fixes). Esta fase cierra los items restantes de Fase 1 y añade Swarm Control Pro, Terminal Integrada en side panel, y pulido UX completo.

## Scope

### In Scope

| #   | Feature                                                                                                      | Priority | Batch |
| --- | ------------------------------------------------------------------------------------------------------------ | -------- | ----- |
| 1   | **File context panel** — "@" button, context chips, file/folder picker                                       | High     | A     |
| 2   | **File diff preview** — Inline diff with accept/reject for sub-agent changes                                 | High     | A     |
| 3   | **Component extraction** — AgentHub.jsx (2100→~600 lines): extract ChatInput, ChatMessageList, SessionHeader | High     | B     |
| 4   | **Conversation branching** — Fork from any message (ChatGPT-style)                                           | Medium   | B     |
| 5   | **Agent cards with metrics** — Progress bars, tools completed, elapsed time, files modified                  | High     | C     |
| 6   | **Live trace preview** — Mini view of last tool executed per agent                                           | Medium   | C     |
| 7   | **Timeline/Gantt view** — Temporal activity view for agents                                                  | Low      | C     |
| 8   | **Launch agents from Swarm** — Button to launch new agents from SwarmControl                                 | Medium   | C     |
| 9   | **Click → terminal** — Click agent opens dedicated terminal in side panel                                    | High     | D     |
| 10  | **Grouping by project/type** — Agents grouped by project and task type                                       | Medium   | C     |
| 11  | **Terminal in side panel** — Resizable panel with xterm.js (already installed)                               | High     | D     |
| 12  | **Tabs per agent** — Each active sub-agent has its terminal tab                                              | Medium   | D     |
| 13  | **Auto-scroll + search** — Smart search in terminal output                                                   | Low      | D     |
| 14  | **Theme sync** — Terminal respects app theme (CSS vars)                                                      | Medium   | D     |
| 15  | **Skeleton screens** — Replace spinners with skeletons                                                       | Medium   | E     |
| 16  | **Keyboard shortcuts** — Global: Cmd+K, Cmd+Enter, Esc, Cmd+N                                                | High     | E     |
| 17  | **Accessibility** — ARIA labels, focus management, screen reader                                             | Medium   | E     |
| 18  | **Responsive mobile** — Stack layout for mobile                                                              | Low      | E     |
| 19  | **Onboarding/tutorial** — Initial tour for new users                                                         | Low      | E     |

### Out of Scope

- Soporte multimodal (imágenes, audio)
- Colaboración en tiempo real (multi-user)
- Integración con GitHub PRs desde el chat
- Agent self-improvement / learning

## Approach

**5 batches independently testable**, implemented in priority order:

### Batch A: File Context & Diff (highest impact)

- **File Context**: Add "@" button to ChatInput → opens file/folder picker → inserts context chips into message. Reuse existing `DiffViewer.jsx` for diff rendering.
- **File Diff Preview**: When sub-agent modifies files, parse trace for file changes → render inline diff with accept/reject buttons. Store decisions in `agent_hub_messages` metadata.

### Batch B: Architecture & Branching

- **Component Extraction**: Extract `ChatInput.jsx`, `ChatMessageList.jsx`, `SessionHeader.jsx` from `AgentHub.jsx` (2100 lines). Maintain SSE logic intact. Target: ~600 lines for AgentHub.
- **Conversation Branching**: Add "fork" button on each message → create new conversation from that message ID. Requires DB: copy messages up to fork point, create new session.

### Batch C: Swarm Control Pro

- Enhance `SwarmControl.jsx` (1272 lines) with agent metric cards, live trace previews, timeline view, grouping, and launch-from-swarm.
- Reuse existing `useAgentTraces` hook and SSE infrastructure.
- Add progress calculation from trace data (tools completed / total tools).

### Batch D: Terminal Side Panel Integration

- Create `TerminalSidePanel.jsx` using existing `TerminalTTY.jsx` (already supports WebSocket, resize, theme).
- Tab system per active agent — each sub-agent gets a terminal tab.
- Click agent in SwarmControl → opens side panel with that agent's terminal.
- Theme sync: read CSS vars from `getComputedStyle` and apply to xterm theme (TerminalTTY already supports dynamic themes).

### Batch E: UX Polish

- Skeleton components for loading states (replace all spinners).
- Global keyboard shortcut manager (Cmd+K already exists, add Cmd+Enter send, Esc close modals, Cmd+N new conversation).
- ARIA audit: add labels to all interactive elements, focus trap in modals.
- Responsive: CSS media queries to stack chat layout on mobile (<768px).
- Onboarding: intro tour using `react-joyride` or custom overlay (3-4 steps).

## Affected Areas

| Area                                         | Impact             | Description                                                       |
| -------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `src/views/AgentHub.jsx`                     | Modified → Reduced | Extract components (2100→~600 lines), add file context, branching |
| `src/views/SwarmControl.jsx`                 | Modified           | Add agent metrics, trace preview, timeline, grouping, launch      |
| `src/components/chat/ChatInput.jsx`          | New                | Extracted from AgentHub + file context "@" button                 |
| `src/components/chat/ChatMessageList.jsx`    | New                | Extracted from AgentHub                                           |
| `src/components/chat/SessionHeader.jsx`      | New                | Extracted from AgentHub                                           |
| `src/components/chat/FileContextPicker.jsx`  | New                | File/folder selector with context chips                           |
| `src/components/chat/FileDiffPreview.jsx`    | New                | Inline diff with accept/reject                                    |
| `src/components/chat/ConversationBranch.jsx` | New                | Fork conversation UI                                              |
| `src/components/SwarmAgentCard.jsx`          | New                | Agent card with metrics & progress                                |
| `src/components/SwarmTimeline.jsx`           | New                | Gantt/timeline view                                               |
| `src/components/TerminalSidePanel.jsx`       | New                | Resizable side panel with tabs                                    |
| `src/components/SkeletonLoader.jsx`          | New                | Reusable skeleton components                                      |
| `src/components/KeyboardShortcuts.jsx`       | New                | Global shortcut manager                                           |
| `src/components/OnboardingTour.jsx`          | New                | Intro tour for new users                                          |
| `src/components/DiffViewer.jsx`              | Modified           | Enhance for inline chat diff                                      |
| `src/components/TerminalTTY.jsx`             | Modified           | Theme sync with CSS vars                                          |
| `src/hooks/useKeyboardShortcuts.js`          | New                | Custom hook for shortcuts                                         |
| `src/hooks/useAgentMetrics.js`               | New                | Custom hook for agent metrics                                     |
| `src/app/api/agenthub/branch/route.js`       | New                | API for conversation branching                                    |

## Risks

| Risk                                                 | Likelihood | Mitigation                                                                      |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| SSE breakage during AgentHub extraction              | Medium     | Extract incrementally, verify SSE after each component, keep original as backup |
| File context picker performance with large repos     | Medium     | Limit to 50 files, add search/filter, lazy-load tree                            |
| Conversation branching data integrity                | Low        | Use DB transactions, validate fork point exists                                 |
| Terminal WebSocket conflicts with existing terminals | Low        | Use unique session IDs per side-panel terminal                                  |
| xterm.js theme sync flicker on theme change          | Medium     | Debounce theme updates, use CSS vars directly in xterm config                   |
| Onboarding tour intrusive for existing users         | Low        | Show only once, store in localStorage, easy dismiss                             |

## Rollback Plan

1. **Batch A**: Revert file context/diff commits — no DB changes, pure UI additions
2. **Batch B**: Keep extracted components but restore AgentHub.jsx from backup if SSE breaks
3. **Batch C**: SwarmControl enhancements are additive — remove new components, restore original
4. **Batch D**: Terminal side panel is isolated — remove component, no data impact
5. **Batch E**: Polish changes are cosmetic — easily reversible per-commit

Each batch is independently revertible via git.

## Dependencies

- `xterm` + `xterm-addon-fit` — already installed
- `cmdk` — already installed, ChatCommandPalette.jsx exists
- `react-resizable-panels` — already installed
- `DiffViewer.jsx` — already exists, needs enhancement
- CSS vars system — already defined in globals.css (8 themes)
- `useAgentTraces` hook — already exists
- SSE infrastructure — already operational

## Success Criteria

- [ ] AgentHub.jsx < 800 lines after component extraction
- [ ] "@" button in chat input opens file picker, context chips render in messages
- [ ] File diff preview shows accept/reject for sub-agent file changes
- [ ] Conversation fork creates new session from any message
- [ ] SwarmControl shows agent cards with progress bars, elapsed time, tools completed
- [ ] Click agent in SwarmControl → opens terminal side panel with agent's tab
- [ ] Terminal side panel resizable, themed, with tabs per agent
- [ ] All spinners replaced with skeleton screens
- [ ] Global keyboard shortcuts functional (Cmd+K, Cmd+Enter, Esc, Cmd+N)
- [ ] Lighthouse accessibility score > 90 for chat view
- [ ] Chat layout stacks correctly on mobile (375px viewport)
- [ ] Onboarding tour shows on first visit, dismissable, non-repeating

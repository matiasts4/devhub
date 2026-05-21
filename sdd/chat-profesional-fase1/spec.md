# Spec: Chat Profesional Fase 1

## Metadata

- **Change**: `chat-profesional-fase1`
- **Version**: 1.0
- **Date**: 2026-04-03
- **Status**: Draft
- **Related Proposal**: `sdd/chat-profesional-fase1/proposal.md`

---

## D1: Theme Unification

### Requirement D1-1: All hardcoded hex colors in chat components must use CSS vars

**Components affected** (12 total):

1. `src/views/AgentHub.jsx`
2. `src/components/chat/OpenCodeSubagentCard.jsx`
3. `src/components/chat/AgentTracePanel.jsx`
4. `src/components/chat/MCPAccordion.jsx`
5. `src/components/chat/CodeBlock.jsx`
6. `src/components/chat/StreamingMessage.jsx`
7. `src/components/chat/SessionListModal.jsx`
8. `src/components/chat/MCPStatusPanel.jsx`
9. `src/components/chat/TokenUsageBadge.jsx`
10. `src/components/chat/TraceSearchBar.jsx`
11. `src/components/chat/OutputViewerModal.jsx`
12. `src/components/chat/PermissionModal.jsx`

### Requirement D1-2: CSS var mapping table

| Hardcoded value       | CSS var                                        | Usage context                                    |
| --------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `#090c13`             | `var(--surface-app)`                           | App background, main container bg                |
| `#111825`             | `var(--surface-muted)`                         | Card backgrounds, modal backgrounds, input areas |
| `#182234`             | `var(--surface-card)`                          | Secondary card surfaces, hover states            |
| `#1e2a3f`             | `var(--surface-elevated)`                      | Elevated surfaces, button backgrounds            |
| `#0c1018`             | `var(--surface-muted)` (darkened)              | Code block backgrounds, terminal areas           |
| `#070c14`             | `var(--surface-muted)` (darker)                | Pre/code block inner backgrounds                 |
| `#1a2233` / `#1a2333` | `var(--border-subtle)`                         | Border colors                                    |
| `#2a3441`             | `var(--border-strong)`                         | Stronger borders, separators                     |
| `#5b8cff`             | `var(--accent-primary)`                        | Primary accent, links, active states             |
| `#4676e8`             | `var(--accent-secondary)`                      | Hover accent                                     |
| `#9bc2ff`             | Derived from `var(--accent-primary)` (lighter) | Code text color                                  |
| `#f0f6fc`             | `var(--text-primary)`                          | Primary text (deep-sea theme)                    |
| `#c9d1d9`             | `var(--text-secondary)`                        | Secondary text                                   |
| `#8b949e`             | `var(--text-muted)`                            | Muted text, placeholders                         |
| `text-gray-200`       | `var(--text-primary)`                          | Primary text                                     |
| `text-gray-300`       | `var(--text-secondary)`                        | Secondary text                                   |
| `text-gray-400`       | `var(--text-muted)`                            | Muted text                                       |
| `text-gray-500`       | `var(--text-muted)`                            | Disabled/muted text                              |
| `text-gray-600`       | `var(--text-muted)` (darker)                   | Very muted text                                  |
| `text-gray-100`       | `var(--text-primary)`                          | Bright text                                      |
| `bg-black/70`         | `var(--surface-app)` with opacity              | Modal overlays                                   |
| `bg-black/40`         | `var(--surface-app)` with opacity              | Disabled overlays                                |

### Requirement D1-3: Semantic color vars for status indicators

Status colors (amber, emerald, red, violet, cyan) must use CSS vars where available, or use Tailwind semantic classes that adapt to theme:

| Color   | Tailwind class     | CSS var equivalent              |
| ------- | ------------------ | ------------------------------- |
| Amber   | `text-amber-500`   | `var(--warning)` (to be added)  |
| Emerald | `text-emerald-500` | `var(--success)` (exists)       |
| Red     | `text-red-500`     | `var(--danger)` (exists)        |
| Violet  | `text-violet-400`  | `var(--info)` (to be added)     |
| Cyan    | `text-cyan-400`    | `var(--info-alt)` (to be added) |

### Requirement D1-4: Light mode contrast

All text in light mode (`[data-theme='light']`) must maintain a minimum contrast ratio of 4.5:1 against its background per WCAG AA.

### Requirement D1-5: Instant theme switching

Theme switching must apply instantly without page reload. All CSS vars are already defined per `[data-theme='...']` selector in `globals.css`. No additional JS logic needed beyond the existing theme switcher.

### Scenario D1-S1: Theme swap verification

```
GIVEN the user is viewing the AgentHub chat with the "deep-sea" theme active
WHEN the user switches to the "light" theme via the theme selector
THEN all chat component backgrounds, borders, text colors, and accents update instantly
AND no hardcoded hex colors remain visible in any component
AND the page does not reload
```

### Scenario D1-S2: Light mode contrast check

```
GIVEN the user has the "light" theme active
WHEN viewing any text element in the chat interface
THEN the contrast ratio between text and background is >= 4.5:1
```

### Acceptance Criteria D1-AC

- [ ] Zero hardcoded hex color values (`#[0-9a-fA-F]{3,8}`) in any of the 12 affected components
- [ ] All color references use either `var(--*)` CSS custom properties or Tailwind utility classes
- [ ] Theme switch works instantly (no flash, no reload)
- [ ] All 8 themes (deep-sea, nord, dracula, light, catppuccin, tokyo-night, monokai, synthwave) render correctly
- [ ] Light mode passes WCAG AA 4.5:1 contrast for all text

---

## D2: Message Editing & Regeneration

### Requirement D2-1: User message editing

Users can edit their own messages (role === 'user'). A pencil/edit icon appears on hover over user messages.

### Requirement D2-2: Edit UI behavior

When the edit icon is clicked:

- The message content area transforms into a textarea pre-filled with the original message content
- The textarea has the same styling as the main chat input
- Two action buttons appear: "Save" (checkmark) and "Cancel" (X)
- The original message is visually dimmed until save/cancel

### Requirement D2-3: Save behavior with truncation

On save:

1. The edited message content is updated in the local `messages` state
2. All messages that came AFTER the edited message are removed (conversation truncation)
3. The truncated messages are deleted from Supabase (`agent_hub_messages` table)
4. A new LLM response is generated using the edited message as the new conversation branch
5. The `isStreaming` state is activated and `processLLM` is called with the truncated message array

### Requirement D2-4: Cancel behavior

On cancel (or pressing Escape):

- The editing state is cleared
- The message reverts to its original display (no changes persisted)

### Requirement D2-5: Assistant message regeneration

Assistant messages (role === 'assistant') display a regeneration icon (refresh/reload) on hover.
When clicked:

1. All messages after the assistant message are removed (truncation)
2. The conversation is re-sent to the LLM from the beginning up to and including the assistant message's preceding user message
3. A new streaming response is generated

### Requirement D2-6: Copy button per message

Every message (user, assistant, subagent) has a copy button visible on hover.
Clicking copies the raw message content to clipboard.

### Requirement D2-7: Keyboard shortcuts

| Shortcut                   | Action              |
| -------------------------- | ------------------- |
| `Escape`                   | Cancel editing mode |
| `Ctrl+Enter` / `Cmd+Enter` | Save edited message |

### Requirement D2-8: Message action bar

Each message displays an action bar on hover with:

- **User messages**: Edit (pencil), Copy
- **Assistant messages**: Regenerate (refresh), Copy
- **Subagent messages**: Copy

### Scenario D2-S1: Edit and save user message

```
GIVEN a conversation with 3 user messages and 2 assistant responses
WHEN the user clicks the edit icon on the 2nd user message
THEN a textarea appears with the original message content
AND Save and Cancel buttons are visible
WHEN the user modifies the text and clicks Save (or presses Ctrl+Enter)
THEN the 2nd user message is updated
AND the 3rd user message and 2nd assistant response are removed
AND a new LLM response begins streaming
```

### Scenario D2-S2: Cancel edit

```
GIVEN the user is editing a message
WHEN the user clicks Cancel or presses Escape
THEN the editing UI closes
AND the message displays its original content unchanged
```

### Scenario D2-S3: Regenerate assistant response

```
GIVEN an assistant message is fully rendered
WHEN the user clicks the regenerate icon
THEN all messages after this assistant message are removed
AND a new streaming response is generated
```

### Acceptance Criteria D2-AC

- [ ] User messages show edit icon on hover
- [ ] Edit mode pre-fills textarea with original content
- [ ] Save truncates subsequent messages and triggers new LLM call
- [ ] Cancel restores original state
- [ ] Assistant messages show regenerate icon on hover
- [ ] Regenerate truncates and re-streams
- [ ] Copy button works on all message types
- [ ] Escape cancels edit, Ctrl+Enter saves edit
- [ ] Truncated messages are deleted from Supabase

---

## D3: Command Palette (Cmd+K)

### Requirement D3-1: Trigger

The command palette opens with `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux).
It closes with `Escape`.

### Requirement D3-2: Implementation

Uses the existing `cmdk` library (already installed in `package.json` as `cmdk: ^1.1.1`).
The component is `src/components/chat/CommandPalette.jsx`.

### Requirement D3-3: Sections

The palette contains 4 sections:

| Section      | Source                                   | Action                             |
| ------------ | ---------------------------------------- | ---------------------------------- |
| **Sessions** | `sessions` state from AgentHub           | Navigate to session (loadMessages) |
| **Projects** | `useOutletContext()` project + API       | Navigate to project (useNavigate)  |
| **Commands** | `slashCommands` from `@/lib/slashSkills` | Insert slash command into input    |
| **Settings** | Static list                              | Navigate to settings page          |

### Requirement D3-4: Fuzzy search

All sections support fuzzy text search via cmdk's built-in filtering. The search input is at the top of the palette.

### Requirement D3-5: Keyboard navigation

- `ArrowDown` / `ArrowUp`: Navigate items
- `Enter`: Select highlighted item
- `Escape`: Close palette

### Requirement D3-6: Visual design

- Modal overlay with backdrop blur
- Centered panel with max-width ~560px
- Sections separated by headers
- Each item shows an icon, label, and optional description
- Keyboard shortcut hints in footer (↑↓ navigate, Enter select, Esc close)

### Scenario D3-S1: Open and search sessions

```
GIVEN the user is on the AgentHub page
WHEN the user presses Cmd+K
THEN the command palette appears centered on screen
AND the search input is focused
WHEN the user types "login"
THEN sessions with "login" in the title are shown
AND matching slash commands are shown
WHEN the user presses Enter on a session
THEN the palette closes and that session's messages are loaded
```

### Scenario D3-S2: Execute slash command

```
GIVEN the command palette is open
WHEN the user types "/plan"
THEN the /plan slash command is highlighted
WHEN the user presses Enter
THEN the palette closes
AND "/plan " is inserted into the chat input
AND the input is focused
```

### Acceptance Criteria D3-AC

- [ ] Cmd+K / Ctrl+K opens the palette
- [ ] Escape closes the palette
- [ ] Fuzzy search works across all sections
- [ ] Arrow key navigation works
- [ ] Enter selects the highlighted item
- [ ] Sessions section shows clickable session list
- [ ] Commands section shows slash commands with icons
- [ ] Settings section shows navigation items
- [ ] Palette has proper focus trap and accessibility

---

## D4: Terminal Output in Traces

### Requirement D4-1: Bash tool output rendering

Tool rows where `part.toolName` contains "bash", "execute_command", or "shell" render their `toolOutput` with ANSI color support.

### Requirement D4-2: ANSI-to-HTML conversion

Use a lightweight ANSI-to-HTML conversion library (not full xterm for inline rendering). Recommended: `ansi-to-html` or a custom regex-based converter. The output must preserve:

- Color codes (foreground/background)
- Bold, dim, italic, underline
- Reset sequences

### Requirement D4-3: Collapsible output

- For **completed** tools: output is collapsed by default (only shows tool name, status, timing)
- For **running** tools: output is expanded by default to show live streaming
- User can manually expand/collapse any tool output

### Requirement D4-4: Copy button

Each bash tool output has a copy button that copies the raw (unformatted) output to clipboard.

### Requirement D4-5: Max height with scroll

Terminal output containers have a maximum height of 420px with vertical scrolling.

### Requirement D4-6: Live streaming for running tools

When a bash tool is in "running" status, new output is appended in real-time as it arrives via SSE trace events.

### Requirement D4-7: No xterm.js for inline rendering

xterm.js is NOT used for inline tool output rendering (too heavy). It remains available for full-screen terminal views if needed in the future. The inline renderer uses ANSI-to-HTML conversion only.

### Scenario D4-S1: View completed bash output

```
GIVEN a sub-agent has completed a bash tool call
WHEN the user views the trace panel
THEN the bash tool row shows the command name and status
AND the output is collapsed by default
WHEN the user clicks to expand
THEN the output renders with ANSI colors preserved
AND a copy button is visible
AND the output scrolls if it exceeds 420px
```

### Scenario D4-S2: Live streaming bash output

```
GIVEN a bash tool is currently running
WHEN the trace panel is visible
THEN the tool output is expanded by default
AND new output lines appear as they are received
AND the panel auto-scrolls to the latest output
```

### Acceptance Criteria D4-AC

- [ ] Bash tool outputs render ANSI color codes correctly
- [ ] Completed tools show collapsed output by default
- [ ] Running tools show expanded output by default
- [ ] Copy button copies raw output (no HTML)
- [ ] Max height 420px with scroll
- [ ] Live output streams for running tools
- [ ] No xterm.js used for inline rendering

---

## D5: Code Block Enhancements

### Requirement D5-1: Line numbers

Code blocks display line numbers on the left side, right-aligned, with muted color.
Line numbers are non-selectable (`user-select: none`).

### Requirement D5-2: Word wrap toggle

A toggle button in the code block header allows switching between:

- **No wrap** (default): horizontal scroll, `overflow-x: auto`
- **Wrap**: `white-space: pre-wrap`, `word-break: break-all`

The toggle state persists per code block during the session (not persisted across reloads).

### Requirement D5-3: Filename display

If the markdown info string contains a filename (e.g., ` ```typescript:src/auth.ts `), the filename is displayed in the header bar next to the language label.

### Requirement D5-4: Copy button preserved

The existing copy button remains functional and visible in the header.

### Requirement D5-5: Theme consistency

No hardcoded colors in CodeBlock.jsx. All colors use CSS vars or Tailwind utility classes.

### Scenario D5-S1: Code block with filename

```
GIVEN the assistant sends a code block with info string "typescript:src/auth.ts"
WHEN the code block renders
THEN the header shows "typescript" and "src/auth.ts"
AND line numbers appear on the left
AND the copy button is in the top-right
```

### Scenario D5-S2: Toggle word wrap

```
GIVEN a code block with long lines is displayed
WHEN the user clicks the word wrap toggle button
THEN the code text wraps to multiple lines
AND horizontal scrolling is disabled
WHEN the user clicks the toggle again
THEN the code returns to horizontal scroll mode
```

### Acceptance Criteria D5-AC

- [ ] Line numbers display on left side of code blocks
- [ ] Line numbers are non-selectable and muted
- [ ] Word wrap toggle button exists and works
- [ ] Filename from info string displays in header
- [ ] Copy button still works
- [ ] Zero hardcoded colors in CodeBlock.jsx

---

## D6: Bug Fixes

### Requirement D6-1: Fix ToolRow "Ver completo" button

**Bug**: The "Ver completo" button in `AgentTracePanel.jsx` (ToolRow component, line ~207) calls `handleViewFull` which sets `setShowFull(false)` instead of `setShowFull(true)`. The modal never opens.

**Fix**: Change `setShowFull(false)` to `setShowFull(true)` in the `handleViewFull` callback.

### Requirement D6-2: Remove or implement the dead "+" button

**Bug**: The "+" button in the chat input area (AgentHub.jsx, line ~1395-1400) has no `onClick` handler and does nothing. It shows "Adjuntar Contexto" as tooltip.

**Fix**: Option A — Remove the button entirely (simplest, out of scope for file attachment). Option B — Disable it visually with `disabled` attribute and reduced opacity. **Decision: Option A** — remove the button. File attachment is explicitly out of scope for Fase 1.

### Requirement D6-3: Eliminate double polling in usage tracking

**Bug**: Two separate mechanisms poll for session usage data:

1. `useSessionUsage` hook (auto-refreshes every 5 seconds, line 90-94 of `useSessionUsage.js`)
2. Inline `sessionUsage` state in AgentHub.jsx (updated via SSE `usage` events, line 476-478)

The `mergedUsage` useMemo (line 174-177) merges both, but this creates redundant polling and potential state conflicts.

**Fix**:

1. Remove the inline `sessionUsage` state and `setSessionUsage` calls from AgentHub.jsx
2. Use ONLY the `useSessionUsage` hook for usage data
3. The SSE `usage` events should update the hook's state via a callback, OR the hook's 5-second polling is sufficient
4. **Decision**: Keep the hook's 5-second polling as the single source of truth. Remove inline `sessionUsage` state. Remove the `mergedUsage` useMemo. Use `sessionUsageHook.usage` directly.

### Scenario D6-S1: "Ver completo" opens modal

```
GIVEN a tool output is truncated (longer than 1200 chars)
WHEN the user clicks "Ver completo"
THEN the OutputViewerModal opens with the full output
```

### Scenario D6-S2: No dead "+" button

```
GIVEN the user views the chat input area
THEN there is no non-functional "+" button visible
```

### Scenario D6-S3: Single usage polling source

```
GIVEN the user has an active chat session
WHEN viewing the TokenUsageBadge
THEN usage data comes from a single source (useSessionUsage hook)
AND there are no duplicate API calls for usage data
```

### Acceptance Criteria D6-AC

- [ ] "Ver completo" button opens OutputViewerModal with full content
- [ ] "+" button is removed from chat input
- [ ] Only one mechanism polls/fetches usage data
- [ ] No `sessionUsage` inline state in AgentHub.jsx
- [ ] No `mergedUsage` useMemo in AgentHook.jsx

---

## D7: Stop Generating Button

### Requirement D7-1: Stop button for normal LLM streaming

A "Stop Generating" button appears during normal LLM streaming responses (the `processLLM` function in AgentHub.jsx). This is separate from the existing sub-agent cancel button.

### Requirement D7-2: AbortController integration

The `processLLM` function must use an `AbortController` to cancel the SSE stream:

1. Create `const llmAbortController = useRef<AbortController>(null)` in AgentHub
2. Before calling `fetch('/api/agenthub/chat', ...)`, create a new AbortController and store in ref
3. Pass `{ signal: llmAbortController.current.signal }` to fetch
4. The stop button calls `llmAbortController.current.abort()`

### Requirement D7-3: Visual behavior

- Button appears ONLY when `isStreaming === true`
- Button disappears when streaming completes or is aborted
- Button shows a stop icon (Square from lucide-react) with "Detener" text
- Button has red/danger styling consistent with other stop buttons in the app

### Requirement D7-4: Post-stop behavior

When the user clicks stop:

1. The AbortController aborts the fetch
2. `isStreaming` is set to `false`
3. Any content received so far is flushed to messages state (partial response)
4. `isTyping` is set to `false`
5. The user can send a new message immediately

### Requirement D7-5: Location

The stop button is positioned in the input area, replacing the send button during streaming (or adjacent to it).

### Scenario D7-S1: Stop mid-stream

```
GIVEN the LLM is streaming a response
WHEN the user clicks the "Detener" button
THEN the SSE stream is aborted
AND the partial response is saved as a message
AND the input area becomes active again
AND the user can type a new message
```

### Scenario D7-S2: Button visibility

```
GIVEN no streaming is in progress
THEN the stop button is NOT visible
AND the normal send button IS visible
WHEN streaming starts
THEN the send button is replaced by (or accompanied with) the stop button
WHEN streaming completes
THEN the stop button disappears and the send button returns
```

### Acceptance Criteria D7-AC

- [ ] Stop button appears during LLM streaming
- [ ] Stop button uses AbortController to cancel fetch
- [ ] Partial response is saved when stopped
- [ ] Input is re-enabled after stop
- [ ] Stop button has red/danger styling
- [ ] Stop button does not interfere with sub-agent cancel functionality

---

## Non-Functional Requirements

### NFR-1: Performance

- Message editing truncation must complete in < 500ms for conversations with up to 100 messages
- Command palette must open in < 100ms
- ANSI-to-HTML conversion must handle outputs up to 50KB without blocking the main thread
- Code block line numbers must not cause re-render of entire message list

### NFR-2: Accessibility

- All interactive elements must have `aria-label` or accessible text
- Command palette must trap focus and announce via screen reader
- Message edit/save/cancel buttons must be keyboard accessible
- Contrast ratio >= 4.5:1 in light mode (WCAG AA)
- Escape key must close all modals and palettes

### NFR-3: Backwards Compatibility

- Existing SSE streaming logic must not be modified in a breaking way
- Database schema changes are NOT required (existing `agent_hub_messages` table supports truncation via DELETE)
- All existing chat functionality must work after refactoring

### NFR-4: Code Quality

- AgentHub.jsx must be reduced to < 800 lines after component extraction
- New components must follow existing naming conventions (PascalCase, `.jsx` extension)
- No new external dependencies except `ansi-to-html` (or equivalent lightweight ANSI parser)
- All new components must be placed in `src/components/chat/`

---

## Implementation Order

| Order | Deliverable                        | Dependencies                          |
| ----- | ---------------------------------- | ------------------------------------- |
| 1     | D6: Bug Fixes                      | None (quick wins, unblock other work) |
| 2     | D1: Theme Unification              | None (foundational)                   |
| 3     | D7: Stop Generating Button         | D1 (for consistent styling)           |
| 4     | D2: Message Editing & Regeneration | D6-3 (single usage source)            |
| 5     | D5: Code Block Enhancements        | D1 (theme consistency)                |
| 6     | D4: Terminal Output in Traces      | D1 (theme consistency)                |
| 7     | D3: Command Palette                | None (independent)                    |

---

## Out of Scope (explicitly excluded)

- File attachment / @-mentions
- File diff preview
- Conversation branching (edit creates new branch)
- Soporte multimodal (images, audio)
- Mejoras en SwarmControl
- Diseño responsive mobile
- xterm.js full terminal integration (ANSI-to-HTML only)
- Persisting word wrap preference across sessions
- Message edit history / undo

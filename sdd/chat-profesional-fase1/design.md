# Technical Design: Chat Profesional Fase 1

## 1. Architecture Overview

### Current State

```
AgentHub.jsx (1512 lines)
├── State: 20+ useState hooks
├── Effects: 8+ useEffect hooks
├── Logic: Session mgmt, streaming, sub-agents, MCP, permissions
├── UI: Header, message list, input area, modals, panels
└── All hardcoded hex colors (~40 instances)
```

### Target State

```
AgentHub.jsx (~300 lines) — Orchestrator only
├── SessionHeader.jsx — Title, model selector, usage badge, actions
├── ChatMessageList.jsx — Message rendering with streaming
│   ├── MessageBubble.jsx — Individual message with edit support
│   ├── MessageActions.jsx — Edit, copy, regenerate actions
│   └── StreamingMessage.jsx — RAF-optimized streaming (enhanced)
├── ChatInput.jsx — Input area with slash commands, file context, send
│   └── SlashMenu.jsx — Extracted from inline JSX
├── ChatCommandPalette.jsx — Cmd+K command palette (new)
├── CodeBlock.jsx — Enhanced with line numbers, word wrap, filename
├── ansiToHtml.js — ANSI escape code to HTML converter (new)
└── AgentTracePanel.jsx — Enhanced with terminal output rendering
```

## 2. Component Hierarchy

```
AgentHub (orchestrator)
├── SessionHeader
│   ├── TokenUsageBadge (existing)
│   ├── MCPStatusPanel toggle
│   ├── Context compression button
│   ├── Session list trigger
│   ├── Session dropdown
│   └── New session button
├── ChatMessageList
│   ├── EmptyState (welcome screen)
│   ├── MessageBubble (user/assistant)
│   │   ├── ChatMarkdown
│   │   │   └── CodeBlock (enhanced)
│   │   └── MessageActions (new)
│   ├── MCPAccordion (existing, migrated)
│   ├── OpenCodeSubagentCard (existing, migrated)
│   │   └── AgentTracePanel (enhanced)
│   │       ├── ToolRow (with terminal output)
│   │       ├── ReasoningRow
│   │       ├── TextRow
│   │       └── SubtaskRow
│   ├── StreamingMessage (enhanced)
│   └── SubagentWaitingIndicator
├── ChatInput
│   ├── Textarea
│   ├── SlashMenu
│   ├── Context attachment button
│   ├── Agent Teams Lite badge
│   ├── Model selector dropdown
│   └── Send/Stop button
├── ChatCommandPalette (new)
├── SessionListModal (migrated)
├── PermissionModal (migrated)
├── OutputViewerModal (migrated)
└── MCPStatusPanel (migrated)
```

## 3. State Management Decisions

### 3.1 Component Extraction Strategy

**Decision**: Extract components progressively, starting with leaf components that have minimal state dependencies.

**Rationale**:

- AgentHub.jsx has 20+ state variables that are shared across the UI
- Extracting stateful components first would require prop drilling or context
- Leaf components (CodeBlock, StreamingMessage) can be extracted independently
- Message list extraction requires careful state management for editing

**Approach**:

1. Extract stateless/pure components first (CodeBlock enhancements)
2. Extract components with local state (ChatInput with slash menu)
3. Extract complex components with callbacks (ChatMessageList)
4. Refactor AgentHub to orchestrator pattern

### 3.2 Message Editing State

```javascript
// New state in AgentHub (or ChatMessageList context)
const [editingMessageId, setEditingMessageId] = (useState < string) | (null > null);
const [editDraft, setEditDraft] = useState < string > '';

// Edit flow:
// 1. User clicks edit on a message
// 2. Set editingMessageId and editDraft
// 3. Show inline editor in MessageBubble
// 4. On save:
//    - Truncate messages array after edited message
//    - Update message content
//    - Re-send from that point (re-processLLM)
// 5. Optimistic UI: show edited content immediately

// Regenerate flow:
// 1. User clicks regenerate on assistant message
// 2. Remove last assistant message
// 3. Re-send last user message
// 4. Show streaming indicator
```

### 3.3 Stop Generating Implementation

```javascript
// New state in AgentHub
const [llmAbortController, setLlmAbortController] = useState<AbortController | null>(null);

// In processLLM:
const controller = new AbortController();
setLlmAbortController(controller);

const res = await fetch('/api/agenthub/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
  signal: controller.signal,
});

// Stop button calls:
const stopGenerating = () => {
  llmAbortController?.abort();
  setLlmAbortController(null);
  setIsStreaming(false);
  setIsTyping(false);
  // Flush partial content to messages
  if (streamingContentRef.current) {
    const partialMessage = {
      id: crypto.randomUUID(),
      session_id: currentSessionId,
      role: 'assistant',
      content: streamingContentRef.current,
      meta: JSON.stringify({ model: streamingModel, stopped: true }),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, partialMessage]);
    supabase.from('agent_hub_messages').insert(partialMessage);
  }
};
```

## 4. Data Flow for Each Deliverable

### 4.1 Theme Migration

**Mapping Table**:
| Hardcoded Hex | CSS Variable | Usage |
|---------------|--------------|-------|
| `#090c13` | `var(--bg-primary)` | Main background |
| `#111825` | `var(--bg-card)` | Card/modal backgrounds |
| `#1a2333` | `var(--border-primary)` | Primary borders |
| `#2a3441` | `var(--border-secondary)` | Secondary borders |
| `#5b8cff` | `var(--accent-primary)` | Primary accent |
| `#1e2a3f` | `var(--bg-hover)` | Hover states |
| `#182234` | `var(--bg-input)` | Input backgrounds |
| `#0c1018` | `var(--bg-code)` | Code block backgrounds |
| `#070c14` | `var(--bg-terminal)` | Terminal/output backgrounds |
| `#9bc2ff` | `var(--text-code)` | Inline code text |
| `text-gray-100` | `var(--text-primary)` | Primary text |
| `text-gray-200` | `var(--text-secondary)` | Secondary text |
| `text-gray-300` | `var(--text-tertiary)` | Tertiary text |
| `text-gray-400` | `var(--text-muted)` | Muted text |
| `text-gray-500` | `var(--text-dimmed)` | Dimmed text |
| `text-gray-600` | `var(--text-disabled)` | Disabled text |

**Migration Strategy**:

1. Add CSS variables to `globals.css` for all 8 themes
2. Create migration utility: `src/lib/theme/colors.js`
3. Apply migration component by component (leaf to root)
4. Test in dark and light modes
5. No new CSS vars needed — map existing hardcoded values

### 4.2 Command Palette Integration

```javascript
// ChatCommandPalette.jsx
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';

export function ChatCommandPalette({ isOpen, onClose, sessions, projects, onNavigate }) {
  // Sections:
  // 1. Sessions (recent)
  // 2. Projects
  // 3. Commands (/slash commands)
  // 4. Settings

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

**Integration Point**: Add to AgentHub.jsx, wire up to existing session/project data.

### 4.3 Terminal Output Rendering

**Decision**: Custom regex-based ANSI-to-HTML converter (no new dependency)

**Implementation** (`src/components/chat/ansiToHtml.js`):

```javascript
// ANSI escape code regex patterns
const ANSI_CODES = {
  0: 'reset',
  1: 'font-weight: bold',
  2: 'opacity: 0.7',
  3: 'font-style: italic',
  4: 'text-decoration: underline',
  30: 'color: #000000',
  31: 'color: #ef4444', // red
  32: 'color: #22c55e', // green
  33: 'color: #eab308', // yellow
  34: 'color: #3b82f6', // blue
  35: 'color: #a855f7', // magenta
  36: 'color: #06b6d4', // cyan
  37: 'color: #ffffff', // white
  90: 'color: #6b7280', // bright black (gray)
  40: 'background-color: #000000',
  41: 'background-color: #ef4444',
  // ... more codes
};

export function ansiToHtml(text) {
  // Split by ANSI escape sequences
  // Convert to HTML spans with inline styles
  // Return HTML string
}
```

**Integration in ToolRow**:

```javascript
// In AgentTracePanel.jsx ToolRow component
import { ansiToHtml } from './ansiToHtml';

// For bash tool outputs:
const isBashOutput = part.toolName?.includes('bash') || part.toolName?.includes('shell');
const displayContent = isBashOutput ? ansiToHtml(displayOutput) : displayOutput;

// Render with dangerouslySetInnerHTML for bash outputs
{
  isBashOutput ? (
    <pre className="..." dangerouslySetInnerHTML={{ __html: displayContent }} />
  ) : (
    <pre className="...">{displayContent}</pre>
  );
}
```

### 4.4 Code Block Enhancements

**New Features**:

1. Line numbers via CSS counter
2. Word wrap toggle
3. Filename from info string

**Implementation** (`src/components/chat/CodeBlock.jsx`):

````javascript
export function BlockCode({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  // Extract filename from info string: ```typescript:src/foo.ts
  const codeClassName = children?.props?.className || '';
  const match = /language-(\w+)(?::(.+))?/.exec(codeClassName);
  const language = match?.[1] || 'text';
  const filename = match?.[2];

  const codeText = String(children?.props?.children || '').replace(/\n$/, '');
  const lines = codeText.split('\n');

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-[#2a3441] bg-[#0c1018]">
      {/* Header with filename, language, actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#111825] border-b border-[#2a3441]">
        <div className="flex items-center gap-2">
          {filename && <span className="text-xs text-gray-400 font-mono">{filename}</span>}
          <span className="text-xs text-gray-500 font-mono lowercase">{language}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWordWrap(!wordWrap)} title="Toggle word wrap">
            {/* Wrap icon */}
          </button>
          <button onClick={handleCopy}>{/* Copy icon */}</button>
        </div>
      </div>
      {/* Code with line numbers */}
      <div className={`p-4 overflow-x-auto ${wordWrap ? 'whitespace-pre-wrap' : ''}`}>
        <div className="flex">
          {/* Line numbers */}
          <div className="text-gray-600 select-none text-right pr-4 border-r border-[#2a3441] mr-4">
            {lines.map((_, i) => (
              <div key={i} className="leading-relaxed">
                {i + 1}
              </div>
            ))}
          </div>
          {/* Code content */}
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
````

### 4.5 Double Polling Fix (useSessionUsage)

**Problem**: The hook has two polling mechanisms:

1. Initial fetch on sessionId change
2. Auto-refresh every 5 seconds

**Issue**: When sessionId changes, both effects fire, causing double requests.

**Fix**:

```javascript
// Remove the separate auto-refresh effect
// Use a single effect that handles both initial and interval fetches
useEffect(() => {
  if (!sessionId) {
    setLoading(false);
    return;
  }

  fetchUsage(); // Initial fetch

  const interval = setInterval(fetchUsage, 5000);
  return () => clearInterval(interval);
}, [sessionId, fetchUsage]);
```

## 5. Risk Mitigation Strategies

| Risk                                               | Impact | Mitigation                                                       |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Component extraction breaks existing functionality | High   | Extract one component at a time, test after each extraction      |
| Theme migration breaks dark/light mode             | Medium | Test both modes after each component migration                   |
| Message editing causes data loss                   | High   | Implement optimistic UI with rollback on error                   |
| ANSI converter misses edge cases                   | Low    | Start with common codes, add more as needed                      |
| Command palette conflicts with existing shortcuts  | Medium | Check for existing Cmd+K usage, use different shortcut if needed |
| Stop generating leaves inconsistent state          | Medium | Flush partial content to messages and DB                         |

## 6. Migration Plan (Order of Changes)

### Phase 1: Foundation (Low Risk)

1. **Add CSS variables to globals.css** — Define all theme variables for 8 themes
2. **Create ansiToHtml.js** — Custom ANSI-to-HTML converter
3. **Fix useSessionUsage double polling** — Simple hook fix

### Phase 2: Component Enhancements (Medium Risk)

4. **Enhance CodeBlock.jsx** — Add line numbers, word wrap, filename
5. **Enhance StreamingMessage.jsx** — Add stop button support, theme migration
6. **Enhance AgentTracePanel.jsx** — Add terminal output rendering, theme migration

### Phase 3: New Features (Medium-High Risk)

7. **Create ChatCommandPalette.jsx** — Command palette with Cmd+K
8. **Create MessageActions.jsx** — Edit, copy, regenerate actions
9. **Implement message editing in AgentHub.jsx** — State management and UI

### Phase 4: Component Extraction (High Risk)

10. **Extract ChatInput.jsx** — Input area with slash commands
11. **Extract ChatMessageList.jsx** — Message rendering logic
12. **Extract SessionHeader.jsx** — Header component
13. **Refactor AgentHub.jsx** — Clean orchestrator pattern

### Phase 5: Theme Migration (Medium Risk)

14. **Migrate all chat components** — Apply CSS variables to all components
15. **Test all themes** — Verify dark/light mode for all components

## 7. File Changes Summary

### New Files

- `src/components/chat/ChatCommandPalette.jsx`
- `src/components/chat/MessageActions.jsx`
- `src/components/chat/ansiToHtml.js`

### Modified Files

- `src/views/AgentHub.jsx` — Theme migration, message editing, stop generating, component extraction
- `src/components/chat/OpenCodeSubagentCard.jsx` — Theme migration
- `src/components/chat/AgentTracePanel.jsx` — Terminal output, theme migration
- `src/components/chat/MCPAccordion.jsx` — Theme migration
- `src/components/chat/CodeBlock.jsx` — Line numbers, word wrap, filename, theme migration
- `src/components/chat/StreamingMessage.jsx` — Theme migration, stop button support
- `src/components/chat/SessionListModal.jsx` — Theme migration
- `src/components/chat/MCPStatusPanel.jsx` — Theme migration
- `src/components/chat/TokenUsageBadge.jsx` — Theme migration
- `src/components/chat/TraceSearchBar.jsx` — Theme migration
- `src/components/chat/OutputViewerModal.jsx` — Theme migration
- `src/components/chat/PermissionModal.jsx` — Theme migration
- `src/hooks/useSessionUsage.js` — Fix double polling
- `src/app/globals.css` — Add CSS variables for all themes

## 8. Testing Strategy

### Unit Tests

- `ansiToHtml.js` — Test common ANSI codes, edge cases
- `CodeBlock.jsx` — Test line numbers, word wrap, filename extraction
- `MessageActions.jsx` — Test edit, copy, regenerate actions

### Integration Tests

- Message editing flow — Edit, save, re-send
- Stop generating — Abort, flush partial content
- Command palette — Open, navigate, select

### Manual Testing

- Theme migration — Test all 8 themes in dark/light mode
- Component extraction — Verify no regression in functionality
- Terminal output — Test bash command output rendering

# Spec Delta: asistente-chat

> **Note**: No `openspec/specs/asistente-chat/spec.md` baseline exists. The
> previous zed-hardening change defined the greenfield `asistente-chat`
> capability at
> `openspec/changes/zed-hardening/specs/asistente-chat/spec.md` and was never
> promoted. This delta therefore documents the new behavior as `## ADDED
Requirements` against the de-facto baseline, not as `## MODIFIED
Requirements`.

## MODIFIED Requirements

(none)

## ADDED Requirements

### ASST-CHAT-001: Full `messages` State Sent as History

`ChatPanel.handleSend` MUST call `buildZedHistory(messages, maxLen=20)` on
EVERY send, passing the full `messages` state. The handler MUST NOT slice
off the last message before passing to `buildZedHistory`. The currently
rendered `messages` is the previous render's state (closure value) at the
time `handleSend` is invoked; that is exactly the state that needs to be
sent as `history` (the new user message is sent as the `message` field of
the same request body).

#### Scenario: Second send includes the first assistant turn

- **WHEN** the user has completed one full turn and the message list
  contains `[welcome, {user: 'abre una terminal'}, {assistant: 'listo',
tool_results: [{tool: 'open_terminal', result: {session_id: 'term-X'}}]}]`
- **AND** the user sends a second message
- **THEN** the request body's `history` MUST contain the previous assistant
  turn
- **AND** the `history` MUST contain the `tool_results`-derived
  `Tool open_terminal result: {"session_id":"term-X",…}` line
- **AND** the new user message MUST appear exactly once (as the `message`
  field, not duplicated inside `history`)

### ASST-CHAT-002: Stable Snapshot for the History Reference

The `messages` value passed to `buildZedHistory` MUST be a stable snapshot
of the conversation at send time, not a stale closure that excludes
previous assistant turns. Acceptable implementations include:

- Passing the full closure `messages` (server filters duplicate
  user-roles).
- Reading from a `useRef` that is updated synchronously in the
  `setMessages` callback.
- Using a `useCallback` whose dependency on the latest `messages` is
  established by a ref or by re-binding in render.

#### Scenario: Stable snapshot survives React re-render

- **WHEN** the user sends a 2nd message after a 1st turn that produced a
  `tool_results` entry
- **THEN** the request body's `history` MUST include the 1st-turn
  assistant message AND its `tool_results`
- **AND** MUST NOT be missing the previous assistant turn

### ASST-CHAT-003: System-Prompt Clause on Prior-Turn Context

The system prompt at `docs/prompts/asistente/zed-system-prompt.md` MUST
include an explicit clause instructing the model to treat prior turns as
user-visible context. The clause MUST be discoverable in the "After tool
execution" section and MUST include language equivalent to:

> When prior turns are present in the conversation, treat them as
> user-visible context. If the user references something from a prior
> turn (e.g., 'that terminal', 'the previous command'), use the history
> to resolve the reference rather than asking again.

#### Scenario: System prompt contains the prior-turn clause

- **WHEN** the prompt file is loaded
- **THEN** the prompt body MUST contain the substring equivalent to
  "treat them as user-visible context"
- **AND** the prompt body MUST contain the substring "use the history to
  resolve the reference"

#### Scenario: User reference resolves to prior turn

- **WHEN** the conversation history contains a prior assistant turn that
  opened a terminal
- **AND** the user sends "ahora corré `ls`" (or any reference to the prior
  turn)
- **THEN** the model MUST NOT call `open_terminal` again
- **AND** the model MUST call `execute_in_terminal` with the same
  `session_id` from the prior turn

### ASST-CHAT-004: Server `safeHistory` Filter Caps and Preserves

The server's `safeHistory` filter (`src/app/api/assistant/chat/route.js`)
MUST preserve the last 20 messages that pass the role/content check
(`role` is `'user'` or `'assistant'`, `content` is a non-empty string).
The server MUST NOT echo `tool_results` from a previous turn into the
new turn's `safeHistory` — `tool_results` remain server-side state and
are injected into the per-turn conversation only.

#### Scenario: 20 messages are preserved through the filter

- **WHEN** the client sends a `history` array of 25 well-formed messages
- **THEN** the server MUST return a response computed from the last 20
  messages of the original `history`
- **AND** the conversation seed MUST be `[...safeHistory, { user, message }]`

#### Scenario: `tool_results` do not leak across turns

- **WHEN** turn 1 produces a `tool_results` entry
- **AND** turn 2 begins
- **THEN** the turn 2 conversation seed MUST NOT contain the turn 1
  `tool_results` object
- **AND** the per-turn loop MAY inject `tool_results` for turn 2 only

## REMOVED Requirements

(none)

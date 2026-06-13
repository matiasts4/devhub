# Proposal: Native Command Executor Assistant (CommandBar)

> Artifact store note: this change was requested with `engram` as the artifact
> store, but the Engram MCP tools were not available in the executing
> environment. Per the SDD recovery rule, the proposal is persisted to the
> existing file-based `openspec` store at
> `openspec/changes/native-command-executor-assistant/proposal.md`.
> Engram topic key intended: `sdd/native-command-executor-assistant/proposal`.

## Intent

The user wants a fast, in-app **command executor** — a lightweight assistant that
takes a single natural-language instruction and performs ONE concrete action,
**visibly**, using DevHub's existing native surfaces. This is explicitly NOT an
autonomous mission agent: no planning loop, no multi-step orchestration, no
self-directed goal pursuit.

**Why now**: DevHub already ships the heavy machinery (Director General missions,
native terminal control, native browser control, Pizarra native-surface overlay),
but there is no thin, user-directed seam to say "open a terminal and run X",
"open the browser and go to Y", or "read me back what that terminal shows". The
Director General mission system is too heavy for these single-shot intents — it
carries planning, supervision, and durable-feed overhead that this use case does
not need. The user wants to improve on what exists by adding a **direct, visible,
single-shot** path.

**Success looks like**: the user types (later: speaks) one instruction into a
CommandBar, the right native action runs in front of them, and they can see each
step happen on screen — terminal opens and the command runs visibly; browser
opens and navigates visibly; a named terminal's current buffer is read back as
text context.

## Scope

### In Scope
- **CommandBar UI**: a single-input, in-app surface to enter one instruction and
  see the resolved action + live status (queued → running → done/failed).
- **Intent routing**: a deterministic **rule/intent-router** as the primary
  mechanism (regex/keyword + slot extraction for command string, URL, terminal
  name). A clean seam to plug **LLM tool-calling** as an alternative router
  later, without changing the action layer.
- **Action: open terminal + run command** — spawn/focus a native terminal and
  execute a dictated command string, visibly.
- **Action: open browser + navigate/search** — open the native browser surface
  and navigate to a URL or run a search, visibly.
- **Action: read terminal buffer (text)** — read back the current content of a
  **named** terminal as plain text and surface it as context to the user. This
  requires a new enabling API (see Approach) since no terminal buffer-read API
  exists today.
- **Live visibility** of each action through the existing Pizarra native-surface
  overlay (each action maps to a visible native surface, not a hidden background
  job).
- **Read-back text seam designed for future voice/TTS**: the buffer-read result
  flows through a typed result object so a future phase can pipe the same text
  into TTS without reworking the action layer.

### Out of Scope (non-goals)
- **Autonomous / multi-step missions** — no agent loop, no plan-execute-verify.
- **Voice / TTS read-aloud** — explicitly a FUTURE phase. The architecture MUST
  NOT block it (read-back returns structured text), but no audio is shipped here.
- **Speech-to-text input** — text input only in this change.
- **Rewriting the terminal or browser engines** — reuse existing native surfaces.
- **Director General mission overhead** — no reuse of the mission/supervision
  stack for these single-shot intents.
- **Persistent command history / macros** — not in this slice.

## Capabilities

### New Capabilities
- `command-bar`: user-directed single-shot command surface with intent routing
  and live action status.
- `terminal-buffer-read`: API to read a named terminal's current buffer as text
  (enabling capability; reused later by voice).

### Modified Capabilities
- Native terminal control: add a programmatic "open + run command in named
  terminal" entry point usable by the CommandBar.
- Native browser control: add a programmatic "open + navigate/search" entry point
  usable by the CommandBar.
- Pizarra overlay: place CommandBar-spawned surfaces with auto-placement.

## Approach

**Recommended: Option B — lightweight CommandBar.** Build a thin, new surface
that maps a single parsed intent to a single existing native action, rather than
reusing the Director General mission system.

**Why Option B over reusing Director General**:
- Director General is built for autonomous, multi-step, supervised missions with
  durable feeds and planning state. For a single-shot "open terminal, run X" that
  is pure overhead — more surface area to configure, more failure modes, and a
  mental model that does not match "command executor".
- The user explicitly wants speed and directness. A deterministic router + direct
  action call is simpler to reason about, test, and make visible.
- Option B keeps the door open: the intent-router seam can later delegate complex
  requests to Director General if a genuine multi-step need appears, without the
  CommandBar itself becoming an agent loop.

**Intent router (start deterministic)**:
- Phase 1 router is rule-based: match verbs/keywords ("run", "open", "go to",
  "search", "read"/"what does … show") and extract slots (command, URL/query,
  terminal name). Deterministic routing is testable, predictable, and avoids LLM
  latency/cost for the common cases.
- Define an `IntentRouter` interface so an LLM tool-calling implementation can be
  swapped in later. The **action layer** (terminal/browser/read actions) stays
  identical regardless of router.

**Enabling piece — terminal buffer read API (required)**:
- There is currently **no API to read a terminal's buffer/content back as text**.
  This is a hard dependency for the read-back capability and must be implemented
  as part of this change. It returns structured text (string + terminal name +
  timestamp), which is exactly the seam a future voice/TTS phase consumes.

**Visibility model**: every action resolves to a visible native surface via the
Pizarra overlay (terminal surface, browser surface). The CommandBar shows the
resolved intent and per-action status so the user always sees what is happening.

## Rough Phasing (keep PRs reviewable)

1. **Slice 1 — CommandBar + open terminal + run command.** CommandBar UI,
   deterministic `IntentRouter` for the terminal-run intent only, and the
   "open + run in named terminal" action with live visibility. Smallest
   end-to-end vertical slice; ships value alone.
2. **Slice 2 — Browser open + navigate/search.** Add the browser intent to the
   router and the browser action.
3. **Slice 3 — Terminal buffer read-back (text).** Implement the
   `terminal-buffer-read` API and the read intent, returning structured text
   context. Designed so a later voice phase consumes the same result object.

Each slice is an independent, reviewable PR under the ~400-line review budget.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/` (new CommandBar) | New | Single-input command surface + status |
| Intent routing module | New | `IntentRouter` interface + rule-based impl; LLM seam |
| Native terminal control | Modified | Programmatic open + run-in-named-terminal entry point |
| Native browser control | Modified | Programmatic open + navigate/search entry point |
| Terminal buffer read (Tauri/PTY layer) | New | API to read named terminal buffer as text |
| Pizarra overlay | Modified | Auto-placement of CommandBar-spawned native surfaces |

## Risks / Open Questions

| Risk / Question | Likelihood | Mitigation |
|-----------------|------------|------------|
| **Terminal buffer-read API not implemented** (hard dependency) | High | Treat as a required enabling task in Slice 3; spike the PTY/native read path early to de-risk. |
| **Intent parser accuracy** — rules may misclassify free-form input | Medium | Start deterministic with explicit verbs/slots; show the resolved intent for user confirmation; keep LLM router as an opt-in seam. |
| **Pizarra auto-placement bounds conflicts** — spawned surfaces overlap or land off-canvas | Medium | Reuse existing board-element-placement logic; clamp to viewport; test fractional zoom and multi-surface placement. |
| Named-terminal resolution ambiguity (which terminal is "the build terminal"?) | Medium | Require an explicit name slot; fall back to focused/last-used terminal with a visible label. |
| Scope creep toward an agent loop | Medium | Hard non-goal: one intent → one action. Multi-step requests are rejected or (later) explicitly handed to Director General. |

## Rollback Plan

1. **Feature flag**: gate the CommandBar behind an env flag (e.g.
   `NEXT_PUBLIC_COMMANDBAR_ENABLED=false`).
2. **Remove UI**: delete the CommandBar component and intent-router module; native
   terminal/browser actions added as new entry points remain harmless if unused.
3. **Terminal buffer-read API**: additive and read-only; can be left in place or
   removed without affecting existing terminal behavior.
4. **No schema/migration changes**: actions operate on in-memory native surfaces.
5. **Verification**: existing terminal, browser, and Pizarra flows unchanged with
   the flag off.

## Success Criteria

- [ ] User types one instruction in CommandBar and a native terminal opens and
      runs the dictated command, visibly.
- [ ] User types one instruction and the native browser opens and navigates /
      searches, visibly.
- [ ] User asks to read a **named** terminal and gets its current buffer back as
      plain text context.
- [ ] Read-back returns a structured text result (string + terminal name +
      timestamp) suitable for a future voice/TTS consumer — no audio shipped.
- [ ] Intent routing is deterministic and unit-tested; an `IntentRouter` seam
      exists for a future LLM tool-calling implementation.
- [ ] Each action is visible via the Pizarra overlay; no hidden background jobs.
- [ ] Director General mission system is NOT used for these single-shot intents.

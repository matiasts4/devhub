# Zed chat latency audit + Swarm injection pattern comparison

> Read-only investigation. No code modified. Citations are `file:line`.
> Worst-case run reconstructed from `logs/zed-assistant.log` interaction `mpvx5qmv` (2026-06-01 20:48:35–20:49:11).

## 1. Zed latency breakdown

### 1.1 Time budget per phase (observed)

| Phase | Where | Time | Notes |
|------|------|------|------|
| Browser → `/api/assistant/chat` POST | `src/app/api/assistant/chat/route.js:121` | ~1 ms | local fetch |
| `loadSystemPrompt()` | `route.js:47-56` | ~0 ms after first call | cached module-level `SYSTEM_PROMPT` |
| `fetch(BASE_URL)` to `api.minimax.io` (1 turn) | `route.js:72-95` | **3578–7619 ms** | median ~6000 ms, non-streaming POST |
| `parseToolCalls` | `route.js:203` | <1 ms | pure regex |
| Tool dispatch — `open_terminal` | `src/lib/asistente/tools/terminal.js:43-87` | **62 ms** | POST `/api/terminal/session` |
| Tool dispatch — `review_terminal_output` | `tools/terminal.js:110-136` | **49–78 ms** | GET `/api/terminal/session/:id/capture` |
| Tool dispatch — `execute_in_terminal` | `tools/terminal.js:139-175` | **47–83 ms** | PUT `/api/terminal/session/:id/input` |
| `JSON.stringify(result)` + push to conversation | `route.js:251-256` | <1 ms | but see §1.3 |
| **Worst case = 6 turns of LLM round-trips** | loop body | **~36 s total** | observed `mpvx5qmv` |

**Worst phase: the LLM round-trip itself.** Single turn ≈ 6 s. Tool exec is ≤ 83 ms ≈ 1 % of one turn. **Optimising tool implementations buys 0 perceivable improvement.** The only useful lever is to reduce the number of turns.

### 1.2 Turn count observed for "abre una terminal y ejecuta ls"

Log `mpvx5qmv` (`logs/zed-assistant.log` tail):

| Turn | LLM ms | Model action | Tool ms | Cumulative |
|----:|------:|-------------|------:|----------:|
| 1 | 6093 | `open_terminal command=ls` | 62 | 6.2 s |
| 2 | 3578 | `review_terminal_output session=…` | 78 | 9.8 s |
| 3 | 6775 | `execute_in_terminal input="ls -la"` | 83 | 16.7 s |
| 4 | 4875 | `review_terminal_output` (again) | 49 | 21.6 s |
| 5 | 7619 | `review_terminal_output` (again, same buf) | 49 | 29.3 s |
| 6 | 7151 | `execute_in_terminal input="ls -la > /tmp/…"` | 47 | **36.5 s** |
| — | — | `MAX_TURNS=6` hit, returns `finalText=""` | — | empty response to user |

That's not "10 seconds" — that's a 36-second loop that ends with an EMPTY response. The user's "10 s" perception is the happy-path 1-turn case (`open_terminal` only, no follow-up loop).

### 1.3 Hidden cost: quadratic context growth (`route.js:154, 243, 251-256`)

```
let allToolResults = [];                       // initialised OUTSIDE the loop
…
allToolResults.push({ tool: name, …, result }); // adds NEW tool result
…
for (const r of allToolResults) {              // re-pushes ALL prior results
  conversation.push({ role: 'user', content: `Tool ${r.tool} result: …` });
}
```

`conversationLength` reported in the log for that interaction:

```
Turn 1: 1      (expected 1)
Turn 2: 3      (expected 3)
Turn 3: 6      (expected 5)   — +1
Turn 4: 10     (expected 7)   — +3
Turn 5: 15     (expected 9)   — +6
Turn 6: 21     (expected 11)  — +10
```

By turn 6 the conversation has ~2× the messages it should have, doubling input tokens, contributing measurably to per-turn latency growth (7.6 s at turn 5 vs 3.6 s at turn 2 even though both are simple model decisions).

## 2. Redundant LLM round-trips

Direct evidence from the same log (cite line patterns):

| Redundancy | Source | Why redundant |
|---|---|---|
| **Turn 2 = `review_terminal_output` right after `open_terminal`** | log `mpvx5qmv` turn 2 | `open_terminal` already returned `command_sent: "ls"` (`tools/terminal.js:79-85`). The model should treat that as confirmation. The system prompt does not forbid the verification call. |
| **Turn 4 = `review_terminal_output` right after `execute_in_terminal`** | log turn 4 | `execute_in_terminal` returned `{ sent: true }` (`tools/terminal.js:170`). Same pattern. |
| **Turn 5 = SECOND `review_terminal_output` with same `session_id`** | log turn 5 | Buffer hasn't changed; the model can't parse the ANSI capture and re-tries the same call. No new information possible. |
| **Quadratic re-push of `allToolResults`** | `route.js:251-256` | Not a model bug — a route bug. Inflates input tokens every turn. |
| **`open_terminal` reports `command_sent` for a command that was never executed** | `route.js (api/terminal/session) 204-225` vs `tools/terminal.js:79-85` | POST handler ignores the `command` body field. The tool tells the model `command_sent: "ls"` but the server didn't run it, so the model has to follow up with `execute_in_terminal` — adding 2-3 extra turns. This is the root cause of the entire 6-turn dance. |

## 3. Swarm / pizarra injection chain (LLM-free)

The user's intuition is correct. Swarm-side message delivery does not call any LLM. Two paths exist for "get a string into a running PTY":

### 3.1 User keystroke path (front-end)

```
User keypress in xterm
   │ (~0 ms)
   ▼
TerminalTTY.jsx:1924  terminal.onData(data) → wsRef.send(data)
   │ (~1 ms WS frame on localhost)
   ▼
src/lib/terminal/ttyServer.js — WS message handler:1423
   │
   ▼
session.pty.write(data)                       ─── total: 1–5 ms
```

### 3.2 Swarm director-consume path (agent-to-agent)

```
Worker calls _devhub_team_tell wrapper
   │
   ▼
src/lib/agentLaunchWrapper.js:223
   spawn devhub-bus chat-write --from $ROLE --to $TO --kind chat --body "$BODY"
   │
   ▼
devhub-cli/bin/devhub-bus.js:150  cmdChatWrite
   │
   ├── INSERT INTO team_chat (sqlite)
   ├── INSERT INTO team_inbox (sqlite)
   └── appendJsonl(missionId, 'chat', { … })   ─── ~5–10 ms write
        │  (appends to /tmp/devhub-mission-<id>/chat.jsonl)
        ▼
   Director's background process: devhub-bus director-consume
   (spawned by agentLaunchWrapper.js:728 with --format tmux-send-keys)
        │
        ▼
   devhub-bus.js:686-722  tail -F chat.jsonl → on new line:
        │  spawnSync('tmux', ['send-keys', '-t', SESSION, '-l', line])
        │  spawnSync('tmux', ['send-keys', '-t', SESSION, 'Enter'])
        ▼
   Text appears in director's tmux pane         ─── total: ~50–150 ms
```

**Zero LLM calls. No HTTP. No JSON-over-anthropic.** The path is: file append → `tail -F` event → 2× `tmux` subprocess fork → done.

### 3.3 Zed chain (for comparison)

```
User clicks "Send" in ChatPanel
   │
   ▼
fetch POST /api/assistant/chat                          ~1 ms
   │
   ▼
route.js:165 callMinimax → fetch(api.minimax.io)       ~6000 ms  ◄── LLM #1
   │
   ▼  model emits TOOL: open_terminal PARAM: command=ls
   │
   ▼
terminal.js:48 fetch POST /api/terminal/session         ~10 ms
   │
   ▼
session/route.js:204 POST handler ignores `command`,
   creates PTY, returns { id, port, wsPath }            ~50 ms
   │  (tool fakes `command_sent: "ls"` in tools/terminal.js:81 anyway)
   ▼
route.js → next loop turn → fetch(api.minimax.io)      ~3600 ms  ◄── LLM #2
   │  model emits TOOL: review_terminal_output (redundant)
   ▼
… repeats up to MAX_TURNS = 6 times …                 ~36 000 ms

Best case 1-turn (model just confirms): 1× LLM call    ~4000–6000 ms
Worst case observed:                    6× LLM calls   ~36 000 ms
```

**Hops in Zed (worst case): 7 LLM round-trips + 12 local HTTP + 1 PTY write.**
**Hops in Swarm (worst case): 0 LLM + 1 sqlite + 1 file append + 1 `tail` read + 2 `tmux send-keys`.**

The cost differential is 100–500×.

## 4. Concrete recommendations (prioritised)

### Recommendation A — Make `POST /api/terminal/session` actually run `command` (T-029-style, code)

- **Where**: `src/app/api/terminal/session/route.js:204-225` already accepts `body.command` in the contract but only destructures `cwd, program` at line 211. Fix: after `createSession(...)`, if `command` is truthy, call `pushSessionInput(session.id, command + '\n')`.
- **Why**: the tool already advertises `command_sent` (T-026, `tools/terminal.js:81`) but the server never executed it. Honouring it removes the model's need to follow up with `execute_in_terminal`. Removes 2-3 turns.
- **Estimated speedup**: 60–70 % (turns 3–6 disappear in the common case).
- **Effort**: small (one route + one test).
- **Risk**: low (server already advertises this contract via the tool; spec already says `command` is a valid field; no behaviour change for callers that omit it).
- **Type**: T-029-style code change.

### Recommendation B — Fix quadratic `allToolResults` re-push (T-029-style, code)

- **Where**: `src/app/api/assistant/chat/route.js:154, 251-256`.
- **Why**: each turn appends ALL prior tool results, not just this turn's. Input tokens grow ~quadratically. Direct contributor to per-turn LLM latency growth (3.6 s → 7.6 s observed).
- **Fix**: track `turnToolResults` separately for the conversation push; keep `allToolResults` only for the final response payload.
- **Estimated speedup**: 15–25 % on multi-turn interactions (smaller payload, faster LLM round-trip).
- **Effort**: small (5-line route change + 1 test).
- **Risk**: low; tested by an integration test that asserts conversation length grows linearly.
- **Type**: T-029-style.

### Recommendation C — System-prompt rule "do not verify when the tool already confirmed" (T-027-style)

- **Where**: `docs/prompts/asistente/zed-system-prompt.md` — append to the `Rules` section (around line 202) and to the `### 4. execute_in_terminal` and `### 1. open_terminal` reference blocks.
- **Wording (suggested)**:
  > After `open_terminal` returns `command_sent`, OR after `execute_in_terminal` returns `sent: true`, your next response MUST be the final user-facing reply — do NOT call `review_terminal_output` unless the user explicitly asked to see output, or the prior tool returned an `error`.
  > If `review_terminal_output` returns ANSI escape sequences you cannot parse cleanly, do NOT re-call it on the same `session_id` — describe what you saw and stop.
- **Why**: directly cuts the redundant turns 2, 4, 5 observed in `mpvx5qmv`.
- **Estimated speedup**: 50–70 % alone (without A), additive on top of A in the worst case.
- **Effort**: small (prompt diff + Playwright spec).
- **Risk**: low–medium (model behaviour is not 100 % deterministic; A is the structural fix and C is the soft fix — ideally land both).
- **Type**: T-027-style system-prompt change.

### Recommendation D — Stream the LLM response (T-029-style, larger)

- **Where**: `route.js:63-95` (`callMinimax`) — switch to `stream: true` and pipe partial tokens back to the client; parse `TOOL:` markers as they arrive.
- **Why**: even when the loop has only 1 turn, the user waits 4–6 s with no UI feedback. Streaming lets the assistant start rendering text within ~500 ms.
- **Estimated speedup**: no actual reduction in total time, but huge perceived speedup (first-token latency drops from 4–6 s to ~500 ms).
- **Effort**: medium (route, ChatPanel `EventSource`/SSE, parser, test).
- **Risk**: medium (tool-call detection has to work on partial buffers; backwards-compat for `tool_results` payload).
- **Type**: T-029-style. Bigger than A/B; defer if budget tight.

### Recommendation E — Cap repeated `review_terminal_output` calls on the same `session_id` server-side (T-029-style, defensive)

- **Where**: `src/lib/asistente/tools/terminal.js:110-136` — track last 2 calls per session_id; if the same session is reviewed twice in a single chat with no input pushed in between, return `{ error: 'no new output since last review; describe what you saw and stop' }`.
- **Why**: safety net if Recommendation C is ignored by the model.
- **Estimated speedup**: kicks in only on pathological loops. ~10 % worst case.
- **Effort**: small.
- **Risk**: very low.
- **Type**: T-029-style.

### Priority order

1. **A** (correct the server so the tool's contract isn't a fiction)
2. **B** (stop the quadratic context bloat)
3. **C** (tell the model to stop verifying)
4. **D** (perceived latency UX win)
5. **E** (defence in depth)

Land A + B + C together for the biggest visible win.

## 5. Open questions for the user

1. **`MAX_TURNS=6` — should it stay at 6?** With A+B+C the common case drops to 1 turn and the redundant verification loop should not reach 6. But there are legitimate multi-step tasks (e.g. "open a browser, then a terminal, then run X") that need 3-4. Keep at 6 or drop to 4?
2. **Should `open_terminal` with `command` execute the command via `pushSessionInput` (Recommendation A), or should we leave that to the user-typed path and instead make the system prompt always emit `open_terminal` then `execute_in_terminal` as two-call?** A is faster and matches the spec, but it means the model can side-effect the PTY via the open call. The current code lets the model fake it (`command_sent` is a lie) which is worse than either alternative.
3. **Is the model's behaviour reproducible on a clean conversation, or only when context has prior tool results?** The 6-turn explosion appeared in a session that had ~20 prior interactions. The quadratic-context bug (route.js:251-256) may compound the issue. We could not verify because the log only shows one such interaction.
4. **Streaming (Recommendation D) — is the user willing to accept a chunked tool-call protocol on the server side?** The current `TOOL:`/`PARAM:` text format is parseable mid-stream; the question is whether the ChatPanel can swallow partial responses.

# AGY-HOOKS-01 — Antigravity native hooks + redundancy layers

**Status:** implemented · **Date:** 2026-07-24 · **Scope:** agent state detection for Antigravity (agy) across terminal agent, CLI, and IDE.

## Problem

Antigravity detection was 100% PTY screen-scraping (audit W1–W3): no start
detection for pre-attached panels, no hooks despite allowlist entries, and
footer strings pinned to one UI generation. IDE-embedded agents were fully
invisible (no PTY at all).

## Channel hierarchy (most → least reliable)

1. **Native hooks** (`~/.gemini/config/hooks.json`) — deterministic start/stop events.
2. **Transcript quiescence** (`brain/<conversationId>/.../transcript.jsonl` growth → silence).
3. **IDE host liveness** (`tasklist`/`ps` for the host process).
4. **Screen scraping** (existing manifest rules — kept as fallback only).

All channels converge on the EXISTING state path: they produce a detection
`{state, visibleWorking|visibleBlocker|visibleIdle}` fed to
`AgentStateMachine.publishHook()` → `session.agentTuiState` → WS
`agent-state` frame (now carrying `agentType`/`wasCancelled`, N4/N5).
No parallel state machines.

## Hook channel (primary)

```
Antigravity event → hooks.json command:
  node "<repo>/scripts/agent-hooks/antigravity-bridge.mjs" <EventName>
    stdin: {"conversationId","fullyIdle","terminationReason","transcriptPath","workspacePaths","executionNum"}
    (payload LACKS event name — passed as argv, hooks quirk)
  bridge maps: PreInvocation|PostInvocation|Pre/PostToolUse → working
               Stop+fullyIdle:true → idle · Stop+fullyIdle:false → working
  POST {token, state, agentType:'agy', conversationId, ...} → /api/terminal/agent-hook
```

**Endpoint discovery:** hooks run in Antigravity's env, NOT the PTY env — no
`DEVHUB_HOOK_URL/TOKEN`. Servers write `~/.devhub/hook-bridge.json`
(`{url, token, updatedAt}`) at startup via `writeHookBridgeConfig()`
(`agentHooks/bridgeConfig.js`); the bridge reads it per invocation.

**Fail-open contract:** bridge exits 0 on ANY error (missing config, server
down, timeout 1.5s); empty stdout (never emits `{"decision":"continue"}`);
stderr only with `DEVHUB_AGY_BRIDGE_DEBUG=1`. The agent is never blocked.

**Routing without terminalId** (`handleBridgeHookReport`):

1. `session.agentConversationId === conversationId` (sticky once bound)
2. `workspacePaths` matched against session cwds
3. fallback: most recently active `agentType==='agy'` session
4. no match → 404 (bridge ignores; IDE-only agents get the virtual session below)

**Installer** (`installer.js` case `agy`): idempotent merge into
`~/.gemini/config/hooks.json` — DevHub entries identified by the
`antigravity-bridge.mjs` marker; third-party hooks preserved; backup before
write; corrupt JSON → timestamped backup + fresh + warning.

## Transcript channel (secondary)

`antigravityTranscriptWatcher.js`: stat-polls the JSONL transcript
(`pollMs=2000`); growth → `onActivity`; silence ≥ `idleMs=4000` after growth →
`onIdle` (kimi-watch pattern). Handles not-yet-created files, truncation,
rotation. Registry supports multiple conversations + `unwatchAll()` for
shutdown. Feeds the same `publishHook` path with hook-authority semantics.

## Liveness channel (tertiary)

`ideHostLiveness.js`: `isAntigravityHostRunning()` via `tasklist /FO CSV`
(win32) or `ps -axo pid=,command=` — fixed arg arrays, injectable exec.
Used to keep an IDE-only agent's state warm (avoid false "finished" when the
transcript is momentarily quiet) and to surface `listAntigravityLanguageServers()`.

## conversationId → panel mapping

- Panels whose PTY runs agy get `agentConversationId` bound on first bridge
  report (or hook payload) — subsequent reports route directly.
- workspacePaths ↔ session cwd matching covers swarm/tmux panels.
- **IDE-only fallback:** when no session matches, reports are dropped (404)
  today; the planned 'agy-ide' virtual session (not in this change) will
  subscribe to these orphan reports so IDE agents appear without a panel.

## Exact payloads

Hook stdin (all events): `{"conversationId": string, "fullyIdle"?: bool,
"terminationReason"?: "model_stop"|"NO_TOOL_CALL"|"max_steps_exceeded"|"error",
"transcriptPath"?: string, "workspacePaths"?: string[], "executionNum"?: number}`

Bridge POST body: `{"token", "state": "working"|"idle", "agentType": "agy",
"agent": "agy", "event", "source": "antigravity-hook", "conversationId",
"terminationReason", "transcriptPath", "workspacePaths", "executionNum", "at"}`

## Files

| File                                               | Role                                    |
| -------------------------------------------------- | --------------------------------------- |
| `src/lib/terminal/agentHooks/installer.js`         | agy case: merge/remove/status           |
| `src/lib/terminal/agentHooks/bridgeConfig.js`      | `~/.devhub/hook-bridge.json` read/write |
| `scripts/agent-hooks/antigravity-bridge.mjs`       | fail-open hook → HTTP bridge            |
| `src/lib/terminal/agentHooks/handleHookReport.js`  | `handleBridgeHookReport` routing        |
| `src/lib/terminal/antigravityTranscriptWatcher.js` | transcript quiescence                   |
| `src/lib/terminal/ideHostLiveness.js`              | host process liveness                   |
| `src/app/api/terminal/agent-hook/route.js`         | dispatch bridge vs session reports      |

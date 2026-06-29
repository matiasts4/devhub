# Audit Report: Zed Agent

**Audited**: 2026-05-30
**Auditor**: Sub-agent exploration
**Status**: 🟠 Issues found — implementation incomplete

---

## Files Analyzed

| File                                             | Purpose                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `/api/assistant/chat/route.js`                   | Asistente Zed — direct MiniMax API chat with tool execution |
| `src/lib/operations/swarmControl.js`             | Swarm Zed registration in buildSwarmLaunchPrograms()        |
| `src/lib/agentLaunchCommand.shared.js`           | Shared Zed launch command builder                           |
| `src/lib/agentLaunchWrapper.js`                  | Shell wrapper — injects MiniMax env vars                    |
| `src/lib/llmProviderConfig.js`                   | LLM provider config reader                                  |
| `src/lib/sdd/SwarmPromptEngine.js`               | Phase contracts — NO zed entry                              |
| `src/lib/asistente/utils/zed-logger.js`          | Shared Zed logging utility                                  |
| `docs/prompts/swarm/swarm-zed-v1.md`             | Zed prompt template (8-phase SDD)                           |
| `openspec/archive/zed-agent-minimax-connection/` | Archived design — rejected in favor of OpenCode path        |

---

## Architecture (corrected intent, 2026-06-03)

| Surface                   | What it is                                                         | Status                                                                       |
| ------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Asistente Zed**         | Workspace assistant: chat in right dock, visible terminals/browser | **Canonical** — 9 tools, MiniMax M3, `TOOL:`/`PARAM:` protocol               |
| **Launchpad “Zed” entry** | Legacy label in swarm launch roster mapping to `swarm-director`    | **Misaligned** — not the same as Asistente Zed; should be renamed or removed |
| **CommandBar** (WIP)      | Single-shot command executor (deterministic router)                | Complementary, not a replacement                                             |

**Zed is not a swarm agent.** It can call `get_swarm_status` or (future) launch a mission, but it does not run inside the swarm protocol as a participant.

### Visible execution contract

When the user asks to run a command in a terminal:

1. `open_terminal` reserves a `session_id` on the server.
2. The UI opens a **visible** workspace panel with that id and passes `command_sent` via `devhub:zed-open-terminal`.
3. The panel runs `initialCommand` on connect (xterm WebSocket or native VTE) so the user **sees** the command — not a hidden PTY.

Bug fixed 2026-06-03: `ChatPanel` previously read `result.command` while the tool returns `command_sent`, so panels opened empty.

---

## 🔴 CRITICAL — `PHASE_CONTRACTS.zed` Never Implemented

**File**: `src/lib/sdd/SwarmPromptEngine.js`

`buildPhaseContractSection()` falls back to `PHASE_CONTRACTS.coder` for Zed because no `zed` key exists in `PHASE_CONTRACTS`. The design doc (`openspec/archive/zed-agent-minimax-connection/design.md`) specified adding:

```javascript
zed: {
  role: 'zed',
  executablePhases: ['sdd-explore', 'sdd-propose', 'sdd-spec', 'sdd-design',
                      'sdd-tasks', 'sdd-apply', 'sdd-verify', 'sdd-archive'],
  delegatable: true,
  contextBudget: 8000,
  model: 'minimax-coding-plan/MiniMax-M2.7',
  provider: 'minimax',
}
```

**This was never added.** Zed swarm agents receive the generic coder phase contract instead of Zed's full 8-phase SDD contract.

The T-9 comment confirms this:

```javascript
// T-9: Prepend Zed identity block when role is zed
// (Zed role removed — block kept as placeholder)
```

---

## 🔴 CRITICAL — `modelProvider` Never Passed to Wrapper for Swarm-Launched Zed

**File**: `src/app/api/agenthub/operations/health/route.js`

In `buildLaunchCommand()` at line ~238, `buildAgentLaunchWrapper()` is called **without** `modelProvider`. This means the MiniMax env vars injection in `buildAgentEnvExports()` is never triggered:

```javascript
// agentLaunchWrapper.js — this branch is NEVER triggered for Zed swarm agents:
if (modelProvider === 'minimax') {
  exports.push(`export ANTHROPIC_BASE_URL="${config.ANTHROPIC_BASE_URL}"`);
  exports.push(`export ANTHROPIC_MODEL="${config.MINIMAX_MODEL}"`);
}
```

**Impact**: Zed-as-a-swarm-agent launches without MiniMax endpoint config. Falls back to OpenCode defaults.

---

## 🟡 Medium — Documentation vs Implementation Mismatch

**File**: `docs/prompts/swarm/swarm-zed-v1.md` vs actual `buildRoleAgentProfile`

The prompt template says Zed can execute all 8 SDD phases. But `buildRoleAgentProfile('zed', ...)` returns `profileKey: 'swarm-director'` — which maps to the director phase contract that only executes `sdd-explore, sdd-propose, sdd-design`. The documentation promises 8 phases; the implementation delivers 3.

---

## 🟡 Medium — Asistente Zed API Key Fallback

**File**: `/api/assistant/chat/route.js`, line ~132

```javascript
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.MINIMAX_API_KEY;
```

If both are absent, the error says "No API key configured" without clarifying which env var was expected or which one should be set.

---

## 🟡 Medium — No Integration Between Asistente and Swarm Zed

A user cannot use Asistente chat to interact with a running swarm mission, or vice versa. The two Zed systems are completely siloed.

---

## 🟡 Medium — `pending_deliveries` Never Re-injected

From `SWARM_COMMUNICATION_HANDOFF_2026-05-30.md`: deliveries are written to `/tmp/devhub-pending-deliveries.log` but never re-injected into the agent's terminal, prompt, or inbox file.

---

## Tools Available to Asistente Zed (via ToolRegistry)

| Tool             | Name                   | Purpose                      |
| ---------------- | ---------------------- | ---------------------------- |
| `terminalTool`   | `open_terminal`        | Open PTY terminal session    |
| `browserTool`    | `open_url`             | Open URL via `xdg-open`      |
| `delegationTool` | `delegate_to_opencode` | Delegate to OpenCode in tmux |
| `fileTool`       | `browse_files`         | List or read files           |
| `swarmTool`      | `get_swarm_status`     | Query swarm mission DB       |

---

## Recommendations

1. **Add `PHASE_CONTRACTS.zed`** to `SwarmPromptEngine.js` — the core identity and phase contract for Zed-as-swarm-agent
2. **Pass `modelProvider: 'minimax'`** to `buildAgentLaunchWrapper()` in health route so MiniMax env vars are injected
3. **Reconcile documentation** with implementation — either update the prompt template or fix `buildRoleAgentProfile` to route Zed through all 8 phases
4. **Add Zed entry** to `SWARM_ROLE_DEFAULT_MODELS` if not already present
5. **Integrate pending_deliveries** handoff mechanism so deliveries reach the agent runtime

---

## Implementation updates

### Fase 2 — UI fluidez y optimización (2026-06-29)

- `src/lib/asistente/useZedChat.js`
  - Agregado `streamingMessage`/`streamingIdRef` para mostrar respuestas parciales mientras llegan los eventos SSE `text_delta`.
  - El mensaje parcial se limpia en `done` y se reemplaza por el mensaje final con `tool_results`, `meta` y `model`.
  - `handleStop` aborta el controller y descarta el mensaje parcial; un error de aborto se traduce a `(Solicitud cancelada)`.
- `src/components/asistente/ZedAmbientOverlay.jsx`
  - Refactor en subcomponentes memoizados: `ZedAuraContainer`, `ZedPillComposer`, `ZedCollapsedPill`.
  - `displayMessages`/`displayAssistantMessage` unen `messages` + `streamingMessage` para aura, status y pill colapsado.
  - Focus del compositor gestionado con `useLayoutEffect` + `requestAnimationFrame`; se guarda y restaura el elemento activo.
  - Añadidos `aria-busy`, `aria-live="polite"` y un `span.sr-only` para anunciar deltas de streaming.
- `src/components/asistente/ZedActivityDrawer.jsx`
  - `assistantTurns` memoizado; render limitado a 50 mensajes con botón "Mostrar más".
  - Extraído `ZedActivityMessage` memoizado con estilo y cursor para mensajes parciales.
  - `onFocusTerminal`/`onOpenUrl` estabilizados con `useCallback`.
- Tests agregados:
  - `src/lib/asistente/__tests__/useZedChat.streaming.test.js`
  - `src/components/asistente/__tests__/ZedActivityDrawer.limit.test.jsx`

### Fase 3 — Voz robusta (2026-06-29)

- `src/lib/voice/useVoiceCapture.js`
  - Detección de permisos de micrófono vía `navigator.permissions`/`getUserMedia`; si falla, se expone `errorText` y `enginePhase='error'`.
  - Escucha `devicechange` para re-verificar acceso cuando cambian dispositivos.
  - `cancelPendingSend` y `resetTranscript` estabilizados; al iniciar una nueva grabación se descarta cualquier envío pendiente.
  - Expose `micPermission` y `audioDevices` para futura UI.
- `src/lib/voice/useVoiceTts.js`
  - Antes de cada `speak` se invoca `voice_stop_speak` para evitar colas.
  - `tts-error`/`tts-done` siempre resetean `speaking`.
- `src/components/settings/ZedVoiceSettings.jsx`
  - Envía `microphone: selectedMicId || 'default'` al sidecar en `voice_set_settings`.
- `src/components/asistente/ZedAmbientOverlay.jsx`
  - Envía `microphone` al bootear voz.
  - `voiceSettings` (desde `useZedChat`) ahora es reactivo ante cambios de `localStorage`.
  - Errores de STT/TTS se muestran como status efímero en el pill.
  - Botón "Detener voz" en composer y pill colapsado cuando `speaking`.
- Tests agregados:
  - `src/lib/voice/useVoiceCapture.test.js` (expandido con eventos Tauri)
  - `src/lib/voice/useVoiceTts.test.js`
  - Tests de overlay para error de voz y botón de stop TTS en `ZedAmbientOverlay.test.jsx`

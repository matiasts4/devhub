# DONE-EVIDENCE-01 — "terminó" solo con evidencia positiva

**Fecha:** 2026-07-25 · **Estado:** implementado · **Origen:** falsos "terminó" reportados con Kimi Code (y aplicable a todos los TUIs) tras la ronda 1 (`docs/audits/2026-07-24-agent-detection-notifications-audit.md`).

## Problema

La cuiescencia de salida (4 s sin chunks PTY → `idle`) era indistinguible de un "terminó" real en el cliente: el frame `agent-state` no llevaba ningún campo de evidencia, así que la notificación "completó su respuesta" se disparaba por **ausencia de señal** (tool calls silenciosos largos: builds, tests, esperas de API). Agravantes:

- La autoridad de hooks (TTL 120 s) expiraba en tool calls largos porque `KIMI_EVENTS` no incluía `PostToolUse`/`SubagentStop` — ningún evento refrescaba la autoridad durante la herramienta.
- Si la cuiescencia ya había volteado a `idle`, el `Stop` real llegaba `idle→idle`: la máquina no republicaba y el "terminó" verdadero **nunca se notificaba**.

## Principio

**"Terminó" = evidencia positiva de fin** (hook `Stop`, prompt visible, exit del proceso). El silencio degrada a _quiet_ y, sostenido, a un "done probable" de baja confianza.

## Taxonomía `reason` (server → frame → bridge)

| reason                                             | origen                                                 | notifica "done"                    |
| -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| `hook:Stop`, `hook:StopFailure`, `hook:SessionEnd` | hook nativo                                            | sí                                 |
| `hook:Interrupt`                                   | hook nativo (Esc)                                      | sí, como "cancelada"               |
| `prompt-visible`                                   | regla manifest con `visibleIdle`                       | sí                                 |
| `agent-exit`, `exit`, `pty-dead`                   | reaper / exit PTY / tick                               | sí                                 |
| `quiescence-confirmed`                             | silencio > 12 s (`DEVHUB_AGENT_QUIESCENCE_CONFIRM_MS`) | sí (fallback sin hooks)            |
| `quiescence`                                       | silencio > 4 s (etapa 1)                               | **no** (solo badge)                |
| `manifest`, `user-input`, `hook:<otros>`           | running/blocked                                        | n/a                                |
| _(ausente)_                                        | frames legacy                                          | comportamiento anterior (notifica) |

Flujo: `detection.reason` → `AgentStateMachine.publish()` lo propaga → `session.agentTuiStateReason` (+`session._lastIdleReason` cuando es idle) → `buildAgentStateFrame` lo toma de la sesión si no hay override → `useTerminalV2Session` → `panelSemanticStateStore` → `agentNotificationBridge` (gate `DONE_EVIDENCE_REASONS`).

## Mecanismos

1. **Cuiescencia en dos etapas** (`sessionAgentDetector.tickAgentDetection`): etapa 1 (4 s) publica `idle` con `quiescence`; etapa 2 (12 s de silencio continuado) re-emite con `quiescence-confirmed` (upgrade de reason sin cambio de estado).
2. **Veto por herramienta activa**: `handleHookReport` mantiene `session.hookToolActive` (`PreToolUse`/`SubagentStart` → set; `PostToolUse*`/`SubagentStop`/`Stop`/`Interrupt`/`StopFailure`/`SessionEnd` → clear). Mientras activo (tope 30 min, `DEVHUB_HOOK_TOOL_ACTIVE_VETO_CAP_MS`), la cuiescencia no dispara y la autoridad hook se estira al mismo tope. El tope existe porque los hooks son fail-open y un evento de cierre puede perderse.
3. **Reason-upgrade**: un idle autoritativo que llega cuando el último idle fue `quiescence*` re-emite el frame aunque el estado no cambie (`buildReasonUpgradeFrame` en `handleHookReport`); el store del cliente reenvía cambios de reason aunque el estado se repita; el bridge los procesa con `reasonChanged`.
4. **Eventos de hook ampliados** (`KIMI_EVENTS` v2): +`PostToolUse`, `PostToolUseFailure`, `SubagentStop`, `StopFailure`, `SessionEnd`. Marcador de bloque `(v2)`; los bloques `(v1)` se detectan como desactualizados y el re-merge los reemplaza (idempotente, sin tocar bloques de terceros — herdr incluido).
5. **Trace JSONL** (`agentStateTrace.js`): cada transición publicada anota `{at, terminalId, agentType, prev, next, reason, hookEvent, hookAgeMs, lastActivityAgeMs, source, upgrade}` en `data/logs/agent-state/<fecha>.jsonl` (rotación 5 MB, kill-switch `DEVHUB_AGENT_TRACE=off`). Los republish de refresco estable (mismo estado+reason) se filtran.
6. **Nombres canónicos** (`src/lib/agents/agentDisplayNames.js`): `kimi→Kimi Code`, `agy/antigravity→Antigravity`, etc.; desconocido → `null` → fallback `'Agente'`. El cliente ya no usa `initialCommand` como identidad del agente.

## Consecuencias / trade-offs

- Agentes sin hooks y sin regla idle (grok, TUIs desconocidos): el "done" ahora tarda hasta ~12 s de silencio real (antes 4 s) y puede omitirse si el agente se calla < 12 s y nunca vuelve al prompt visible. Se acepta: un falso "terminó" es peor que uno tardío.
- `hook:Stop` tras un `quiescence-confirmed` notificado puede producir una segunda notificación "done" (>10 s cooldown): es un verdadero positivo tardío, preferible a perderlo.
- La cuiescencia etapa 1 sigue volteando el badge a idle a los 4 s (UX de badge sin cambios); solo se gatea la notificación.

## Archivos

- `src/lib/terminal/sessionAgentDetector.js` (etapas, veto, reasons, trace)
- `src/lib/terminal/agentStateDetection/stateMachine.js` (propaga reason)
- `src/lib/terminal/agentHooks/handleHookReport.js` (toolActive, reason, upgrade)
- `src/lib/terminal/agentHooks/installer.js` (KIMI_EVENTS v2, marcador v2)
- `src/lib/terminal/agentStateFrame.js` + `sidecar-backend/sessionTransport.js` (reason por defecto desde sesión)
- `src/lib/terminal/agentStateTrace.js` (nuevo)
- `src/lib/agents/agentDisplayNames.js` (nuevo)
- Cliente: `useTerminalV2Session.js`, `panelSemanticStateStore.js`, `agentNotificationBridge.js`
- Tests: `sessionAgentDetector`, `agentHooks`, `agentHookInstaller`, `agentStateFrame`, `agentNotificationBridge`, `agentDisplayNames`, `detector`

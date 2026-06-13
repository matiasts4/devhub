# Prompt — Agente 2: Asistente Zed

> Copia todo este documento como prompt inicial en tu sesión OpenCode.
> Lee primero [`00-shared-context.md`](00-shared-context.md).

---

## Misión

Mejorar el **Asistente Zed** (chat workspace, NO el ZED Orchestrator Pod swarm) para que entienda terminales por **nombre humano** (Chase, Cesar…), resuma sesiones OpenCode de forma útil, y abra terminales/navegadores en pizarra de manera confiable. Ejecuta SDD completo.

**Dependencia:** Agente 1 entrega `displayName` en panel state y processes API. Puedes empezar `summarize_terminal` en paralelo usando `terminalId`; la resolución por nombre se integra cuando Agente 1 mergee.

---

## Comportamiento esperado — Requisitos funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| FR-Z01 | Usuario: *"Chase, ejecuta npm test"* → Zed resuelve nombre → terminalId → `execute_in_terminal` | **P0** |
| FR-Z02 | `list_terminals` devuelve `{ terminalId, displayName, program?, cwd?, tuiReady?, opencodeSessionId? }` | **P0** |
| FR-Z03 | `open_terminal` acepta `name` opcional; si omitido, hereda displayName del pool (Agente 1) | P0 |
| FR-Z05 | Nueva tool `summarize_terminal` → digest estructurado | **P0** |
| FR-Z06 | Sobre digest, LLM responde máx 2 frases: *"OpenCode en Chase espera confirmación: ¿3 PR o 5 PR?"* | **P0** |
| FR-Z07 | `open_url` / `open_terminal` en pizarra: superficie en canvas, auto-layout, sin demaximize | P1 |
| FR-Z08 | Errores tool en español, sin stack al usuario | P1 |
| FR-Z09 | `execute_in_terminal`: policy evalúa payload completo, no solo primera línea | P1 |
| FR-Z10 | `open_terminal` devuelve `terminalId` + `displayName` directamente | P2 |

## Requisitos no funcionales

- NFR-Z01: `summarize_terminal` strip ANSI, truncar input a 8KB; p95 < 3s
- NFR-Z02: Nombre ambiguo o inexistente → error claro *"No encontré terminal 'X'. Activas: Chase, Nate…"*
- NFR-Z03: Actualizar [`docs/prompts/asistente/zed-system-prompt.md`](../../docs/prompts/asistente/zed-system-prompt.md)
- NFR-Z04: Tests en `terminal.list.test.js`, `terminal.summarize.test.js`, E2E `06_zed_open_terminal`, `07_zed_open_url`
- NFR-Z05: Documentar en prompt/UI que "Asistente Zed" ≠ "ZED Orchestrator Pod"

---

## Shape del digest `summarize_terminal` (contrato)

```json
{
  "terminalId": "p2",
  "displayName": "Chase",
  "program": "opencode",
  "status": "waiting_user_input",
  "waitingFor": "confirmation to create 3 PRs or 5 PRs",
  "lastPrompt": "Choose: [3] three PRs  [5] five PRs  [c] cancel",
  "suggestedActions": ["confirm 3 PRs", "confirm 5 PRs", "cancel"],
  "tuiReady": true,
  "capturedAt": "ISO8601"
}
```

Implementación sugerida:
1. Capturar output vía API existente (`getSessionOutput` / sidecar)
2. Strip ANSI (`strip-ansi` o util existente)
3. Heurísticas OpenCode: footer, último bloque de prompt, keywords (`confirm`, `waiting`, `y/n`)
4. Devolver JSON estructurado al LLM; el system prompt instruye redacción en 2 frases

---

## Casos de uso de aceptación

**UC-2:** *"Chase, cambia el puerto a 3001"* → solo terminal Chase recibe input.

**UC-3:** *"Zed, ¿qué está haciendo Chase?"* → *"OpenCode en Chase espera tu confirmación para crear 3 o 5 PRs."* (sin volcado ANSI)

**UC-Pizarra:** *"Abre github.com en pizarra"* → entra modo pizarra, browser card con auto-layout, sin perder sesión terminal.

---

## Lecturas obligatorias (en orden)

1. [`docs/delegation/00-shared-context.md`](00-shared-context.md)
2. [`src/lib/asistente/tools/terminal.js`](../../src/lib/asistente/tools/terminal.js)
3. [`src/lib/asistente/tools/browser.js`](../../src/lib/asistente/tools/browser.js)
4. [`src/lib/asistente/zedCommandPolicy.js`](../../src/lib/asistente/zedCommandPolicy.js)
5. [`docs/prompts/asistente/zed-system-prompt.md`](../../docs/prompts/asistente/zed-system-prompt.md)
6. [`src/lib/asistente/useZedChat.js`](../../src/lib/asistente/useZedChat.js)
7. [`src/app/api/assistant/chat/route.js`](../../src/app/api/assistant/chat/route.js)
8. [`src/components/zedOpenTerminalEvent.js`](../../src/components/zedOpenTerminalEvent.js)
9. [`src/components/workspace/rightDockLayout.js`](../../src/components/workspace/rightDockLayout.js) — `applyZedOpenUrlDockUpdate`
10. [`src/lib/asistente/__tests__/tools/terminal.list.test.js`](../../src/lib/asistente/__tests__/tools/terminal.list.test.js)
11. [`docs/audits/06-zed.md`](../audits/06-zed.md)
12. [`openspec/changes/zed-hardening/tasks.md`](../../openspec/changes/zed-hardening/tasks.md) — completar tareas pendientes si aún aplican (T-001, T-002 verificar en código)

---

## Alcance de archivos (puedes modificar)

- `src/lib/asistente/**` (nuevo: `tools/summarizeTerminal.js`, `resolveTerminalByName.js`)
- `docs/prompts/asistente/zed-system-prompt.md`
- `src/app/api/assistant/chat/route.js` (registrar tool)
- `src/lib/asistente/tools/registry.js`
- `src/components/asistente/**` (mensajes error UX si aplica)
- `src/lib/commandBar/surface/pizarraSurfaceController.js` (solo si necesario para spawn confiable)
- Tests `src/lib/asistente/__tests__/**`
- E2E `tests/e2e/06_zed_open_terminal.spec.ts`, `07_zed_open_url.spec.ts`

## Fuera de alcance (NO tocar)

- `src/components/TerminalTTY.jsx` lógica mouse/TUI (Agente 1) — excepto consumir displayName si ya expuesto
- `src/lib/agentLaunchWrapper.js`, swarm launch, `health/route.js` launchSwarmLocal
- `src/lib/asistente/tools/delegation.js` — no re-registrar `delegate_to_opencode`
- Tool `launch_swarm` — no crear
- `ZedAmbientOverlay.jsx` visuals (Agente 3)
- `src/app/globals.css` (Agente 4)

---

## SDD workflow — ejecutar en orden

### 1. explore
`openspec/changes/zed-terminal-awareness/exploration.md`:
- Estado actual de cada tool terminal
- Qué devuelve `/api/terminal/processes` hoy
- Flujo `open_url` → pizarra (eventos, timing `pizarra:arrange-fit`)
- Verificar tareas zed-hardening pendientes vs código

### 2. propose
Intent: Zed entiende terminales por nombre y resume sesiones sin ANSI crudo.

### 3. spec
Escenarios por FR-Z01 a FR-Z10. Incluir:
- Resolución case-insensitive
- Colisión de nombres (error)
- summarize con OpenCode footer visible vs bootstrap incompleto

### 4. design
- `resolveTerminalByName(name, processes)` helper
- Extender `executeInTerminalTool`, `reviewTerminalTool`, `openTerminalTool` para aceptar `name` OR `session_id`
- Integración summarize: server-side en tool vs route — preferir tool
- Cambios mínimos a system prompt (sección "Terminales nombradas")

### 5. tasks (sugerencia)

| Task | Descripción |
|------|-------------|
| Z1 | `resolveTerminalByName` + tests |
| Z2 | Extender `list_terminals` con displayName (consumir API Agente 1) |
| Z3 | `summarize_terminal` tool + strip ANSI + heurísticas OpenCode |
| Z4 | Tests summarize con fixtures ANSI |
| Z5 | `open_terminal` / `execute_in_terminal` aceptan `name` |
| Z6 | Policy multilínea en execute |
| Z7 | Actualizar system prompt |
| Z8 | Hardening `open_url` pizarra + tests dock layout |
| Z9 | E2E 06/07 actualizados |

### 6. apply → 7. verify

---

## Coordinación con Agente 1

Si Agente 1 no ha mergeado cuando empiezas:
- Stub `displayName` en tests con fixture `{ terminalId: 'p1', displayName: 'Chase' }`
- Implementa summarize y name resolution contra interfaz documentada en `terminal-display-names` spec
- Re-ejecutar tests de integración tras merge

---

## Entregables

- [ ] `openspec/changes/zed-terminal-awareness/` completo
- [ ] Tool `summarize_terminal` registrada y testeada
- [ ] System prompt actualizado
- [ ] Tests + E2E verdes
- [ ] `[git:checkpoint]` en DevHub MCP

---

## Comandos útiles

```bash
npm test -- --testPathPattern=asistente|zed
npm test -- --testPathPattern=terminal.list
npx playwright test tests/e2e/06_zed_open_terminal.spec.ts tests/e2e/07_zed_open_url.spec.ts
```

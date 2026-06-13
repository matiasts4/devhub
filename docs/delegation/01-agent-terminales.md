# Prompt — Agente 1: Terminales

> Copia todo este documento como prompt inicial en tu sesión OpenCode.
> Lee primero [`00-shared-context.md`](00-shared-context.md).

---

## Misión

Implementar interacción TUI completa en terminales DevHub (click en OpenCode + scroll sin regresiones), sistema de **nombres humanos** para paneles (Chase, Nate, Cesar…), y contención proactiva de errores. Ejecuta SDD completo y deja tests verdes.

**Prioridad:** este agente es **bloqueante** para Zed (nombres) y Pizarra (shared-view prod).

---

## Comportamiento esperado — Requisitos funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| FR-T02 | Click en mensaje OpenCode abre menú contextual (revert / copy / cancel) | **P0** |
| FR-T04 | Cada terminal visible tiene nombre humano (displayName) | **P0** |
| FR-T05 | Nombre único por workspace; persistido; visible en tab | **P0** |
| FR-T06 | Al crear terminal, asignar nombre del pool automáticamente | **P0** |
| FR-T07 | Renombrar desde UI (doble clic / menú contextual en tab) | P1 |
| FR-T01 | Scroll OpenCode/grok sin basura en PTY | P1 (no regresionar) |
| FR-T03 | Shell plano: wheel scrollea scrollback local xterm, no PTY | P1 (ya OK — no romper) |
| FR-T08 | Contrato TUI adapter: `detectReady`, `wheelStrategy`, `clickStrategy`, `focusStrategy` | P1 |
| FR-T09 | Split canvas: sin glyph corruption al reactivar panel oculto | P1 |
| FR-T10 | Bootstrap OpenCode solo tras footer TUI real | P1 (ya OK — no romper) |

## Requisitos no funcionales

- NFR-T01: Clicks TUI activos no reintroducen leaks en paneles inactivos
- NFR-T02: `sidecar-backend/sessionTransport.js` en paridad con `terminalNoiseFilter.js` — test CI que falle en drift
- NFR-T03: Tests de regresión scroll al cambiar click strategy
- NFR-T04: displayName max 24 chars, `[a-zA-Z0-9_-]`, lookup case-insensitive
- NFR-T05: Pool ~30 nombres: Chase, Nate, Cesar, Riley, Morgan, Alex, Jordan, Casey, Drew, Blake, Quinn, Reese, Sage, River, Phoenix, Avery, Cameron, Dakota, Emerson, Finley, Harper, Hayden, Jamie, Kendall, Logan, Parker, Peyton, Rowan, Skyler, Taylor (ajustar lista en spec)
- NFR-T06: WebGL 1-panel / canvas split sin crash dispose WebKitGTK
- NFR-T07: TDD obligatorio

---

## Causa raíz verificada — FR-T02 (leer antes de implementar)

El scroll funciona; el click no. En `src/lib/terminal/terminalNoiseFilter.js`:

```js
/** Click/drag only (buttons 0–3) — wheel buttons 64/65 must reach TUIs */
export const TERMINAL_MOUSE_CLICK_LEAK_RE = /\x1b\[<(0|[1-3]);[\d;]*[mM]/g;
```

`filterTerminalInputForSession` elimina clicks SGR antes de enviar al WebSocket. Wheel (64/65) pasa.

`buildTerminalMousePressSequence` en `TerminalTTY.jsx` (~línea 836) existe pero **no tiene call sites**.

**Solución esperada:** extender filtro con contexto de sesión TUI activa (`tuiSessionFooterConfirmedRef` / `mode: tui`) para **forward** clicks en panel activo; seguir filtrando en shells inactivos y durante bootstrap.

---

## Caso de uso de aceptación

**UC-1:** En terminal nombrada "Chase" con OpenCode activo y footer visible, clic en mensaje propio → menú revert/copy/cancel aparece y funciona. Scroll sigue operativo después del clic.

**UC-Nombre:** Nueva terminal split → tab muestra "Nate" (del pool) en lugar de solo "P2". Renombrar a "Cesar" persiste tras reload del workspace.

---

## Lecturas obligatorias (en orden)

1. [`docs/delegation/00-shared-context.md`](00-shared-context.md)
2. [`src/lib/terminal/terminalNoiseFilter.js`](../../src/lib/terminal/terminalNoiseFilter.js) + [`terminalNoiseFilter.test.js`](../../src/lib/terminal/terminalNoiseFilter.test.js)
3. [`src/components/TerminalTTY.jsx`](../../src/components/TerminalTTY.jsx) — buscar: `onData`, `handleViewportMouseDown`, `shouldPassthroughNativeTuiWheel`, `buildTerminalMousePressSequence`, `prepareActiveTuiTerminalFocus`, `filterTerminalInputForSession`
4. [`src/components/TerminalWorkspacesManager.jsx`](../../src/components/TerminalWorkspacesManager.jsx) — `derivePanelSemanticMetadata` (~726), `getPanelDisplayLabel` (~2910), estructura panel state
5. [`src/components/terminal/utils/panelHelpers.js`](../../src/components/terminal/utils/panelHelpers.js)
6. [`docs/errores/03-terminal-canvas-glyph-corruption/README.md`](../errores/03-terminal-canvas-glyph-corruption/README.md)
7. [`openspec/changes/swarm-launch-hardening/design.md`](../../openspec/changes/swarm-launch-hardening/design.md) — solo Phase 2 (buffer) y Phase 3 (crash), NO Phase 1 perf
8. [`sidecar-backend/sessionTransport.js`](../../sidecar-backend/sessionTransport.js) — copia CJS del filtro
9. [`src/components/terminal/terminalRendererCapabilities.js`](../../src/components/terminal/terminalRendererCapabilities.js)

---

## Alcance de archivos (puedes modificar)

- `src/lib/terminal/**` (nuevo: `tuiAdapter.js`, `displayNamePool.js`, `panelDisplayName.js`)
- `src/components/TerminalTTY.jsx`
- `src/components/TerminalWorkspacesManager.jsx` (solo naming UI + persistencia)
- `src/components/terminal/**`
- `sidecar-backend/sessionTransport.js` (paridad filtro)
- `src/app/api/terminal/**` si necesitas exponer displayName en processes API
- Tests correspondientes

## Fuera de alcance (NO tocar)

- `src/lib/asistente/**` (Agente 2)
- `src/lib/agentLaunchWrapper.js` salvo bootstrap gate ya estable (no reescribir)
- `src/app/api/agenthub/operations/health/route.js`, `swarmControl.js`, `swarmLaunchBatch.js`
- `src/components/pizarra/**` (Agente 3)
- `src/app/globals.css`, `themes.js` (Agente 4)
- Phase 1 perf de `swarm-launch-hardening` (worktree parallel, fanout)

---

## SDD workflow — ejecutar en orden

### 1. explore
Crear `openspec/changes/terminal-tui-interaction/exploration.md` y `openspec/changes/terminal-display-names/exploration.md`:
- Confirmar causa raíz click con grep
- Documentar estado actual de panel ids y labels
- Listar tests existentes y gaps

### 2. propose
Un proposal por change (o uno combinado si prefieres, pero spec separada):
- Scope in: clicks, adapter, names, buffer/crash Phase 2-3
- Scope out: Zed tools, pizarra, swarm perf

### 3. spec
Escenarios Given/When/Then por cada FR. Incluir matriz TUI:

| TUI | scroll | click | ready signal |
|-----|--------|-------|--------------|
| OpenCode | SGR 64/65 | SGR 0 press | footer regex |
| grok | arrows + SGR | SGR 0 press | grok title |
| plain shell | local xterm | N/A | N/A |

### 4. design
- Dónde vive `displayName` en panel state (localStorage key sugerida: `devhub:panel-names:{workspaceId}`)
- API shape para processes: `{ terminalId, displayName, program?, tuiReady? }`
- Estrategia click: pasar `sessionContext` a `filterTerminalInputForSession`

### 5. tasks
Dependency-sorted, TDD-first. Sugerencia mínima:

| Task | Descripción |
|------|-------------|
| T1 | Test + fix: forward SGR click cuando TUI activo |
| T2 | Regresión: wheel 64/65 sigue pasando |
| T3 | Test paridad sidecar filter |
| T4 | `displayNamePool.js` + asignación automática al crear panel |
| T5 | Persistencia + UI rename en tab |
| T6 | Exponer displayName en `/api/terminal/processes` |
| T7 | `tuiAdapter.js` con registry OpenCode/grok/shell |
| T8 | Glyph corruption test (split 3 paneles) |
| T9 | Aplicar swarm-launch-hardening Phase 2-3 si cabe en budget |

### 6. apply
Implementar. Commits atómicos con mensajes `feat(terminal): ...`

### 7. verify
`verify-report.md` con:
- `npm test -- --testPathPattern=terminalNoiseFilter|TerminalTTY|displayName`
- Evidencia manual UC-1 (describir pasos)
- Lista de archivos tocados

---

## Entregables

- [ ] `openspec/changes/terminal-tui-interaction/` completo
- [ ] `openspec/changes/terminal-display-names/` completo
- [ ] Tests verdes
- [ ] Comentario DevHub MCP con `[git:checkpoint] commit=<sha>`
- [ ] Nota breve para Agente 2: shape final de `{ terminalId, displayName }` en processes API

---

## Comandos útiles

```bash
cd /home/matias/ArxonLabs/devhub
npm test -- --testPathPattern=terminalNoiseFilter
npm test -- --testPathPattern=TerminalTTY
npm test -- --testPathPattern=TerminalWorkspacesManager
```

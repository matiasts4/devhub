# Plan de remediación — lifecycle terminales (post-pizarra-stability)

> Objetivo: propagar la constelación L1–L6 a **todos** los lifecycle triggers de la matriz, empezando por swarm y panel-close.
>
> OpenSpec companion: `openspec/changes/terminal-lifecycle-hardening/`

---

## Fase 0 — Documentación y baseline (esta entrega)

- [x] Catálogo de crashes ([01-crash-catalog.md](./01-crash-catalog.md))
- [x] Matriz cobertura ([02-coverage-matrix.md](./02-coverage-matrix.md))
- [x] Extender repro matrix en [baseline-metrics.md](../03-terminal-canvas-glyph-corruption/baseline-metrics.md) filas 8–15
- [ ] Ejecutar filas 8–15 manualmente y rellenar `_TBD_`

---

## Fase 1 — Swarm launch (P0) — IMPLEMENTADO (código)

| ID      | Estado                                                          |
| ------- | --------------------------------------------------------------- |
| 1.1–1.7 | ✅ Ver `openspec/changes/terminal-lifecycle-hardening/tasks.md` |

---

## Fase 2 — Split — IMPLEMENTADO (código)

| ID      | Estado                            |
| ------- | --------------------------------- |
| 2.1–2.2 | ✅ `handleSplit` + spawn-first    |
| 2.3     | Hereda split vía `handleRunAgent` |

---

## Fase 3 — Relaunch — IMPLEMENTADO (código)

| ID      | Estado |
| ------- | ------ |
| 3.1–3.2 | ✅     |

---

## Fase 4 — Policy central — PARCIAL

| ID      | Estado                                           |
| ------- | ------------------------------------------------ |
| 4.1–4.2 | ✅ `terminalLifecycleSync.js`, TWM helpers       |
| 4.3–4.4 | Pendiente tests integración + audit focus-toggle |

**Problema:** N portales + N singletons montados a la vez; workers standby sin proyección; bursts `swarm-launch` sin L2; hook duplicado.

### Tareas

| ID      | Tarea                                                                                                                            | Archivos                                                 | Capas |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----- |
| **1.1** | Extraer `scheduleTerminalLifecycleSync({ reason, panelIds, workspaceId })` — encapsula L1 burst + native notify                  | `src/lib/terminal/terminalLifecycleSync.js` (nuevo), TWM | L1    |
| **1.2** | Usar helper en `createWorkspaceForSwarmLaunchRequests` con reason `swarm-launch` + fases `[immediate, raf, 120, 340, 500, 1000]` | TWM ~4217                                                | L1    |
| **1.3** | Tras materializar swarm, marcar launchId en ref; en teardown swarm previo, `panelsClosingRef` para panelIds viejos               | TWM, hook                                                | L2    |
| **1.4** | `TerminalSurfaceContent`: skip projection-ready si `visibleTerminalPanelCount > 1` y host sin tamaño (defer segundo rAF)         | SharedTerminalSurface.jsx                                | L3    |
| **1.5** | Post canvas reattach en handler `swarm-launch` (igual que `shared-surface-projection-ready`)                                     | TerminalTTY `handleLayoutSettled`                        | L6    |
| **1.6** | Unificar swarm: hook delega a TWM o eliminar duplicado `createWorkspaceForSwarmLaunchRequests` del hook                          | `useSwarmLaunchController.js`, TWM                       | L1    |
| **1.7** | Implementar `syncActiveWindowSnapshot` en hook **o** eliminar export del hook                                                    | hook                                                     | L1    |

### Tests

- Unit: `terminalLifecycleSync.test.js` — burst phases, cancel on unmount
- Extend: `SharedTerminalSurface.test.js` — projection-ready no dispara si surface cleared
- Manual: ZED + 4 workers, 0 paneles negros sin click, 0 throws en consola

### Aceptación

- [ ] Swarm launch 5 paneles OpenCode + shells: 0 P0 crashes
- [ ] `dispose` count = N (solo paneles nuevos, no re-dispose en toggle)
- [ ] Inbox poll 200 (bus-snapshot ya fixed)

---

## Fase 2 — Split y run-agent (P1) — ~1–2 días

| ID      | Tarea                                                                                                    | Archivos          |
| ------- | -------------------------------------------------------------------------------------------------------- | ----------------- |
| **2.1** | Tras `handleSplit`, `scheduleTerminalLifecycleSync({ reason: 'panel-split', panelIds: allInWorkspace })` | TWM `handleSplit` |
| **2.2** | Mismo tras `spawnFirstTerminalPanelColumns`                                                              | TWM               |
| **2.3** | `handleRunAgent` / planning: burst después de split con panelIds actualizados                            | TWM               |

### Aceptación

- [ ] Split en workspace con 3 paneles + OpenCode activo: sin C-02
- [ ] Nuevo panel visible sin click en &lt; 500ms

---

## Fase 3 — Relaunch / reopen (P1) — ~1 día

| ID      | Tarea                                                                                          | Archivos    |
| ------- | ---------------------------------------------------------------------------------------------- | ----------- |
| **3.1** | `relaunchInFlightRef` + `panelsClosingRef` alineados — no layout events para panel en relaunch | TWM         |
| **3.2** | `devhub:relaunch-panel` → lifecycle sync reason `panel-relaunch`                               | TWM         |
| **3.3** | Verificar `tearDownClientSession` no compite con projection-ready                              | TerminalTTY |

---

## Fase 4 — Policy central y deuda (P2) — ~2 días

| ID      | Tarea                                                                              |
| ------- | ---------------------------------------------------------------------------------- |
| **4.1** | `handleLayoutSettled`: early return unificado + log `fit-skip` con reason          |
| **4.2** | Auditar todos los `dispatchTerminalLayoutSettled` call sites (grep) — checklist L1 |
| **4.3** | Re-habilitar o documentar `shouldSuspendNativeSurfaces` durante grid launcher      |
| **4.4** | Estandarizar eventos A.0 reservados (`webgl-release`, `portal-hide`) en código     |
| **4.5** | Test integración: `TerminalTTY.singleton` + escenario `swarm-launch` mock          |

---

## Fase 5 — Swarm orquestación (paralelo, no bloquea estabilidad)

Ver análisis previo en conversación — después de Fase 1 estable:

- Fix `SwarmPromptEngine` interpolación reactivación
- ZED activation post-launch (`swarmKickoff.activateZedStandbySession`)
- Unificar mission_id / launchId en bus

---

## Orden de ejecución recomendado

```
Fase 0 (doc) → Fase 1 (swarm) → Fase 2 (split) → Fase 3 (relaunch) → Fase 4 (policy)
                                                      ↘ Fase 5 (orquestación) en paralelo humano
```

---

## Criterio de “cerrado” global

1. Matriz baseline filas 1–15 sin Crash? = sí en dev Chrome
2. Filas 8–10 (swarm, panel-close) verificadas en `.deb` WebKitGTK
3. `npm test -- --testPathPattern="SharedTerminalSurface|terminalLifecycle|singleton"` verde
4. Ningún P0 en [01-crash-catalog.md](./01-crash-catalog.md) sin estado Fixed/Mitigado con test

---

## Comandos de verificación por fase

```bash
# Tras cada fase
npm test -- --testPathPattern="SharedTerminalSurface|nativeLayoutSync|TerminalTTY.test" --testPathPattern="refreshTerminalViewport"

# Swarm evidence
node scripts/verify-swarm-launch.mjs

# Lifecycle log review
rg '"event":"dispose"' data/logs/terminal-debug.log | wc -l
```

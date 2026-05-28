# Tareas de implementación — DevHub Swarm estilo Plyrium

> **Estado:** Backlog técnico en Markdown.  
> **Fecha:** 2026-05-24  
> **Motivo:** No crear estas tareas todavía en DevHub/DevHoof porque la base de datos ha presentado crasheos.  
> **Documento padre:** [`28_Plyrium_Architecture_Analysis_and_Plan.md`](./28_Plyrium_Architecture_Analysis_and_Plan.md)

---

## 0. Reglas antes de implementar

- [ ] DevHub puede copiar patrones de Plyrium, pero LSWarm debe ejecutarse con runtime propio de DevHub.
- [ ] No invocar `plyrium team-spawn`, `plyrium worktree-add` ni comandos Plyrium como camino principal.
- [ ] No depender de `.plyrium-forge/*.db` para estado runtime.
- [ ] Todo agente lanzado por LSWarm debe tener cwd propio bajo `.devhub/worktrees/...`.
- [ ] Si no hay worktree real, no se marca workspace como `ready`.
- [ ] Si el cambio supera ~400 líneas, partirlo en PRs/chunks revisables.

---

## Fase 0 — Diagnóstico y baseline

### Tarea 0.1 — Script de diagnóstico SQLite/runtime

**Objetivo:** poder comparar antes/después sin depender de observación manual.

**Archivos probables:**

- `scripts/diagnose-swarm-runtime.mjs` o similar
- `docs/29_Plyrium_Style_Swarm_Implementation_Tasks.md`

**Implementar:**

- [ ] Imprimir Node version, platform, arch.
- [ ] Imprimir versión instalada de `better-sqlite3` desde `package-lock.json`.
- [ ] Revisar `~/.devhub/data/devhub.db` y `data/devhub.db` si existen.
- [ ] Imprimir `PRAGMA journal_mode`, `foreign_keys`, `busy_timeout`, `synchronous`.
- [ ] Imprimir tamaño de `*-wal` y `*-shm`.
- [ ] Imprimir procesos relevantes: Node, Next, Tauri, opencode, tmux.

**Verificación:**

```bash
node scripts/diagnose-swarm-runtime.mjs
```

**Criterios de aceptación:**

- [ ] El script no modifica DB.
- [ ] El output sirve para pegarlo en un bug report.

### Tarea 0.2 — Matriz de reproducción de crash

**Objetivo:** saber si el crash aparece por cantidad de agentes, DB writes o PTY/tmux.

**Implementar:**

- [ ] Crear checklist de pruebas 1, 3 y 5 agentes.
- [ ] Registrar memoria antes/durante/después.
- [ ] Registrar `dmesg` después del crash.
- [ ] Registrar si hay crecimiento de WAL.
- [ ] Registrar si quedan procesos huérfanos.

**Output esperado:**

- `data/swarm-crash-baseline-YYYY-MM-DD.md`

---

## Fase 1 — Worktrees reales por rol

### Tarea 1.1 — Crear `AgentWorkspaceManager`

**Objetivo:** centralizar creación, validación y cleanup de worktrees DevHub.

**Archivos probables:**

- `src/lib/swarm/agentWorkspaceManager.js`
- tests en `src/lib/swarm/*.test.js`

**API sugerida:**

```js
prepareAgentWorktree({
  repoRoot,
  launchId,
  roleKey,
  baseRef,
}) => {
  branchName,
  worktreePath,
  observedHead,
  created,
}
```

**Implementar:**

- [ ] Resolver `repoRoot` desde proyecto.
- [ ] Calcular path `.devhub/worktrees/<launch-id>/<role>`.
- [ ] Calcular branch `devhub/swarm/<launch-id>/<role>`.
- [ ] Ejecutar `git worktree add` si no existe.
- [ ] Validar que `worktreePath/.git` existe.
- [ ] Obtener `observedHead` real con `git rev-parse HEAD`.
- [ ] Retornar errores estructurados si falla.

**Criterios de aceptación:**

- [ ] No crea worktrees bajo `.plyrium-forge`.
- [ ] No llama a `plyrium`.
- [ ] Es idempotente para el mismo launch/role.

### Tarea 1.2 — Integrar worktrees en `launchSwarmLocal`

**Archivos probables:**

- `src/app/api/agenthub/operations/health/route.js`

**Implementar:**

- [ ] Antes de `activatePreparedWorkspace`, crear worktree real.
- [ ] Reemplazar `observedHead = ${launchId}-${roleKey}-head` por head real.
- [ ] Guardar `worktree_path` real en `agent_workspaces`.
- [ ] Usar `workspacePath = worktreePath` para prompt, session y runtime.
- [ ] Si falla un worktree, no crear runtime request para ese rol.

**Criterios de aceptación:**

- [ ] DB y runtime coinciden en el mismo path.
- [ ] No queda metadata falsa de worktree.

### Tarea 1.3 — Propagar `workspacePath` a `runtime_requests`

**Archivos probables:**

- `src/app/api/agenthub/operations/health/route.js`
- `src/components/terminal/hooks/useSwarmLaunchController.js`
- `src/components/TerminalWorkspacesManager.jsx`

**Implementar:**

- [ ] Incluir `workspacePath` por rol en cada runtime request.
- [ ] Incluir `workspaceId`, `runId`, `sessionId`, `worktreePath`, `branchName`.
- [ ] El frontend debe usar `request.workspacePath` como `panel.cwd`.
- [ ] Persistir en `devhub_agent_runs` el cwd esperado y cwd real.

**Criterios de aceptación:**

- [ ] Al lanzar 5 agentes, cada panel tiene cwd distinto.
- [ ] El cwd visible coincide con `agent_workspaces.worktree_path`.

### Tarea 1.4 — Validación de cwd en PTY spawn

**Archivos probables:**

- `src/lib/terminal/ttyServer.js`
- `src/lib/terminal/cwdGuard.*`

**Implementar:**

- [ ] Rechazar cwd inexistente.
- [ ] Rechazar cwd fuera del repo o fuera de `.devhub/worktrees` para swarm roles.
- [ ] Loguear error claro si cae al cwd global.
- [ ] Evitar fallback silencioso al repo raíz en swarms.

**Criterios de aceptación:**

- [ ] Un runtime request sin `workspacePath` falla de forma visible.
- [ ] No arranca accidentalmente en `/home/matias/ArxonLabs/devhub`.

---

## Fase 2 — Wrapper de lanzamiento DevHub

### Tarea 2.1 — Crear wrapper de agente

**Archivos probables:**

- `src/lib/agentLaunchCommand.js`
- `scripts/devhub-agent-wrapper.sh` o wrapper generado inline

**Implementar:**

- [ ] Exportar `DEVHUB_AGENT_ID`.
- [ ] Exportar `DEVHUB_MISSION_ID`.
- [ ] Exportar `DEVHUB_ROLE`.
- [ ] Exportar `DEVHUB_WORKSPACE_PATH`.
- [ ] Exportar `DEVHUB_RUN_ID`.
- [ ] Imprimir identidad y `pwd` al inicio.
- [ ] Abort si `pwd != DEVHUB_WORKSPACE_PATH`.
- [ ] Ejecutar heartbeat inicial antes del agente.
- [ ] Ejecutar evento final al salir.

**Criterios de aceptación:**

- [ ] Primeras líneas del terminal prueban rol/cwd.
- [ ] El wrapper no menciona Plyrium como runtime.

### Tarea 2.2 — Mejorar prompts de roles

**Archivos probables:**

- `src/app/api/agenthub/operations/health/route.js`
- quizá `src/lib/operations/swarmControl.js`

**Implementar:**

- [ ] Incluir regla: “trabaja solo dentro de este worktree”.
- [ ] Incluir regla: “no uses Plyrium para coordinar ni ejecutar este swarm”.
- [ ] Incluir cómo reportar progreso vía DevHub.
- [ ] Director debe verificar roster/cwd antes de asignar tareas.

**Criterios de aceptación:**

- [ ] El prompt evita explícitamente confundir Plyrium con DevHub.

---

## Fase 3 — Presencia y eventos

### Tarea 3.1 — Endpoint de heartbeat

**Archivos probables:**

- `src/app/api/agenthub/presence/heartbeat/route.js`
- `src/lib/db/localDb.js` o módulo específico

**Payload sugerido:**

```json
{
  "mission_id": "launch-xxxx",
  "agent_id": "launch-xxxx-coder",
  "workspace_id": "...",
  "run_id": "...",
  "role": "coder",
  "state": "busy",
  "cwd": "/.../.devhub/worktrees/launch-xxxx/coder",
  "status_summary": "implementing task"
}
```

**Implementar:**

- [ ] Validar mission/agent/workspace.
- [ ] Upsert `agent_presence`.
- [ ] Rechazar cwd que no coincide con worktree.
- [ ] Retornar TTL recomendado.

**Criterios de aceptación:**

- [ ] Heartbeat actualiza `last_seen_at` y `expires_at`.

### Tarea 3.2 — Eventos append-only

**Archivos probables:**

- `src/lib/db/localDb.js`
- nueva tabla si no se reutiliza `mission_messages`
- endpoints `src/app/api/agenthub/events/*`

**Implementar:**

- [ ] Definir tabla `agent_events` o adaptar `mission_messages`.
- [ ] Insertar eventos sin borrar historial.
- [ ] Index por `mission_id`, `agent_id`, `created_at`.
- [ ] Soportar eventos mínimos: boot, cwd verified, progress, needs_help, completed, exit, crash.

**Criterios de aceptación:**

- [ ] Control Room puede listar últimos eventos por misión.

### Tarea 3.3 — Detección de agentes stale/offline

**Implementar:**

- [ ] Job/endpoint que marque offline si `expires_at < now`.
- [ ] Diferenciar `offline` de `crashed` si hay exit code.
- [ ] Mostrar estado en UI.

**Criterios de aceptación:**

- [ ] Un agente muerto deja de verse como `busy` indefinidamente.

---

## Fase 4 — DB write queue / single writer

### Tarea 4.1 — Inventario de escrituras directas

**Objetivo:** saber quién escribe DB durante launch/swarm.

**Implementar:**

- [ ] Buscar usos de `getDb()` y `createClient().from(...).insert/update/delete` en rutas de launch.
- [ ] Clasificar escrituras: launch metadata, presence, events, registry, sessions, runs.
- [ ] Marcar cuáles pueden ser async/queued.

**Output:**

- `docs/review/swarm-db-write-inventory.md`

### Tarea 4.2 — Serializar escrituras críticas

**Implementar:**

- [ ] Crear helper `withDbWriteQueue(fn)` o equivalente.
- [ ] Usarlo en launch, presence y events.
- [ ] Agregar timeout y logging.
- [ ] Evitar transacciones largas.

**Criterios de aceptación:**

- [ ] Launch de 5 agentes no dispara escrituras concurrentes no controladas desde la misma app.

### Tarea 4.3 — Política de WAL checkpoint

**Implementar:**

- [ ] Medir tamaño de `devhub.db-wal`.
- [ ] Si supera umbral, correr checkpoint seguro.
- [ ] No hacer checkpoint agresivo durante launch si bloquea UI.
- [ ] Loguear checkpoint y resultado.

**Criterios de aceptación:**

- [ ] WAL no crece sin límite durante swarms largos.

---

## Fase 5 — Supervisor propio de DevHub

### Tarea 5.1 — Snapshot runtime read-only

**Implementar:**

- [ ] Endpoint read-only con mission, agents, worktrees, sessions, PIDs, tmux, presence, events.
- [ ] No escribir DB al consultar snapshot.
- [ ] Mostrar anomalías: cwd mismatch, missing worktree, stale heartbeat, orphan process.

**Criterios de aceptación:**

- [ ] Un solo endpoint explica por qué una terminal no aparece o por qué un agente está stale.

### Tarea 5.2 — Reconciliación al reiniciar

**Implementar:**

- [ ] Al iniciar, leer misiones activas.
- [ ] Verificar worktrees en disco.
- [ ] Verificar sesiones tmux/procesos.
- [ ] Marcar orphan/offline/crashed según evidencia.

**Criterios de aceptación:**

- [ ] Después de reiniciar DevHub, Control Room no muestra estado falso.

### Tarea 5.3 — Cleanup seguro

**Implementar:**

- [ ] No borrar worktree con cambios sin checkpoint.
- [ ] Guardar summary antes de cleanup.
- [ ] `git worktree remove` solo cuando está merged/aborted y aprobado.
- [ ] `git worktree prune` con cuidado y logs.

**Criterios de aceptación:**

- [ ] No se pierden cambios de agentes por cleanup automático.

---

## Fase 6 — Merge/handoff

### Tarea 6.1 — Checkpoint por agente

**Implementar:**

- [ ] Cada agente debe dejar `[git:checkpoint]` o equivalente.
- [ ] Registrar commit local o `commit=none` solo si no hubo cambios.
- [ ] Registrar checks ejecutados.
- [ ] Registrar docs/evidencia.

**Criterios de aceptación:**

- [ ] Director puede ver qué branch/worktree está listo para revisar.

### Tarea 6.2 — Worktree temporal de integración

**Implementar:**

- [ ] Crear worktree temporal para merge/review.
- [ ] Mergear branches de roles uno por uno.
- [ ] Ejecutar checks.
- [ ] Generar reporte de conflictos.

**Criterios de aceptación:**

- [ ] El repo principal no se ensucia durante revisión.

### Tarea 6.3 — Cierre de misión

**Implementar:**

- [ ] Marcar misión `completed`, `failed` o `aborted` solo con evidencia.
- [ ] Guardar resumen final.
- [ ] Mantener worktrees si hay cambios sin merge.
- [ ] Limpiar solo lo seguro.

---

## Orden recomendado de ejecución

1. Tarea 1.1 — `AgentWorkspaceManager`.
2. Tarea 1.2 — Integrar worktrees reales en launch.
3. Tarea 1.3 — Propagar `workspacePath` al frontend.
4. Tarea 1.4 — Validación de cwd en PTY.
5. Tarea 2.1 — Wrapper de launch.
6. Tarea 3.1 — Heartbeat.
7. Tarea 3.2 — Eventos.
8. Tarea 4.1 — Inventario DB writes.
9. Tarea 4.2 — Write queue.
10. Fase 5 y 6 después de estabilizar launches.

## Definición de “funciona casi igual que Plyrium”

- [ ] Un swarm de 5 roles arranca sin compartir cwd.
- [ ] Cada rol tiene branch/worktree propio.
- [ ] Control Room ve presencia real.
- [ ] Hay feed de eventos por agente.
- [ ] Un agente puede crashear sin tumbar toda la app.
- [ ] Reiniciar UI no destruye el estado operativo.
- [ ] El merge/handoff se hace desde branches/worktrees, no desde el repo principal.
- [ ] No se usó Plyrium para ejecutar LSWarm.

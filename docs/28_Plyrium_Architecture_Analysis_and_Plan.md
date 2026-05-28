# DevHub Swarm Stability Plan inspirado en Plyrium

> **Estado:** Propuesta técnica revisada — lista para convertir en tareas.  
> **Fecha:** 2026-05-24  
> **Alcance:** estabilidad de LSWarm/Swarm Control, aislamiento de agentes, presencia, eventos y resistencia a crasheos.  
> **Decisión guía:** DevHub puede copiar patrones de Plyrium de forma agresiva si eso mejora la estabilidad, pero **LSWarm debe ejecutarse con DevHub**, no usando Plyrium como runtime.

---

## 0. Resumen ejecutivo

DevHub debe parecerse más a Plyrium en su comportamiento operativo:

1. **Cada agente en su propio git worktree real.**
2. **Cada terminal/PTY arranca dentro de ese worktree.**
3. **Cada agente reporta presencia/heartbeat y eventos.**
4. **Las escrituras a SQLite se reducen, serializan o se mueven a un sidecar.**
5. **La UI de DevHub queda como superficie propia de ejecución**, no como wrapper accidental de Plyrium.

La documentación anterior apuntaba bien, pero necesitaba corregir dos cosas:

- No basta con guardar metadata de `worktree_path`; hay que crear el worktree y propagar ese cwd al runtime.
- Plyrium sirve como referencia de arquitectura, pero **no debe ser invocado para lanzar LSWarm** salvo en herramientas de diagnóstico/adaptador explícitamente opcionales.

---

## 1. Regla de producto: copiar patrones, no delegar el producto

| Tema | Regla |
|------|-------|
| Inspiración | Podemos copiar literalmente estructuras útiles de Plyrium: worktrees, presencia, eventos, ops board, team chat, sidecar/supervisor. |
| Runtime | LSWarm se lanza desde DevHub/Swarm Control. No debe depender de `plyrium team-spawn`, `plyrium worktree-add` o comandos equivalentes para funcionar. |
| Nombres visibles | En UI, logs y docs operativos se debe hablar de **DevHub Swarm**, **LSWarm**, **Agent Workspaces**, **Control Room**. Plyrium solo aparece como referencia técnica. |
| DB interna de Plyrium | No leer `.plyrium-forge/*.db` como contrato de producto. Puede auditarse para investigación, pero no debe ser dependencia runtime. |
| CLI de Plyrium | Solo permitido como herramienta opcional de investigación/adaptador, nunca como camino principal de ejecución. |

**Motivo:** ya ocurrió una confusión donde se usó Plyrium para ejecutar LSWarm. Eso hace que parezca que DevHub funciona, cuando en realidad el runtime estable pertenece a otra herramienta.

---

## 2. Evidencia local revisada

Esta propuesta se basa en evidencia real dentro del repo, no solo en intuición.

### 2.1 Plyrium sí existe localmente

`./.plyrium-forge/agent-bin/plyrium --help` reporta:

- `plyrium 1.1.25 — PlyriumForge agent CLI`
- comandos de coordinación: `agent-status`, `agent-say`, `agent-feed`, `agent-list`
- comandos de worktree: `worktree-add`, `worktree-list`, `worktree-merge`, `worktree-remove`
- comandos de equipos: `team-list`, `team-show`, `team-spawn`, `team-tell`, `team-join`
- comandos de retrieval/token efficiency: `index-folder`, `search-symbols`, `ranked-context`, etc.

### 2.2 Plyrium usa DBs separadas y simples

| DB | Tablas confirmadas | Función |
|----|--------------------|---------|
| `.plyrium-forge/agents.db` | `agent_presence`, `agent_events` | Presencia y feed de agentes. |
| `.plyrium-forge/ops.db` | `cards`, `card_history` | Kanban/ops board con historial. |
| `.plyrium-forge/teams.db` | `teams`, `team_members`, `team_chat` | Equipos, miembros y chat. |
| `.plyrium-forge/missions.db` | `missions`, `mission_agents`, `mission_events`, `mission_artifacts` | Misiones y artifacts. |
| `.plyrium-forge/operator-inbox.db` | `inbox_items` | Alertas al operador. |

La idea importante no es “muchas DBs” por sí misma. La idea importante es **separar responsabilidades y evitar que todos los procesos peleen por una DB monolítica con muchas escrituras heterogéneas**.

### 2.3 Plyrium usa worktrees reales

`git worktree list --porcelain` muestra worktrees bajo:

```text
.plyrium-forge/worktrees/pane-p_40df269092784f5f894c83-coder
```

con rama propia:

```text
refs/heads/pane/p_40df269092784f5f894c83-coder
```

Dentro de esos worktrees existe estado local por agente, incluyendo `.agent/`.

### 2.4 DevHub ya tiene piezas parecidas, pero incompletas

DevHub ya tiene:

- `journal_mode = WAL`
- `busy_timeout = 5000`
- `agent_presence`
- `swarm_missions`
- `mission_messages`
- `agent_workspaces`
- metadata de `worktree_path`

Pero el flujo actual todavía tiene una brecha crítica:

1. Se registra metadata como si hubiera worktree.
2. No está garantizado que se cree un `git worktree` real por rol.
3. `runtime_requests` puede omitir `workspacePath` por agente.
4. El frontend cae al `cwd` global.
5. Los agentes terminan compartiendo el repo principal.

Esta brecha es más grave que el diseño de DB, porque provoca exactamente lo que queremos evitar: varios agentes trabajando sobre el mismo filesystem, misma `.next`, mismos logs, mismo SQLite, mismo git tree.

---

## 3. Problema a resolver

### 3.1 Crasheo nativo y contención SQLite

Se observaron crashes asociados a `better_sqlite3.node`, por ejemplo:

```text
trap invalid opcode ... in better_sqlite3.node
trap int3 ... in node
```

Interpretación revisada:

- SQLite con WAL mejora lectura/escritura concurrente, pero sigue teniendo **un solo writer efectivo por DB**.
- `better-sqlite3` es un binding nativo; si hay bug, ABI incompatible, presión de procesos o acceso concurrente mal controlado, el fallo puede matar el proceso Node.
- El diagnóstico exacto debe validarse, porque SQLite normalmente debería devolver `SQLITE_BUSY`/lock antes que provocar segfault.
- Aunque WAL ya esté activo, la solución robusta sigue siendo **reducir los escritores directos y mover escrituras críticas detrás de una cola/sidecar**.

### 3.2 Agentes compartiendo cwd

Este es el problema más accionable.

Cuando 4–5 agentes comparten `/home/matias/ArxonLabs/devhub`, comparten:

- `.next/` y caches de dev server;
- `data/` y DBs/logs locales;
- el mismo working tree de git;
- archivos temporales;
- estado de herramientas/agents;
- posibles instalaciones o comandos de build/test.

**Objetivo:** ningún agente de LSWarm debe editar el repo principal directamente. Cada rol debe editar su branch/worktree.

### 3.3 Falta de presencia confiable

DevHub registra agentes, pero necesita un contrato operativo más fuerte:

- heartbeat periódico;
- TTL/expiración;
- estado `busy`, `idle`, `waiting`, `offline`, `crashed`;
- último cwd observado;
- último proceso/PTY observado;
- eventos append-only para auditar qué pasó.

### 3.4 Next/Tauri como controlador frágil

Hoy parte del control está acoplado a la app/UI. Si Next/Tauri o el server Node muere, la misión puede quedar en estado ambiguo.

Plyrium funciona mejor porque parece tratar el CLI/supervisor como plano operativo estable y la UI como una superficie encima.

DevHub debe moverse hacia ese patrón: **un supervisor propio de DevHub**, no Plyrium.

---

## 4. Arquitectura objetivo

```text
DevHub UI / Control Room
        │
        ▼
DevHub Swarm Supervisor / Sidecar
        │
        ├── Agent Workspace Manager
        │     ├── git worktree add/remove/status
        │     ├── branch naming
        │     └── cwd validation
        │
        ├── Runtime Launcher
        │     ├── tmux/PTY lifecycle
        │     ├── opencode/codex/hermes command build
        │     └── per-role workspacePath propagation
        │
        ├── Presence + Event Service
        │     ├── heartbeat upsert
        │     ├── append-only events
        │     └── stale/crash detection
        │
        └── DB Write Queue
              ├── serialized writes
              ├── WAL checkpoint policy
              └── crash-safe recovery
```

### Invariantes obligatorias

- Cada rol tiene `agent_id`, `workspace_id`, `branch_name`, `worktree_path`, `run_id`.
- `worktree_path` debe existir en disco antes de lanzar el agente.
- El `cwd` real del PTY debe ser igual a `worktree_path`.
- El prompt debe decir el mismo workspace que usa el proceso real.
- Si no se puede crear el worktree, no se lanza ese agente.
- La misión puede degradarse con agentes offline, pero no debe crashear toda la app.
- DevHub puede importar ideas de Plyrium, pero el runtime no llama a Plyrium para ejecutar el swarm.

---

## 5. Fases de implementación

### Fase 0 — Preflight y línea base de crashes

**Objetivo:** saber qué está fallando antes de cambiar demasiadas piezas.

Tareas:

1. Registrar versiones: Node, `better-sqlite3`, SQLite, OS, Tauri, Next.
2. Agregar script de diagnóstico que imprima:
   - `PRAGMA journal_mode`
   - `PRAGMA busy_timeout`
   - `PRAGMA foreign_keys`
   - tamaño de `devhub.db-wal`
   - cantidad de procesos Node/opencode/tmux vivos.
3. Reproducir launch con 1, 3 y 5 agentes.
4. Guardar evidencia: logs, `dmesg`, procesos y memoria.

Criterio de salida:

- Tenemos una matriz simple: qué número de agentes crashea, qué proceso crashea y en qué punto.

### Fase 1 — Worktrees reales por rol

**Objetivo:** copiar el comportamiento más importante de Plyrium: aislamiento real por agente.

Flujo esperado:

```text
launch-xxxx
  director -> .devhub/worktrees/launch-xxxx/director -> branch devhub/swarm/launch-xxxx/director
  coder    -> .devhub/worktrees/launch-xxxx/coder    -> branch devhub/swarm/launch-xxxx/coder
  auditor  -> .devhub/worktrees/launch-xxxx/auditor  -> branch devhub/swarm/launch-xxxx/auditor
  devops   -> .devhub/worktrees/launch-xxxx/devops   -> branch devhub/swarm/launch-xxxx/devops
  architect-> .devhub/worktrees/launch-xxxx/architect-> branch devhub/swarm/launch-xxxx/architect
```

Cambios esperados:

- Crear `AgentWorkspaceManager` propio de DevHub.
- Crear worktree antes de registrar `ready`.
- Usar `git rev-parse HEAD` real como `observed_head`.
- Propagar `workspacePath` en cada `runtime_request`.
- Hacer que el frontend use ese `workspacePath` como cwd del panel.
- Validar en PTY spawn que el cwd existe y está permitido.

Criterio de salida:

- 5 agentes pueden ejecutar `pwd` y cada uno muestra un path distinto bajo `.devhub/worktrees/...`.
- Ningún agente arranca en el repo raíz salvo que sea un modo manual explícito.

### Fase 2 — Launch wrapper propio de DevHub

**Objetivo:** que cada agente se auto-oriente como en Plyrium, pero con comandos DevHub.

El prompt/command wrapper debe incluir:

1. `echo DEVHUB_AGENT_ID DEVHUB_MISSION_ID DEVHUB_WORKSPACE_PATH DEVHUB_ROLE`
2. `pwd`
3. verificación: `pwd == DEVHUB_WORKSPACE_PATH`
4. heartbeat inicial
5. ejecución del agente (`opencode`, `codex` o `hermes`)
6. heartbeat final o evento de salida si el proceso termina

Variables sugeridas:

```bash
DEVHUB_AGENT_ID
DEVHUB_MISSION_ID
DEVHUB_ROLE
DEVHUB_WORKSPACE_ID
DEVHUB_WORKSPACE_PATH
DEVHUB_RUN_ID
DEVHUB_SUPERVISOR_URL
```

Criterio de salida:

- El primer output visible de cada terminal prueba identidad, rol y cwd.
- Si el cwd no coincide, el agente aborta antes de editar archivos.

### Fase 3 — Presencia y eventos al estilo Plyrium

**Objetivo:** que Control Room sepa quién está vivo y qué está haciendo.

Modelo mínimo:

- `agent_presence`: estado actual por agente/runtime.
- `agent_events` o equivalente: feed append-only.
- `mission_messages`: directivas/handoffs.

Estados sugeridos:

| Estado | Significado |
|--------|-------------|
| `booting` | Proceso creado, todavía no confirmó cwd. |
| `online` | Confirmó identidad y cwd. |
| `busy` | Ejecutando tarea. |
| `waiting` | Necesita input o aprobación. |
| `idle` | Vivo, sin tarea activa. |
| `offline` | Sin heartbeat dentro del TTL. |
| `crashed` | Proceso terminó con error o señal. |

Eventos sugeridos:

- `agent_booted`
- `cwd_verified`
- `task_started`
- `task_progress`
- `needs_help`
- `handoff_ready`
- `task_completed`
- `process_exit`
- `crash_detected`

Criterio de salida:

- Control Room puede mostrar roster + último heartbeat + último evento sin leer logs crudos.

### Fase 4 — DB write queue / single writer

**Objetivo:** reducir crasheos por acceso concurrente a SQLite.

Opciones:

| Opción | Uso recomendado |
|--------|-----------------|
| Mutex in-process | Hotfix corto, solo protege el proceso actual. |
| Cola write-through en API | Mejor primer paso real; todos escriben por endpoints. |
| Sidecar single-writer | Mejor arquitectura; si crashea, no mata la UI. |
| DBs separadas estilo Plyrium | Buena evolución, después de tener contrato estable. |

Recomendación:

1. Implementar endpoints de escritura serializados.
2. Prohibir escrituras directas desde wrappers/agentes.
3. Añadir política de checkpoint WAL.
4. Después dividir por dominio si todavía hay contención.

Criterio de salida:

- Los agentes no abren `devhub.db` directamente.
- Las escrituras pasan por un servicio DevHub único.
- Un crash de writer no borra proyectos ni deja swarms imposibles de limpiar.

### Fase 5 — Supervisor resiliente propio

**Objetivo:** que la misión sobreviva mejor a caídas de UI/server.

Funciones:

- monitorear PIDs/tmux sessions;
- detectar procesos huérfanos;
- actualizar presencia si el agente deja de latir;
- restaurar estado al reiniciar DevHub;
- limpiar worktrees abandonados con política segura;
- exponer snapshot read-only para diagnóstico.

Criterio de salida:

- Reiniciar la UI no mata necesariamente la misión.
- Después de reiniciar, Control Room reconstruye roster, worktrees, procesos y estado.

### Fase 6 — Merge/handoff y cierre de misión

**Objetivo:** no solo lanzar agentes, sino cerrar su trabajo de forma segura.

Flujo:

1. Cada agente deja checkpoint local.
2. Director revisa branches/worktrees.
3. Auditor valida diffs y pruebas.
4. DevHub crea resumen de merge.
5. Se mergea de forma controlada, preferentemente en worktree temporal de integración.
6. Se limpia o conserva worktree según resultado.

Criterio de salida:

- Ninguna misión se marca como completada sin evidencia, checks y decisión de merge/handoff.

---

## 6. Lo que NO haremos por ahora

- No usar Plyrium para lanzar LSWarm.
- No leer `.plyrium-forge/*.db` desde DevHub como fuente runtime.
- No marcar workspaces como `ready` si el worktree no existe.
- No lanzar todos los roles en el mismo cwd “solo para probar”.
- No cerrar una misión solo porque los paneles existen.
- No hacer una migración grande de DB antes de corregir cwd/worktrees.

---

## 7. Preguntas abiertas

| Pregunta | Decisión preliminar |
|----------|---------------------|
| ¿Path de worktrees? | `.devhub/worktrees/<launch-id>/<role>` para no mezclar con `.plyrium-forge`. |
| ¿Branches? | `devhub/swarm/<launch-id>/<role>`. |
| ¿Copiar o symlink de `node_modules`? | Empezar sin copiar; usar install compartida solo si los comandos no mutan `node_modules`. Evaluar symlink como optimización. |
| ¿DB separadas desde el inicio? | No. Primero single-writer/queue; luego split por dominio. |
| ¿Plyrium adapter? | Opcional y separado; nunca requerido para LSWarm. |
| ¿Tareas en DevHub/DevHoof? | Por ahora no; documentarlas en Markdown debido a crasheos DB. |

---

## 8. Próximo documento

Las tareas detalladas viven en:

- [`docs/29_Plyrium_Style_Swarm_Implementation_Tasks.md`](./29_Plyrium_Style_Swarm_Implementation_Tasks.md)

Ese documento debe usarse como backlog inicial hasta que DevHub/DevHoof esté lo bastante estable para registrar tareas en la propia aplicación.

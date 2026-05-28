---
Fecha de Modificación: 23 de mayo de 2026
Estado: PLAN — no implementar todavía
Owner: DevHub
Relacionado:
  - docs/23_Swarm_Workspace_Intencion_y_Roadmap.md
  - docs/25_Terminal_Renderer_Robusto_Roadmap.md
  - src/components/TerminalWorkspacesManager.jsx
  - src/components/TerminalTTY.jsx
  - src/components/terminal/hooks/useSwarmLaunchController.js
  - src/app/api/swarm/processes/route.js
  - src/app/api/terminal/sessions/route.js
  - src-tauri/src/native_vte.rs
  - data/logs/terminal-debug.log
  - data/logs/crash-dumps/
---

# 27 Session Resume + Swarm Stability — Plan de ejecución

## Objetivo

Convertir DevHub en una app que pueda **cerrarse, apagarse o recargarse y volver a levantar el workspace operativo automáticamente**, incluyendo:

- workspaces y tabs abiertos;
- layouts de terminales;
- sesiones shell, OpenCode y Swarm;
- superficies GTK/VTE o fallback xterm;
- estado de agentes, procesos y topology;
- diagnóstico claro cuando algo no pueda reanudarse.

La meta NO es sólo “guardar layout”. La meta es separar y reconciliar tres realidades que hoy se mezclan:

```txt
UI workspace state        = tabs, layout, paneles, dock, renderer
Terminal runtime state    = PTY/WebSocket/VTE, cwd, shell, pid, session id
Agent/Swarm state         = OpenCode process, opencode session, agent_registry, run, topology
```

## Problema observado

Durante las pruebas de Swarm se detectó:

- paneles visibles sin contenido de terminal;
- terminales `alive: true` con `socketCount: 0`;
- procesos OpenCode activos aunque la topología o Swarm Control no los muestre;
- `agent_registry` marcando agentes como `idle` aunque el proceso siga vivo;
- errores de cuota OpenCode (`GoUsageLimitError`, HTTP 429) que dejan procesos vivos pero bloqueados;
- crash dumps con `reason: ws_abrupt_close_no_clients`;
- GTK/VTE requiere ownership explícito; ocultar DOM con CSS no basta.

Esto confirma que hace falta un **Restore + Reconciliation Layer**, no sólo fixes visuales aislados.

## Principios de diseño

1. **DevHub debe restaurar automáticamente por defecto**, sin pedir comandos al usuario.
2. **Nunca asumir que un proceso vivo equivale a agente sano.**
3. **Nunca asumir que `agent_registry` equivale a proceso vivo.**
4. **Toda restauración debe ser idempotente:** reintentar no debe duplicar procesos.
5. **Toda sesión debe tener un owner durable:** workspace, panel, terminal session, agent run o process record.
6. **La UI debe mostrar estados honestos:** activo, reconectado, huérfano, bloqueado por cuota, stale, terminado.
7. **El usuario debe tener acciones seguras:** reanudar, relanzar, matar, limpiar metadata, abrir logs.
8. **Antes de implementar restore completo hay que mejorar observabilidad**, porque hoy se pierde evidencia.

---

## Arquitectura propuesta

### A. Session Restore Manifest

Crear un manifiesto persistente por proyecto/app:

```ts
type RestoreManifest = {
  version: 1;
  savedAt: string;
  appSessionId: string;
  activeProjectId: string | null;
  activeWorkspaceId: string | null;
  workspaces: RestoreWorkspace[];
  terminalSessions: RestoreTerminalSession[];
  swarmRuns: RestoreSwarmRun[];
};
```

Debe persistir:

- workspace tabs y workspace activo;
- columnas, splits, panel ids y tamaños;
- cwd por panel;
- renderer solicitado/efectivo;
- initial command;
- terminal id;
- OpenCode session id si existe;
- Hermes session id si aplica;
- swarm role metadata;
- launch id / mission id / run id;
- últimos pids observados;
- última razón de desconexión o error.

### B. Startup Restore Coordinator

Nuevo coordinador al boot de la app:

1. lee manifest;
2. consulta `/api/terminal/sessions`;
3. consulta `/api/swarm/processes`;
4. consulta OpenCode sessions/logs si aplica;
5. consulta `agent_registry`, `agent_runs`, `swarm_missions`;
6. clasifica cada panel:
   - `restore-ready`
   - `reattach-live-terminal`
   - `resume-opencode-session`
   - `process-orphan`
   - `metadata-stale`
   - `quota-blocked`
   - `terminated`
7. abre workspaces/paneles automáticamente;
8. reatacha o relanza sólo si la política lo permite.

### C. Reconciliation Layer para Swarm

Crear un snapshot unificado que mezcle:

```txt
agent_registry
agent_runs / swarm_missions
/api/terminal/sessions
/api/swarm/processes
OpenCode session list / logs
localStorage devhub_agent_runs
restore manifest
```

La topología y Swarm Control deben leer este snapshot reconciliado, no una sola fuente.

### D. Recovery/Debug Center

Agregar una vista/panel de diagnóstico:

- sesiones terminal vivas;
- sockets conectados;
- procesos OpenCode activos;
- procesos huérfanos;
- agentes stale;
- último error por panel;
- links a logs/crash dumps;
- acciones:
  - reattach;
  - resume OpenCode;
  - kill process;
  - limpiar metadata stale;
  - exportar diagnóstico.

---

## Orden recomendado de implementación

### Milestone 1 — Observabilidad y verdad actual

Primero hay que poder explicar exactamente qué pasó.

#### RESUME-SWARM-01 — Crear diagnóstico unificado de runtime

**Objetivo:** endpoint/utility que devuelva un snapshot legible de terminales, procesos, agentes y errores.

**Debe incluir:**

- `/api/terminal/sessions`;
- `/api/swarm/processes`;
- `agent_registry`;
- `agent_runs`;
- `swarm_missions`;
- últimos crash dumps;
- últimos errores relevantes de `terminal-debug.log`, `browser.log` y OpenCode logs;
- detección de `socketCount: 0 && alive: true`;
- detección de OpenCode `429`/quota.

**Criterio de aceptación:**

- un agente puede correr un solo comando/API y obtener “por qué no veo la terminal”.
- el snapshot no muta estado.

#### RESUME-SWARM-02 — Normalizar estados de runtime

**Objetivo:** definir estados canónicos para terminales/agentes/procesos.

Estados mínimos:

- `active`;
- `reattachable`;
- `orphaned-process`;
- `orphaned-terminal`;
- `stale-registry`;
- `quota-blocked`;
- `terminated`;
- `unknown`.

**Criterio de aceptación:**

- topología, procesos activos y paneles terminal usan los mismos estados y labels.

---

### Milestone 2 — Contrato durable de restauración

#### RESUME-SWARM-03 — Diseñar e implementar Restore Manifest

**Objetivo:** persistir un manifiesto versionado y atómico de workspace + terminales + swarm.

**Debe incluir:**

- schema versionado;
- writer debounce;
- escritura atómica;
- migración de versiones futuras;
- tests unitarios de serialización.

**Criterio de aceptación:**

- cerrar/reabrir app no pierde la estructura de workspaces y paneles.

#### RESUME-SWARM-04 — Persistir identidad terminal/panel/agente sin depender de localStorage

**Objetivo:** dejar de depender de mirrors frágiles como única fuente (`devhub_agent_runs`).

**Debe incluir:**

- map durable `panelId -> terminalId -> opencodeSessionId/runId`;
- workspace id;
- project id;
- role metadata;
- createdAt/lastSeenAt;
- last known cwd/command.

**Criterio de aceptación:**

- al recargar UI se puede reconstruir qué panel pertenecía a qué sesión.

---

### Milestone 3 — Reanudación automática

#### RESUME-SWARM-05 — Implementar Startup Restore Coordinator

**Objetivo:** coordinador que restaure workspaces/paneles automáticamente al iniciar la app.

**Debe hacer:**

- cargar manifest;
- abrir workspace activo;
- recrear layout;
- montar paneles;
- decidir reattach/resume/relaunch/noop según snapshot.

**Criterio de aceptación:**

- abrir DevHub después de cerrar ventana reabre el workspace anterior sin comandos manuales.

#### RESUME-SWARM-06 — Reattach de terminales vivas

**Objetivo:** si la PTY sigue viva, reconectar UI/WebSocket sin crear proceso duplicado.

**Casos:**

- `alive: true`, `socketCount: 0`;
- VTE oculto pero lease recuperable;
- xterm fallback reconectable.

**Criterio de aceptación:**

- panel que quedó blanco vuelve a mostrar output o estado honesto.

#### RESUME-SWARM-07 — Resume automático de OpenCode

**Objetivo:** detectar sesiones OpenCode y reanudarlas con `--session` sólo cuando corresponde.

**Debe investigar/implementar:**

- `opencode session list`;
- DB/logs de OpenCode;
- mapeo `opencodeSessionId`;
- detección de prompts/roles;
- política anti-duplicación.

**Criterio de aceptación:**

- si OpenCode tiene sesión resumible, el panel vuelve con esa sesión y no lanza otra copia.

---

### Milestone 4 — Swarm confiable

#### RESUME-SWARM-08 — Reconciliar Swarm topology/control/procesos

**Objetivo:** topología y Swarm Control deben reflejar procesos reales + estado durable.

**Debe corregir:**

- `agent_registry idle` mientras proceso sigue vivo;
- procesos activos sin topology;
- topology fantasma sin proceso;
- cuota 429 como estado visible.

**Criterio de aceptación:**

- si `/api/swarm/processes` ve OpenCode, Swarm CNo hay procesos opencode activos
  ontrol/topology lo clasifica correctamente.

#### RESUME-SWARM-09 — Hacer launch de swarm durable desde el inicio

**Objetivo:** cada launch debe crear registros durables para misión, runs, terminales y procesos.

**Debe incluir:**

- `launchId`;
- `missionId`;
- `runId` por rol;
- `panelId`;
- `terminalId`;
- `pid` si se detecta;
- `agent profile`;
- `model/provider`;
- estado inicial no debe quedar `idle` si el proceso está vivo.

**Criterio de aceptación:**

- después de launch, UI/MCP/DB/procesos coinciden.

#### RESUME-SWARM-10 — Políticas de orphan cleanup/recovery

**Objetivo:** manejar procesos y metadata huérfana sin matar trabajo útil accidentalmente.

**Estados/acciones:**

- reattach;
- resume;
- relaunch;
- mark stale;
- kill safe;
- force kill;
- archive metadata.

**Criterio de aceptación:**

- DevHub puede explicar y resolver un swarm a medias sin reiniciar toda la app.

---

### Milestone 5 — UX, testing y hardening

#### RESUME-SWARM-11 — Restore/Debug Center UI

**Objetivo:** panel visual para operar recuperación y diagnóstico.

**Debe mostrar:**

- workspace restore status;
- terminal sessions;
- OpenCode processes;
- agent registry/runs;
- quota/model errors;
- logs links;
- acciones seguras.

**Criterio de aceptación:**

- usuario no necesita abrir terminal externa para entender qué pasó.

#### RESUME-SWARM-12 — Harness de pruebas E2E de restauración

**Objetivo:** pruebas reproducibles para cerrar la feature.

**Escenarios mínimos:**

1. cerrar/reabrir app con workspace simple;
2. cerrar/reabrir con 5 paneles swarm;
3. terminal viva con `socketCount: 0`;
4. OpenCode bloqueado por cuota 429;
5. proceso OpenCode vivo pero registry stale;
6. VTE hidden/restore;
7. kill de un worker y reclassify en topology.

**Criterio de aceptación:**

- cada bug report genera un evidence pack automatizado.

---

## Riesgos

### Riesgo 1 — Duplicar sesiones OpenCode

Mitigación:

- nunca relanzar si existe pid/session compatible;
- preferir reattach/resume;
- usar lock por `panelId/runId`.

### Riesgo 2 — Matar trabajo vivo por cleanup agresivo

Mitigación:

- separar `stale metadata` de `process dead`;
- acciones destructivas requieren confirmación;
- cleanup automático sólo para metadata claramente obsoleta.

### Riesgo 3 — GTK/VTE y xterm corriendo juntos

Mitigación:

- avanzar en separación de runtime activo del plan TERM;
- tests de que un panel no bootée doble runtime salvo fallback.

### Riesgo 4 — Topología optimista/fantasma

Mitigación:

- topology debe leer reconciled snapshot;
- TTL + evidencia de proceso/sesión;
- status `unknown/stale` visible.

---

## Entregable final esperado

Al completar este plan:

1. DevHub abre y restaura el último workspace automáticamente.
2. Terminales vivas se reatan sin comandos.
3. OpenCode se reanuda con sesión cuando existe.
4. Swarm Control y topology reflejan procesos reales.
5. Estados bloqueados por cuota/modelo se ven como tales.
6. El usuario tiene un Debug/Restore Center para resolver casos raros.
7. Existe harness E2E para no volver a romper restore/swarm sin evidencia.

---
Fecha de Modificación: 18 de mayo de 2026
Estado: PARCIAL — SW-2.1A congelado para control plane de workspaces
Owner: DevHub
Relacionado:
  - docs/08_Enjambre_Agentes_y_Orquestacion.md
  - docs/13_Swarm_Autonomo_v2.md
  - docs/13_Telegram_LLM_Bridge.md
  - docs/review/MODULO-06-telegram-bot.md
  - docs/review/MODULO-07-mcp-server.md
  - devhub-mcp/AGENT-FLOW.md
---

# 23 Swarm Workspace — Intención, Estado Actual y Roadmap

## Resumen ejecutivo

La próxima dirección fuerte de DevHub debe ser **Swarm Workspace**: una capa de trabajo multi-agente donde DevHub no sólo liste tareas o muestre MCPs, sino que actúe como centro operacional para planificar, asignar, ejecutar, auditar y documentar trabajo real entre agentes.

Regla confirmada para esta etapa de documentación:

- Reuse existing SDD subagents/skills as worker capabilities and workflow phases.
- Do NOT reuse the current OpenCode SDD orchestrator as the persistent Swarm supervisor/control-plane.
- El supervisor/control plane de Swarm debe ser **DevHub-owned and long-lived**, con leases, claim tokens, workspaces, runs/artifacts, recovery y un loop propio de supervisión.

La intención nace de comparar el estado actual de DevHub con herramientas tipo **Hermes Workspace**: esas herramientas demuestran bien el valor de un workspace donde los agentes tienen contexto, estado, trazas y coordinación. DevHub debe tomar esa idea como referencia conceptual, pero adaptarla a su rol propio:

```txt
Engram       = memoria duradera, contexto histórico, decisiones y aprendizajes
Graphify     = grafo estructural de código/documentos para exploración
DevHub MCP   = estado operacional: proyectos, roadmap, tareas, cola, agentes
DevHub Swarm = ejecución multi-agente controlada, auditable y visible en UI
```

La meta NO es copiar Hermes Workspace 1:1. La meta es que DevHub se convierta en el **hub de planificación + ejecución + seguimiento** para múltiples agentes y clientes como HermesAgent, OpenCode, Codex, IDEs y otros.

### Freeze vigente de SW-2.1A

- `agent_workspaces` ya existe como **control plane durable** para identidad, lifecycle y estado observado.
- Baseline seguro congelado: `f814998dd05cb491caf8637bf570dbd74b539090`.
- `observed_dirty='dirty-excluded'` se preserva textual como realidad observada y NO se normaliza a `clean`.
- `cleanup_pending` significa **intención de cleanup**, nunca ejecución Git/worktree dentro de DevHub.
- `devhub_agent_runs` sigue observer-only; no puede convertirse en ownership truth del workspace.
- `SW-2.2 sigue bloqueado` hasta consumir este contrato congelado sin reabrir lifecycle ni ownership.
- `SW-3.1 puede consumir `evidence_ref`` como hook opaco ya congelado, sin redefinir lifecycle.

## Capas canónicas de Swarm Workspace

Para evitar drift entre SW-1.3 y SW-4.1, DevHub debe distinguir SIEMPRE estas capas:

| Capa                               | Qué es                                                                 | Ejemplos                                                                                                      | Qué NO es                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| workflow phase                     | fase/metodología de trabajo                                            | `sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive` | no define ownership del swarm ni reemplaza el control plane |
| subagent/execution profile/package | perfil ejecutable o paquete de ejecución que corre una sesión concreta | perfiles OpenCode, headless workers, wrappers de ejecución, paquetes especializados                           | no define por sí solo el rol canónico ni el estado global   |
| skill/capability                   | capacidad reusable que un worker puede cargar                          | `sdd-apply`, `frontend-testing`, `go-testing`, skills de dominio                                              | no es un supervisor, ni una cola, ni un lease               |
| canonical runtime role             | rol operacional estable en el swarm                                    | `supervisor`, `planner`, `implementer`, `reviewer`, `qa`, `docs`, `researcher`                                | no equivale a una skill ni a un comando slash               |
| runtime state                      | estado vivo observado por el control plane                             | `idle`, `claiming`, `working`, `blocked`, `reviewing`, `failed`, `done`, `stale`                              | no describe capacidades ni fases metodológicas              |

Consecuencia práctica:

- Un mismo worker puede ejecutar distintas workflow phase.
- Un mismo execution profile puede cargar distintas skills/capabilities.
- El rol runtime lo asigna el Swarm control plane de DevHub.
- El runtime state lo persiste DevHub según heartbeats, leases, claims y outcomes.

### Regla de ownership del supervisor

**Do NOT reuse the current OpenCode SDD orchestrator as the persistent Swarm supervisor/control-plane.**

Sí se deben **reusar los assets SDD existentes** cuando aportan valor: fases, prompts, skills, subagents y perfiles de ejecución. Pero ese reuso debe ocurrir como **worker capabilities** dentro del Swarm, no como sustituto del supervisor durable.

En otras palabras:

- OpenCode/SDD aporta ejecución especializada.
- DevHub Swarm aporta leases, claim tokens, workspaces, runs/artifacts, recovery y políticas.
- El supervisor persistente vive del lado DevHub, no en un orchestrator efímero de OpenCode.

### Uso práctico de SDD dentro de Swarm

La dirección correcta para SW-1.3 y SW-4.1 es:

1. **reusar** fases/workflows SDD como secuencias especializadas de trabajo;
2. **reusar** subagents/perfiles OpenCode como paquetes de ejecución para workers;
3. **reusar** skills como capacidades cargables por rol o tarea;
4. conectar todo eso mediante **adapters/wrappers** cuando haga falta traducir contrato, contexto o artifacts;
5. **sin copiar ni reinventar upstream si es evitable**.

Esto permite que un `implementer` ejecute `sdd-apply`, que un `reviewer` ejecute `sdd-verify`, o que un `researcher` use `sdd-explore`, mientras el `supervisor` sigue siendo un proceso/control plane durable de DevHub.

---

## Estado actual honesto

> Importante: la documentación histórica marca varias fases como completadas, pero eso no debe interpretarse como estado real verificado de producto. Varias piezas existen parcialmente, están desalineadas o quedaron como prototipos.

### 1. DevHub MCP

Estado actual: **base funcional fortalecida, pero integración de producto incompleta**.

Hecho recientemente:

- MCP local-first con SQLite.
- Catálogo actual de 23 tools.
- Tests de integración reales vía stdio.
- Smoke test de catálogo y dashboard.
- Instalación en Codex, OpenCode, Hermes, Kiro, Windsurf, Trae y otros clientes.
- Instrucciones globales para que los agentes sepan cuándo usar DevHub MCP.

Pendiente / deuda:

- La UI interna que muestra MCPs/conexiones está parcialmente desalineada con el MCP real.
- Falta un `mcp:doctor` o verificador visual que valide por cliente: path, Node correcto, tools descubiertas y DB usada.
- Falta decidir qué tools son core, experimentales o legacy.
- Falta un registro claro de versión/contrato del MCP para evitar confusión entre 19 tools base y extensiones nuevas.

### 2. Swarm actual

Estado actual: **conceptualmente documentado, parcialmente implementado, no confiable como sistema autónomo completo**.

Existe o existió:

- `agent_registry`.
- Heartbeats de agentes.
- Tools como `register_agent`, `heartbeat_agent`, `update_agent_status`, `unregister_agent`.
- Cola/claim inicial con `get_execution_queue` y `claim_next_task`.
- UI histórica de Swarm Control.
- Documentos de Swarm v2.

Problemas:

- No hay garantía fuerte de leases: si un agente muere, una tarea puede quedar en estado inconsistente.
- No hay aislamiento formal por workspace/branch/worktree por agente.
- No hay modelo de artifacts por ejecución.
- No hay supervisor loop robusto.
- No hay contrato unificado entre UI, MCP y agentes externos.
- La documentación vieja marca Swarm v2 como completado, pero el estado real debe tratarse como **necesita auditoría y refactor**.

### 3. Telegram bot / chatbot antiguo

Estado actual: **módulo a refactorizar o rehacer, no usar como base confiable sin auditoría**.

Hallazgos ya documentados en `docs/review/MODULO-06-telegram-bot.md`:

- Telegram bot tuvo partes funcionales y partes a medias.
- El chatbot/LLM Bridge anterior quedó deprecated o desalineado.
- Hay deuda de seguridad y bugs históricos, incluyendo token expuesto reportado en revisión, duplicaciones y conexiones DB inconsistentes.
- Hay overlap de comandos y conceptos.

Intención:

- No seguir construyendo Swarm Workspace sobre el Telegram bot actual tal como está.
- Tratar Telegram como **adaptador/canal externo** encima de DevHub Swarm, no como centro de orquestación.
- Rehacer o refactorizar el bot después de estabilizar el contrato Swarm Workspace.

### 4. MCPs visibles dentro de la aplicación

Estado actual: **feature parcialmente implementada**.

Problemas:

- Lo que la UI muestra como MCP/conexiones puede no coincidir con lo que realmente está instalado en los clientes.
- Falta health-check real por MCP.
- Falta distinguir:
  - MCP local de DevHub.
  - MCPs externos instalados en clientes.
  - tools disponibles realmente en runtime.
  - presets/configs guardados.

Intención:

- Convertir la pantalla de MCPs en un **MCP Control Center** real.
- Mostrar estado verificado, no sólo configuración guardada.
- Exponer acciones seguras: copiar config, test connection, list tools, smoke test, doctor.

---

## Principios de diseño para Swarm Workspace

### 1. DevHub no debe ser sólo UI

DevHub debe ser el sistema de registro operacional:

- qué proyecto existe;
- qué roadmap sigue;
- qué tareas están disponibles;
- qué agente tomó qué;
- qué workspace/branch usa;
- qué pruebas corrió;
- qué artifacts generó;
- qué quedó bloqueado;
- qué decisión debe guardarse en Engram.

### 2. Engram y DevHub no compiten

Engram no debe reemplazar DevHub MCP.

- Engram guarda memoria transversal, aprendizajes, decisiones y contexto histórico.
- DevHub guarda estado vivo de planificación/ejecución.

Regla:

```txt
Si es aprendizaje durable → Engram.
Si es avance operativo de proyecto/tarea → DevHub MCP.
Si es estructura del código o grafo de dependencias → Graphify.
```

### 3. Swarm Workspace debe ser auditable

Cada ejecución de agente debe dejar rastro:

- agente;
- modelo;
- tarea;
- workspace path;
- branch/worktree;
- comandos relevantes;
- archivos modificados;
- tests ejecutados;
- resultado;
- errores;
- artifacts;
- revisión QA.

### 4. No hay autonomía sin recuperación

Un swarm serio necesita tolerar fallos:

- agente muerto;
- timeout;
- tarea bloqueada;
- conflicto de archivos;
- test fallido;
- MCP no disponible;
- workspace corrupto;
- branch con conflicto.

Si no hay leases, retries y liberación de tareas, no hay Swarm Workspace; hay sólo “spawn de agentes”.

---

## Roadmap propuesto

## Fase SW-0 — Auditoría y alineación de realidad

Objetivo: separar lo real de lo documentado.

Tareas:

- Auditar UI actual de Swarm Control.
- Auditar Telegram bot/chatbot antiguo.
- Auditar pantalla de MCPs/conexiones dentro de DevHub.
- Auditar tools MCP actuales y documentar contrato real.
- Marcar docs viejas como `histórico`, `vigente`, `parcial` o `obsoleto`.
- Crear matriz de features: `existe`, `funciona`, `testeado`, `conectado a UI`, `documentado`.

Resultado esperado:

- Documento de verdad actual.
- Lista priorizada de refactors.
- Decisión explícita de qué se conserva, qué se rehace y qué se elimina.

---

## Fase SW-1 — Swarm Core robusto

Objetivo: convertir `agent_registry` + tareas en un sistema confiable.

Tareas:

- Agregar leases de tareas:
  - `claimed_at`;
  - `lease_expires_at`;
  - `claimed_by`;
  - `claim_token`.
- Implementar `release_task`.
- Implementar `renew_task_lease`.
- Reconciliador de agentes muertos:
  - detecta heartbeat vencido;
  - libera tarea;
  - registra evento.
- Roles de agente:
  - `planner`;
  - `implementer`;
  - `reviewer`;
  - `qa`;
  - `docs`;
  - `researcher`;
  - `supervisor`.
- Estados formales:
  - `idle`;
  - `claiming`;
  - `working`;
  - `blocked`;
  - `reviewing`;
  - `failed`;
  - `done`;
  - `stale`.

Resultado esperado:

- Ninguna tarea queda “tomada para siempre”.
- Dos agentes no pueden reclamar la misma tarea.
- El estado del swarm se puede reconstruir desde DB/eventos.

---

## Fase SW-2 — Workspace Execution

Objetivo: aislar el trabajo de cada agente.

Tareas:

- Definir tabla/entidad `agent_workspaces`.
- Asignar workspace por tarea/agente.
- Soportar estrategia:
  - branch única;
  - git worktree;
  - carpeta temporal;
  - workspace persistente.
- Guardar metadata:
  - `workspace_path`;
  - `branch_name`;
  - `base_branch`;
  - `created_at`;
  - `cleanup_policy`;
  - `status`.
- Crear tool MCP `prepare_agent_workspace`.
- Crear tool MCP `finalize_agent_workspace`.
- Detectar conflictos por archivos tocados.

Resultado esperado:

- Cada agente trabaja aislado.
- DevHub sabe dónde está el trabajo.
- La UI puede abrir/ver el workspace asociado.

### Estado real después de SW-2.1A

- La reserva durable vive en `agent_workspaces` con estados `planned`, `provisioning`, `ready`, `active`, `paused`, `conflicted`, `cleanup_pending`, `completed`, `failed`, `orphaned`.
- `workspace_path` es lógico (`workspace://...`); `worktree_path` lo reporta el ejecutor.
- Las colisiones por `branch_name`, `worktree_path` o ownership activo deben terminar en `conflicted` con `last_error` explícito.
- Las pérdidas de ownership deben terminar en `orphaned` preservando el último estado observado.
- El paso `cleanup_pending -> completed|failed` debe preservar metadata histórica, no reciclar filas terminales.

---

## Fase SW-3 — Artifacts, logs y trazas

Objetivo: que cada ejecución sea revisable.

Tareas:

- Crear entidad `agent_runs`.
- Crear entidad `agent_artifacts`.
- Guardar:
  - resumen de plan;
  - comandos ejecutados;
  - tests corridos;
  - diff summary;
  - errores;
  - output relevante;
  - links a artifacts.
- Conectar con Engram:
  - decisiones duraderas van a Engram;
  - logs operativos quedan en DevHub.
- Agregar comentarios automáticos a tareas con outcome.

Resultado esperado:

- Cada tarea tiene bitácora.
- QA puede revisar evidencia sin adivinar.
- El usuario puede entender qué hizo cada agente.

---

## Fase SW-4 — Supervisor Loop

Objetivo: un coordinador que administre el swarm.

Tareas:

- Crear rol `supervisor`.
- Implementar loop:
  - leer dashboard;
  - revisar cola;
  - asignar tareas;
  - detectar bloqueos;
  - pedir QA;
  - reintentar o escalar al humano.
- Políticas:
  - max agentes concurrentes;
  - max retries;
  - cutoff por riesgo;
  - requiere aprobación humana para merge/destructivo.
- Integrar con `get_execution_queue` y `claim_next_task`.

Resultado esperado:

- DevHub puede coordinar trabajo multi-agente sin que el humano micro-administre cada paso.
- Las acciones peligrosas siguen requiriendo aprobación explícita.

---

## Fase SW-5 — UI Swarm Workspace

Objetivo: que el humano tenga una sala de control real.

Tareas:

- Rediseñar Swarm Control como “Workspace Control Room”.
- Mostrar:
  - agentes vivos;
  - tareas reclamadas;
  - leases;
  - workspaces;
  - branches;
  - artifacts;
  - errores;
  - cola próxima;
  - bloqueos.
- Panel de tarea:
  - descripción;
  - contexto;
  - agente asignado;
  - workspace;
  - logs;
  - diff;
  - QA.
- Acciones humanas:
  - pause swarm;
  - resume;
  - kill agent;
  - release task;
  - approve/reject;
  - open workspace.

Resultado esperado:

- El usuario ve el swarm como sistema vivo, no como lista estática.

---

## Fase SW-6 — Canales externos: Telegram y otros

Objetivo: reintroducir Telegram como canal encima del sistema nuevo.

Tareas:

- Definir contrato de canal externo.
- Rehacer Telegram bot como adapter:
  - consulta DevHub;
  - crea tareas;
  - reporta estado;
  - dispara acciones permitidas;
  - nunca decide por encima del Swarm Supervisor.
- Eliminar o aislar LLM Bridge viejo/deprecated.
- Corregir seguridad:
  - tokens rotados;
  - auth fuerte;
  - allowlist obligatoria;
  - no secrets en repo.
- Unificar comandos.

Resultado esperado:

- Telegram vuelve como interfaz útil, no como núcleo frágil.

---

## Fase SW-7 — MCP Control Center

Objetivo: arreglar la experiencia de MCPs dentro de DevHub.

Tareas:

- Mostrar MCPs instalados/configurados por cliente.
- Test connection real.
- List tools real.
- Smoke test por MCP.
- Doctor de paths, Node, permisos y DB.
- Distinguir `DevHub MCP`, `Engram MCP`, `Graphify`, y otros.
- Exportar snippets para:
  - Codex;
  - OpenCode;
  - Hermes;
  - VS Code;
  - Windsurf;
  - Kiro;
  - Trae.

Resultado esperado:

- La pantalla MCP deja de ser “config parcial” y pasa a ser diagnóstico real.

---

## Decisiones de intención

1. **Swarm Workspace es el próximo eje estratégico de DevHub.**
2. **Hermes Workspace es referencia conceptual, no blueprint obligatorio.**
3. **Telegram bot debe considerarse canal externo a rehacer/refactorizar, no núcleo del sistema.**
4. **La UI de MCPs debe rehacerse como MCP Control Center verificable.**
5. **La documentación vieja que marca fases como completadas debe auditarse contra código real.**
6. **DevHub MCP debe mantener contrato versionado de tools: base, extendidas y experimentales.**
7. **Engram, DevHub MCP y Graphify deben coexistir por responsabilidad, no competir.**

---

## Primer backlog sugerido

| ID       | Título                                                       | Prioridad | Tipo         |
| -------- | ------------------------------------------------------------ | --------- | ------------ |
| `SW-0.1` | Auditoría de realidad Swarm/UI/MCP/Telegram                  | critical  | discovery    |
| `SW-0.2` | Matriz de docs vigentes/parciales/obsoletas                  | high      | docs         |
| `SW-1.1` | Diseño de leases de tareas y recuperación de agentes muertos | critical  | architecture |
| `SW-1.2` | Implementar `release_task` y `renew_task_lease` en MCP       | critical  | mcp          |
| `SW-1.3` | Roles y estados formales de agentes                          | high      | db/mcp       |
| `SW-2.1` | Diseño de `agent_workspaces` y estrategia branch/worktree    | critical  | architecture |
| `SW-2.2` | Tool `prepare_agent_workspace`                               | high      | mcp          |
| `SW-3.1` | Modelo `agent_runs` + `agent_artifacts`                      | high      | db           |
| `SW-4.1` | Diseño de Supervisor Loop                                    | high      | architecture |
| `SW-5.1` | Rediseño UI Swarm Workspace Control Room                     | medium    | ui           |
| `SW-6.1` | Plan de refactor Telegram como adapter externo               | high      | refactor     |
| `SW-7.1` | MCP Control Center con doctor/list-tools/smoke               | high      | ui/mcp       |

---

## Nota para futuros agentes

Antes de implementar cualquiera de estas fases:

1. Revisar Engram para contexto histórico.
2. Leer este documento completo.
3. Verificar el estado real del código, no asumir que las docs viejas están correctas.
4. Usar DevHub MCP para crear/actualizar tareas operativas.
5. Guardar decisiones duraderas en Engram.
6. No revivir Telegram ni el LLM Bridge viejo sin auditoría de seguridad.

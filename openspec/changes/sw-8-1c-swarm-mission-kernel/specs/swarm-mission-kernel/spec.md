# Swarm Mission Kernel Specification

## Propósito

Definir un kernel durable mínimo para coordinación de swarm en DevHub. Una `mission` es un contexto de coordinación auditable entre agentes; NO es terminal, sesión, workspace, run, supervisor ni transcript.

## Decisiones canónicas

- Naming MUST usar: `swarm_missions`, `mission_participants`, `mission_messages`, `message_deliveries`, `agent_presence`.
- `swarm_missions` MUST anclar `project_id`; `task_id`, `workspace_id`, `run_id` y `approval_checkpoint_key` MAY existir solo como refs.
- `mission_messages` y `message_deliveries` MUST retenerse hasta archive/purga explícita; logs crudos quedan fuera y sólo entran por `evidence_ref`.
- `agent_presence` MUST expirar lógicamente a los 120 segundos sin heartbeat.
- `message_deliveries` MUST usar `pending`, `sent`, `failed`, `retry_pending`, `expired`.
- Durable: misión, membresía, intención de mensaje, receipts, presencia compacta, refs. Runtime-only: terminales, sessionStore, SSE, PTY, logs, adapters y apertura de ventanas.
- SW-8.1C SHALL NOT implementar UI final, delivery real OpenCode, adapters Codex/Claude, terminal opening ni dispatch avanzado.
- `agent_teams`/`team_members` del read-model actual SHALL NOT ser schema canónico en esta fase.
- `mission_participants` SHALL NOT mezclar `profile_key`, `runtime_role`, `workflow_phase`, `provider` ni `runtime_package` como identidad canónica.

## Requirements

### Requirement: Misión y participantes canónicos

El sistema MUST persistir `swarm_missions` como contenedor durable de coordinación y `mission_participants` como membresía scoped a esa misión. La misión SHALL referenciar project/task/workspace/run sin apropiarse de su verdad. Los participantes MUST representar agentes concretos y permisos de misión, no convertir a todos en orchestrators.

#### Scenario: Crear mission con team inicial

- GIVEN un project y un conjunto inicial de agentes
- WHEN DevHub crea una mission
- THEN persiste una fila en `swarm_missions` y una o más filas en `mission_participants`
- AND la mission guarda refs opcionales a `task_id`, `workspace_id` y `run_id` sin duplicar su estado

#### Scenario: Agregar participant

- GIVEN una mission existente
- WHEN Director agrega un agente nuevo
- THEN se crea una nueva membresía en `mission_participants`
- AND la identidad del agente queda separada de profile/runtime/provider metadata

### Requirement: Mensajes durables y receipts de delivery

El sistema MUST persistir en `mission_messages` la intención resumida de cada mensaje relevante y en `message_deliveries` los receipts por destino o adapter. `mission_messages` SHALL NOT almacenar terminal logs ni transcripts completos. `message_deliveries` MUST registrar sólo estado, destino, timestamps, error resumido y `evidence_ref` opcional.

#### Scenario: Registrar message intent

- GIVEN una mission activa
- WHEN un actor emite una instrucción o handoff relevante
- THEN DevHub guarda un `mission_messages` durable con summary compacto y refs asociadas
- AND el contenido no depende de SSE, PTY ni sessionStore

#### Scenario: Registrar delivery receipt

- GIVEN un mensaje durable existente
- WHEN un adapter reporta resultado de entrega
- THEN DevHub guarda o actualiza `message_deliveries` con estado `pending`, `sent`, `failed`, `retry_pending` o `expired`
- AND el receipt no reemplaza el mensaje original

### Requirement: Presencia con TTL y snapshot compacto

El sistema MUST mantener `agent_presence` como estado compacto por agente/misión con `last_seen_at`, `presence_state`, refs operativas y TTL de 120 segundos. Director MUST poder leer un snapshot compacto con mission, participantes, último mensaje útil, deliveries pendientes, presencias activas y refs a task/workspace/run/evidence.

#### Scenario: Actualizar presence con TTL

- GIVEN un participante con heartbeat vigente
- WHEN DevHub recibe actualización de presencia
- THEN actualiza `agent_presence.last_seen_at` y su estado compacto
- AND al superar 120 segundos sin heartbeat la presencia pasa a expirada/stale sin inventar actividad

#### Scenario: Snapshot compacto para Director

- GIVEN una mission con mensajes, deliveries y presencia
- WHEN Director consulta estado
- THEN recibe un snapshot resumido y auditable
- AND no necesita releer logs completos ni terminal buffers

### Requirement: Frontera durable y no duplicación

El sistema MUST usar `agent_workspaces`, `agent_runs`, `agent_artifacts` y `supervisor_approval_checkpoints` como fuentes canónicas de ejecución, evidencia y approval. Mission kernel MAY apuntar a esos IDs, pero SHALL NOT duplicar branch state, run provenance, artifact chronology ni approval truth. Terminal logs, SSE, session APIs y sessionStore SHALL NOT ser source of truth durable.

#### Scenario: No duplicar workspace/run/artifact truth

- GIVEN una mission enlazada a workspace, run y artifacts
- WHEN un consumer consulta la mission
- THEN obtiene refs y snapshot compacto
- AND debe leer las tablas canónicas para branch state, provenance y evidencia detallada

#### Scenario: No usar terminal logs como source of truth

- GIVEN un runtime con logs o transcript local
- WHEN DevHub consolida la mission
- THEN persiste sólo summary, delivery, presence y `evidence_ref`
- AND rechaza promover logs/session state a verdad durable

## Plan de tests esperado

- **Unit / DB schema:** validar naming, enums de `message_deliveries`, TTL de `agent_presence`, reglas de no mezclar metadata operativa en `mission_participants`.
- **Unit / selectors:** snapshot compacto del Director con mission + participants + latest message + pending deliveries + active presence.
- **Integration / persistence:** crear mission inicial, agregar participant, registrar message intent, registrar delivery receipt, actualizar presence y expirar TTL.
- **Integration / boundaries:** asegurar que mission sólo referencia `agent_workspaces`, `agent_runs`, `agent_artifacts`, `supervisor_approval_checkpoints`; nunca duplica campos de branch/head/provenance.
- **Integration / security:** rechazar payloads que intenten persistir terminal logs, session IDs efímeros o mezcla de `profile_key/runtime_role/provider` como identidad canónica.
- **Contract / MCP future:** tools futuras MUST devolver snapshots compactos y receipts resumidos, no transcripts completos.

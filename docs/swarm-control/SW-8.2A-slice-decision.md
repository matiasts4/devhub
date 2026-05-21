# SW-8.2A — Slice decision

## Estado

- Slice: `SW-8.2A`
- Tipo: `doc-only`
- Carácter: **decisión autoritativa de convergencia**
- Repo: `/home/matias/ArxonLabs/devhub`
- Implementación incluida: **no**

## Objetivo

Resolver la tensión entre:

- `docs/swarm-control/SW-8.2A-schema-proposal.md`
- `docs/swarm-control/SW-8.2A-tdd-plan.md`
- `docs/swarm-control/SW-8.2A-file-map.md`

y fijar, sin ambigüedad, cuál es el **primer slice localDb-first autoritativo**.

La decisión de este documento es simple:

> **Primer slice SW-8.2A = DDL + constraints + tests. Nada más.**

## Evidencia de la tensión actual

| Fuente                               | Qué empuja                                                                                                                              | Problema                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `SW-8.2A-schema-proposal.md:335-439` | El apéndice “primer slice mínimo” todavía incluye helpers locales, seeds, backfill y `resolveAgentExecutionContract(...)`.              | Agranda el slice antes de congelar el schema canónico.               |
| `SW-8.2A-tdd-plan.md:5-13`           | Define que el primer ciclo nace en `src/lib/db/localDb.js` y `src/lib/db/localDb.test.js`, sin MCP, read-model, UI ni adapters runtime. | Es más chico y más seguro que el apéndice del schema proposal.       |
| `SW-8.2A-tdd-plan.md:120-154`        | El primer GREEN permitido es solo DDL en `ensureRuntimeSchema(db)` + constraints mínimas necesarias para poner en verde los RED.        | Choca con la idea de meter helpers/seeds/resolver en el mismo corte. |
| `SW-8.2A-tdd-plan.md:194-210`        | Deja explícitamente afuera MCP, `swarmControl`, snapshots, UI, adapters, terminales, logs, seeds complejos, backfill y resolver.        | Confirma que el primer slice no puede abrir superficies derivadas.   |
| `SW-8.2A-file-map.md:50-89`          | Sugiere que el primer PR seguro podría incluir `devhub-mcp/server.js` y tests de integración MCP.                                       | Eso ya no es el slice mínimo TDD. Es el slice siguiente.             |

## Guardrails que NO se negocian

Estos boundaries ya están fijados por el repo y siguen vigentes:

- DevHub sigue siendo durable control plane; no se duplica supervisor ni ownership en OpenCode/AgentHub. Evidencia: `docs/swarm-control/SW-8.0B-mapa-orquestadores-sdd.md:319-337`.
- Logs, terminales, SSE, session ids y runtime traces no pueden pasar a verdad durable. Evidencia: `docs/swarm-control/SW-8.0B-mapa-orquestadores-sdd.md:319-327`, `src/lib/db/localDb.js:103-117`.
- La capa de misiones ya rechaza metadata canónica de identidad (`profile_key`, `runtime_role`, `workflow_phase`, `provider`, `runtime_package`). Evidencia: `src/lib/db/localDb.js:96-102,1421-1428`, `src/lib/db/localDb.test.js:1198-1207`.
- `agent_registry` actual es liveness legacy, no catálogo canónico. Evidencia: `devhub-mcp/server.js:3824-3888`, `src/hooks/useAgentRegistryPolling.js:1-9,56-66`.

## Decisión autoritativa

### Regla de precedencia

Si hay conflicto entre documentos para el **primer slice** de SW-8.2A, manda este orden:

1. `docs/swarm-control/SW-8.2A-slice-decision.md`
2. `docs/swarm-control/SW-8.2A-tdd-plan.md`
3. `docs/swarm-control/SW-8.2A-schema-proposal.md`
4. `docs/swarm-control/SW-8.2A-file-map.md`

Interpretación correcta:

- `SW-8.2A-schema-proposal.md` describe el **target architecture**.
- `SW-8.2A-file-map.md` describe el **camino de expansión**.
- `SW-8.2A-tdd-plan.md` y esta nota definen el **primer corte ejecutable**.

### Primer slice localDb-first autorizado

El primer slice permitido toca solo:

- `src/lib/db/localDb.test.js`
- `src/lib/db/localDb.js`

Y hace solo esto:

1. define RED en tests;
2. agrega DDL en `ensureRuntimeSchema(db)`;
3. agrega constraints/índices mínimos necesarios para poner esos tests en verde.

No hay permiso para abrir superficies nuevas fuera de ese corte.

## Alcance exacto del primer slice

### Sí entra

#### Tablas nuevas

1. `agent_profiles`
2. `registered_agents`
3. `workflow_phases`
4. `capabilities`
5. `profile_capability_bindings`
6. `profile_phase_bindings`

#### Constraints mínimas esperadas

- `agent_profiles` debe impedir colapso semántico entre `runtime_role` y `profile_key`.
- `workflow_phases` debe impedir slash commands como identidad de fase (`/sdd-design`, etc.).
- `profile_capability_bindings` debe tener `UNIQUE(profile_key, capability_key)`.
- `profile_phase_bindings` debe tener `UNIQUE(profile_key, phase_key)`.
- Los bindings deben referenciar FKs válidas.
- `registered_agents` debe mantenerse libre de columnas de liveness/runtime (`last_heartbeat`, `current_task_id`, `session_id`, `terminal_id`, `workspace_id`, `run_id`).
- Las tablas nuevas no deben absorber campos runtime-only (`terminal_log`, `logs`, `transcript`, `stdout`, `stderr`, `tool_output`, `raw_output`).

#### Tests mínimos del primer RED/GREEN

1. existencia de las seis tablas;
2. separación dura entre `registered_agents` y liveness legacy;
3. constraints de identidad y bindings;
4. guardrail contra runtime-only durability y contra contaminación accidental de mission metadata.

## Qué queda explícitamente diferido

### Diferido dentro de SW-8.2A, pero fuera del primer slice

- helpers CRUD nuevos;
- wrappers `tables.*` nuevos en `src/lib/db/localDb.js`;
- exports nuevos en `module.exports` para el registry canónico;
- `tableOps` públicos nuevos;
- seeds del catálogo base;
- backfill desde `agent_registry`;
- `resolveAgentExecutionContract({ agent_id, phase_key })`.

### Diferido a MCP

- cambios en `devhub-mcp/server.js`;
- tools nuevas del registry;
- `devhub-mcp/tests/integration/tools-list.test.js` para este tema;
- cualquier enforcement operacional del registry desde MCP.

### Diferido a read-model / proyección

- cambios en `src/lib/operations/swarmControl.js`;
- cambios en `src/lib/operations/__tests__/swarmControl.test.js`;
- cambios en `src/lib/operations/__tests__/fixtures/controlRoomSnapshot.js`;
- joins del registry nuevo dentro de snapshots de misión, Control Room, Telegram o MCP overlays.

### Diferido a runtime adapter

- payload builder final para OpenCode/AgentHub;
- selección efectiva de `provider` / `app` / `runtime_package` en runtime;
- cualquier binding con terminal/session ids, attach/focus/restore o telemetry viva.

### Diferido por boundary

- cambios en `agent_registry` como source of truth;
- cambios en `swarm_missions`, `mission_participants`, `mission_messages`, `message_deliveries`, `agent_presence`;
- cambios en `agent_workspaces`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots`, `supervisor_approval_checkpoints`.

## Reinterpretación explícita de los otros docs

### Sobre `SW-8.2A-schema-proposal.md`

El contrato amplio sigue siendo válido como **norte de arquitectura**, pero para el primer slice hay que reinterpretar así:

- `seedDefaultAgentRegistryCatalog()` → **deferido**
- `backfillRegisteredAgentsFromLegacyAgentRegistry(...)` → **deferido**
- `resolveAgentExecutionContract(...)` → **deferido**
- helpers de lectura/escritura → **deferidos**

Esos items no desaparecen. Solo dejan de pertenecer al primer corte.

### Sobre `SW-8.2A-file-map.md`

La parte que propone abrir `devhub-mcp/server.js` y tests de integración MCP pasa a leerse así:

- correcto como **slice siguiente**;
- incorrecto como **primer PR localDb-first**.

## Riesgos si el slice se expande antes de tiempo

### Riesgo 1 — split-brain de contrato

Si se toca MCP antes de estabilizar `localDb`, se publica una surface externa sobre un schema todavía no congelado.

Resultado:

- contrato inestable;
- drift entre `localDb` y `devhub-mcp`;
- más costo de corrección después.

### Riesgo 2 — mezclar schema con policy y migración

Si se agregan helpers, seeds, backfill y resolver en el mismo PR, ya no se está testeando “schema mínimo”, sino schema + semántica + migración + resolución.

Resultado:

- RED demasiado grande;
- GREEN difícil de aislar;
- se rompe la disciplina de `strict_tdd`.

### Riesgo 3 — revivir runtime truth

Si entra algo de terminal/session/log/SSE/presence en este slice, se vuelve a mezclar identidad canónica con runtime liveness.

Resultado:

- DevHub deja de ser durable control plane puro;
- vuelve el split-brain entre policy durable y observabilidad runtime.

### Riesgo 4 — contaminar la capa de misión

Si se tocan `mission_participants` o `agent_presence` para meter `profile_key`, `runtime_role`, `provider` o `runtime_package`, se violan guardrails ya congelados por `localDb.js` y `localDb.test.js`.

Resultado:

- coordinación deja de ser read-model bounded;
- aparece una segunda verdad de identidad en la capa equivocada.

### Riesgo 5 — read-model empujando schema hacia abajo

Si se toca `swarmControl` antes del schema canónico, el read-model empieza a dictar la forma del contrato durable.

Resultado:

- arquitectura invertida;
- UI condicionando el core durable;
- más deuda para SW-8.2D.

## Acceptance criteria del primer slice autoritativo

1. El primer RED vive en `src/lib/db/localDb.test.js`.
2. El primer GREEN vive solo en `src/lib/db/localDb.js`.
3. Existen las seis tablas nuevas en `ensureRuntimeSchema(db)`.
4. Existen las constraints mínimas necesarias para los RED definidos.
5. No se agregan helpers CRUD, seeds, backfill ni resolver en este primer corte.
6. No se agregan wrappers `tables.*` ni exports públicos nuevos para el registry canónico en este primer corte.
7. No se toca `devhub-mcp/server.js` ni tests MCP.
8. No se toca `swarmControl` ni ningún read-model/UI.
9. No se toca mission kernel ni control plane operativo.
10. No se introduce ninguna columna runtime-only o de liveness en el registry canónico.
11. El resultado deja a SW-8.2A listo para un segundo slice más chico y seguro: helpers/seeds/backfill/resolver sobre schema ya congelado.

## Siguiente paso correcto después de este slice

Recién cuando el slice mínimo esté verde y estable:

1. helpers locales mínimos;
2. seeds explícitos;
3. backfill conservador;
4. resolver local;
5. MCP bounded;
6. read-model/proyección.

Ese es el orden sano. Cualquier otro orden mete deuda antes de tener piso estructural.

## Decisión final

Para SW-8.2A, el **primer slice localDb-first autoritativo** queda fijado así:

> **`src/lib/db/localDb.test.js` + `src/lib/db/localDb.js`**
>
> **solo DDL + constraints + tests**
>
> **todo lo demás queda diferido**

Eso resuelve la tensión documental y evita expandir el slice antes de tener schema durable real.

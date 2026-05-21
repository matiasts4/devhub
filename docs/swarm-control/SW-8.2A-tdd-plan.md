# SW-8.2A — Plan TDD DOC-ONLY localDb-first

## 1. Objetivo del TDD localDb-first

Definir el primer ciclo TDD para que `SW-8.2A` nazca desde `src/lib/db/localDb.js` como verdad canónica mínima del registry durable, sin abrir todavía surfaces MCP, read-models, UI ni adapters runtime.

El objetivo de este slice NO es “resolver todo el registry”. El objetivo es mucho más chico y correcto:

- fijar primero el **schema canónico mínimo** en `localDb`;
- congelar guardrails con tests en `src/lib/db/localDb.test.js`;
- diferir explícitamente seeds, backfill, resolver de contrato, MCP, snapshots y UI.

Principio rector: **si el schema durable todavía no existe y no falla en rojo, no hay permiso para tocar MCP ni proyecciones**.

## 2. RED exacto

Archivo a tocar en RED: `src/lib/db/localDb.test.js`.

Archivo que tocaría después del primer rojo: `src/lib/db/localDb.js`.

Secuencia exacta:

### RED-1 — tablas canónicas mínimas

Agregar un test con nombre explícito, por ejemplo:

`test('creates SW-8.2A canonical localDb-first registry tables', () => { ... })`

Qué valida:

- existencia de `agent_profiles`;
- existencia de `registered_agents`;
- existencia de `workflow_phases`;
- existencia de `capabilities`;
- existencia de `profile_capability_bindings`;
- existencia de `profile_phase_bindings`.

Qué debe fallar primero:

- `PRAGMA table_info(...)` vacío o tabla inexistente luego de `ensureRuntimeSchema(db)`.

Motivo del rojo:

- hoy `ensureRuntimeSchema()` no crea ese contrato canónico nuevo.

### RED-2 — separación dura entre registry canónico y liveness legacy

Agregar un test focalizado, por ejemplo:

`test('keeps registered_agents free from heartbeat and runtime presence fields', () => { ... })`

Qué valida:

- `registered_agents` NO contiene `last_heartbeat`;
- NO contiene `current_task_id`;
- NO contiene `session_id`, `terminal_id`, `workspace_id`, `run_id`.

Qué debe fallar primero:

- la tabla no existe todavía, o la validación de columnas no puede correr.

Motivo del rojo:

- este test congela desde el inicio que `agent_registry` legacy sigue siendo liveness operacional y NO identidad canónica.

### RED-3 — constraints mínimas de identidad y bindings

Agregar un test, por ejemplo:

`test('enforces SW-8.2A identity and binding constraints in localDb schema', () => { ... })`

Qué valida:

- `agent_profiles.runtime_role` y `agent_profiles.profile_key` no pueden colapsar al mismo valor;
- `workflow_phases.phase_key` no admite slash commands tipo `/sdd-design`;
- `profile_capability_bindings` tiene `UNIQUE(profile_key, capability_key)`;
- `profile_phase_bindings` tiene `UNIQUE(profile_key, phase_key)`;
- los bindings referencian FKs válidas.

Qué debe fallar primero:

- la inserción/control no puede ejecutarse porque las tablas/constraints todavía no existen.

Motivo del rojo:

- congela el boundary semántico antes de cualquier helper o seed.

### RED-4 — guardrail contra metadata runtime-only en este slice

Agregar un test, por ejemplo:

`test('does not allow SW-8.2A canonical schema to absorb runtime-only durability', () => { ... })`

Qué valida:

- las tablas nuevas no introducen `terminal_log`, `logs`, `transcript`, `stdout`, `stderr`, `tool_output`, `raw_output`;
- tampoco absorben `profile_key`/`runtime_role` dentro de tablas de misión existentes por accidente en este slice.

Qué debe fallar primero:

- la parte de tablas nuevas falla por ausencia de schema.

Motivo del rojo:

- evita que el primer GREEN meta ruido runtime o reabra split-brain documental.

### Orden obligatorio del RED

1. RED-1
2. RED-2
3. RED-3
4. RED-4

No agregar en este paso tests de MCP, snapshots, `swarmControl`, UI, seeds automáticos ni backfill. Eso agranda el rojo y rompe `strict_tdd: true`.

## 3. GREEN exacto

Primer slice mínimo permitido, sin implementarlo todavía:

### GREEN-1 — solo DDL canónico en `src/lib/db/localDb.js`

Permiso mínimo:

- extender `ensureRuntimeSchema(db)` para crear únicamente:
  - `agent_profiles`;
  - `registered_agents`;
  - `workflow_phases`;
  - `capabilities`;
  - `profile_capability_bindings`;
  - `profile_phase_bindings`.
- agregar índices/constraints mínimas solo si son necesarias para poner en verde los RED anteriores.

Prohibido en este primer GREEN:

- helpers CRUD nuevos;
- seeds por defecto;
- backfill desde `agent_registry`;
- `resolveAgentExecutionContract(...)`;
- cambios en `devhub-mcp/server.js`;
- cambios en `src/lib/operations/swarmControl.js`;
- cualquier surface UI o AgentHub.

### Orden de implementación posterior permitido, pero diferido

Una vez que GREEN-1 esté estable, el orden correcto sería:

1. helpers locales mínimos de lectura/escritura en `localDb.js`;
2. seed explícito del catálogo base;
3. backfill conservador desde `agent_registry` hacia `registered_agents`;
4. resolver local `agent_id + phase_key`;
5. recién después MCP bounded;
6. recién después proyecciones/read-model.

Si GREEN-1 requiere tocar algo fuera de `localDb.js`, entonces el slice dejó de ser mínimo. Hay que frenarlo.

## 4. Comandos exactos de test

Comandos focalizados para ejecutar CUANDO se habilite implementación; este documento no afirma que hayan corrido:

```bash
npm test -- src/lib/db/localDb.test.js
```

Para iterar un rojo puntual con nombres focalizados:

```bash
node ./node_modules/jest/bin/jest.js --runInBand src/lib/db/localDb.test.js -t "SW-8.2A"
```

Si los nombres de test se dejan como en este plan, conviene prefijarlos con `SW-8.2A` para filtrar rápido sin abrir toda la suite.

## 5. Criterio de checkpoint

Gate obligatorio alineado con `AGENTS.md`:

1. correr `git status --short`;
2. si hubo cambios de archivos, exigir **commit local checkpoint** antes de `completed` o `qa-ready`;
3. dejar comentario `[git:checkpoint]` con:
   - `commit=<sha|none>`
   - docs tocadas
   - checks ejecutados
   - estado del working tree
4. `commit=none` solo vale con **cero cambios de archivos**.

Para este slice, checkpoint correcto significa:

- los RED quedaron definidos primero en `src/lib/db/localDb.test.js`;
- el primer GREEN se limita a `src/lib/db/localDb.js`;
- no se abrió MCP;
- no se abrió UI;
- no se reintrodujo `agent_registry` como source of truth;
- no se mezcló identity policy con runtime/liveness.

## 6. Qué queda fuera de este slice

Queda explícitamente afuera, por ahora:

- `devhub-mcp/server.js` y tools nuevas;
- `devhub-mcp/tests/integration/tools-list.test.js`;
- `src/lib/operations/swarmControl.js` y sus tests/fixtures;
- snapshots/projections de Control Room;
- UI final;
- AgentHub revival;
- runtime adapters y payloads OpenCode/AgentHub;
- terminales, logs, SSE, session ids, traces;
- seeds automáticos complejos;
- backfill legacy;
- `resolveAgentExecutionContract(...)`.

Regla simple: **hasta que el schema canónico mínimo no exista y no esté verde en `localDb`, todo lo demás está fuera de alcance**.

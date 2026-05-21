# SW-8.2A — Checkpoint criteria

## Criterio exacto para cerrar el primer slice `localDb-first`

El primer slice de `SW-8.2A` se puede cerrar solo si quedó dentro del corte autoritativo fijado por `docs/swarm-control/SW-8.2A-slice-decision.md` y `docs/swarm-control/SW-8.2A-tdd-plan.md`:

- archivos tocados: `src/lib/db/localDb.test.js` y `src/lib/db/localDb.js`;
- alcance permitido: RED en tests + GREEN limitado a DDL, constraints e índices mínimos en `ensureRuntimeSchema(db)`;
- alcance prohibido: MCP, `swarmControl`, UI, AgentHub, seeds, backfill, `resolveAgentExecutionContract(...)`, terminal/session/runtime truth.

Si el trabajo toca algo fuera de ese corte, no es cierre del primer slice: ya pasó al slice siguiente.

## Tests mínimos

Los mínimos para dar por válido el slice son estos cuatro focos en `src/lib/db/localDb.test.js`:

1. `creates SW-8.2A canonical localDb-first registry tables`
2. `keeps registered_agents free from heartbeat and runtime presence fields`
3. `enforces SW-8.2A identity and binding constraints in localDb schema`
4. `does not allow SW-8.2A canonical schema to absorb runtime-only durability`

Comandos focalizados esperados:

```bash
node ./node_modules/jest/bin/jest.js --runInBand src/lib/db/localDb.test.js -t "SW-8.2A"
npm test -- src/lib/db/localDb.test.js
```

## Evidencia mínima que debe quedar en DevHub

Debe quedar comentario `[git:checkpoint]` con todo esto, sin omisiones:

- `commit=<sha>` del checkpoint local;
- `git status --short` final;
- archivos tocados;
- tests ejecutados y resultado;
- nota explícita de que el cierre fue `localDb-first` y no abrió MCP, UI ni AgentHub.

`commit=none` no alcanza para cerrar este slice, porque el slice válido implica cambios reales en schema/tests.

## Qué sigue después

Cuando este checkpoint esté verde y trazable, el orden correcto es:

1. helpers locales mínimos, seed explícito, backfill conservador y resolución local sobre `localDb`;
2. recién después MCP bounded y pin de tools;
3. recién después projection/read-model compacta.

La UI final sigue fuera de alcance en esta etapa.

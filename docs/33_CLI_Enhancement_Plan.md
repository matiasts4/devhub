# 33 — CLI Enhancement Status

## Outcome first

La CLI ya expone **20 implemented top-level CLI commands**. La documentación debe tratar esa superficie como actual y ejecutable, no como plan hipotético.

## Current command surface

```text
status, queue, agents, swarm, task, ws, heartbeat, update-status,
claim, release, tell, swarm-launch, auth, events, inbox, presence,
mission, run, worktree, supervisor
```

## Important rule

La registración del agente se documenta como setup runtime o `swarm-launch`, no como comando `devhub register`.

## Deferred CLI parity backlog

Estos temas siguen siendo backlog futuro:

- retrieval/indexing CLI parity
- physical DB split
- explicit worktree manifest
- larger orchestration redesign

## Documentation contract

- Documentar sólo comandos implementados.
- No presentar comandos planeados como shipped.
- Mantener workflow ejecutable con comandos reales.

## Next step

Abrir cambios separados sólo si alguno de los ítems diferidos justifica nueva superficie CLI.

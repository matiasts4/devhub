# DevHub vs Plyrium — matriz de cobertura

Comparación operativa con baseline reality-first.

## Quick path

1. Validá primero la baseline actual de DevHub.
2. Tomá los gaps sólo desde el bloque de backlog diferido.
3. No mezcles backlog futuro con contrato soportado hoy.

## Baseline actual

| Área             | DevHub hoy            | Lectura correcta                   |
| ---------------- | --------------------- | ---------------------------------- |
| MCP público      | 36 tools soportados   | Telegram está fuera de scope MCP   |
| CLI              | 20 comandos top-level | La superficie ejecutable ya existe |
| Runtime Telegram | Interno               | No se cuenta como MCP parity       |

## Matriz principal

| Dominio                           | Baseline Plyrium                           | Estado DevHub         | Estado   |
| --------------------------------- | ------------------------------------------ | --------------------- | -------- |
| CLI base de operaciones           | Sí                                         | Sí                    | Fuerte   |
| Swarm / launch / runtime contract | Sí                                         | Sí                    | Fuerte   |
| Worktrees reales por rol          | Sí                                         | Sí                    | Fuerte   |
| Supervisor / approvals / inbox    | Sí                                         | Sí                    | Fuerte   |
| MCP público de control plane      | No central en Plyrium, pero útil en DevHub | Sí, estable           | Fuerte   |
| Telegram como MCP                 | No necesario para baseline actual          | Removido del contrato | Resuelto |

## Backlog diferido explícito

Los siguientes gaps siguen abiertos como backlog futuro, no como falla del baseline actual:

- retrieval/indexing CLI parity
- physical DB split
- explicit worktree manifest
- larger orchestration redesign

## Regla de paridad

- Si algo ya está shippeado en MCP/CLI, NO se vuelve a listar como gap.
- Si algo no está shippeado pero se decidió posponer, entra en backlog diferido.
- Telegram MCP no vuelve a entrar en la matriz salvo nuevo cambio explícito de contrato.

## Recomendación

Si querés seguir acercando DevHub a Plyrium, abrí cambios separados por cada ítem del backlog diferido.

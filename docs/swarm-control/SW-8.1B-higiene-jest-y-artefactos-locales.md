---
title: SW-8.1B — Higiene de Jest y política de artefactos locales
status: draft
updated_at: 2026-05-19
owner: DevHub
---

# SW-8.1B — Higiene de Jest y política de artefactos locales

## Objetivo

Cerrar dos fuentes de ruido sin expandir alcance:

1. evitar que Jest descubra suites duplicadas bajo `.plyrium-forge/worktrees/`;
2. fijar qué artefactos locales del runtime se versionan y cuáles NO.

## Decisiones

### `docs/swarm-control/`

- `docs/swarm-control/` se conserva y se versiona.
- La documentación es evidencia durable del contrato operativo y no depende del estado local de herramientas.
- docs/swarm-control/ se conserva y se versiona.

### `.claude/`

- `.claude/` es tool-local y no se commitea.
- Contiene estado local de confianza/configuración de la herramienta, no verdad canónica del producto.
- .claude/ es tool-local y no se commitea.

### `.plyrium-forge/`

- `.plyrium-forge/` es tool-local y no se commitea.
- Incluye worktrees, bases locales, memoria y otros artefactos efímeros del runtime.
- En esta política NO se deja excepción para `.plyrium-forge/opencode-role.md`.
- Si más adelante hiciera falta versionar una política operativa estable, debe moverse a `docs/swarm-control/` o a una ubicación repo-canónica explícita, sin convertir un runtime local en source of truth.
- .plyrium-forge/ es tool-local y no se commitea.

### `opencode.json`

- `opencode.json` se evalúa como config local de runtime y no source of truth.
- En el estado actual solo referencia instrucciones locales (`.plyrium-forge/opencode-role.md`), así que aporta utilidad de ejecución local pero no contrato durable del repo.
- Por eso queda fuera de commit en esta política.
- opencode.json es config local de runtime y no source of truth.

## Regla de Jest

- Jest debe ignorar `.plyrium-forge/worktrees/` tanto para discovery de tests como para resolución de módulos.
- El objetivo es que un path explícito ejecute exactamente la suite del repo raíz y no sus copias locales de runtime.
- Jest debe ignorar .plyrium-forge/worktrees/.

## Justificación de seguridad y trazabilidad

- Los artefactos locales de tooling pueden existir mientras el runtime corre, pero no deben convertirse en verdad canónica ni en evidencia durable del sistema.
- La verdad versionada vive en código y docs del repo; la verdad operacional durable vive en DevHub/artefactos diseñados para eso; el runtime local solo ejecuta.

## Resultado esperado

- `npm test -- src/lib/operations/__tests__/swarmControl.test.js tests/unit/operations-swarm-control.test.js tests/unit/swarmControl-view.test.js` deja de levantar duplicados desde `.plyrium-forge/worktrees/`.
- `npm test -- --runTestsByPath ...` sigue ejecutando únicamente los paths pedidos.

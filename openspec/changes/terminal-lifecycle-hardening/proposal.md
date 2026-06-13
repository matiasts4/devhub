# Proposal: terminal-lifecycle-hardening

## Intent

Propagar la constelación de guards del change `terminal-pizarra-stability` (L1–L6) a **todos** los lifecycle triggers de terminal — en particular swarm launch, panel-close, split y relaunch — donde hoy hay crashes P0 y paneles negros en TUIs (OpenCode, grok, Claude Code).

## Why now

- `isPizarraSharedViewEnabled()` está ON en dev → toda la app usa `SharedTerminalSurface`, pero la verificación solo cubrió pizarra ↔ workspace.
- Fixes recientes fueron síntoma-driven (hostRef, dimensions, panel-closed) sin policy central.
- Swarm launch es el siguiente bloqueador para orquestación multisesión.

## Scope

**In:**

- Helper `scheduleTerminalLifecycleSync` (L1 centralizado)
- Swarm launch hardening (Fase 1)
- Split / relaunch bursts (Fases 2–3)
- Tests + baseline matrix rows 8–15

**Out:**

- SwarmPromptEngine reactivación (Fase 5 orquestación)
- Prod rollout flag B (ya existe en terminal-pizarra-stability)
- Telegram / MCP delegation

## Source of truth (docs)

- `docs/errores/04-terminal-lifecycle-coverage-gaps/` — catálogo, matriz, plan
- `docs/errores/03-terminal-canvas-glyph-corruption/baseline-metrics.md` — filas 8–15

## Success criteria

1. Escenarios 8–10 de baseline sin crash en dev
2. 0 errores `bus-snapshot` en poll (ya fixed)
3. Test unitario para lifecycle sync helper
4. Duplicación hook/TWM swarm eliminada o delegada

## Rollback

Cambios additive; revertir helper y bursts por archivo sin tocar pizarra-stability core.

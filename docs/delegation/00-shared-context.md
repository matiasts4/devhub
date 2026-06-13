# DevHub — Contexto compartido para agentes delegados

**Proyecto:** `/home/matias/ArxonLabs/devhub`  
**Fecha planificación:** 2026-06-11  
**Plan maestro:** ver conversación / plan `devhub_multi-pillar_roadmap`

## Qué estamos haciendo

Cuatro sesiones OpenCode trabajan en paralelo (con dependencias) sobre mejoras UX core de DevHub. Cada agente ejecuta el **SDD completo**:

```
explore → propose → spec → design → tasks → apply → verify → (archive cuando el humano apruebe)
```

**No ejecutes orquestación swarm** en ningún paquete (launch perf, delegate_to_opencode, batch deadlines). Eso está en pausa.

## Reglas de oro

1. **Código > docs.** Los `tasks.md` de openspec pueden estar desactualizados. Verifica con grep/lectura antes de asumir que algo está hecho o pendiente.
2. **TDD.** RED test → GREEN impl → REFACTOR. Cada tarea cierra con test o criterio E2E explícito.
3. **PRs pequeños.** Ideal ≤130 LOC net por commit; máximo ~400 LOC por PR.
4. **No duplicar trabajo** entre agentes — respeta límites de archivos en cada prompt.
5. **DevHub MCP + git checkpoint** antes de marcar tareas `completed` (ver `AGENTS.md` en raíz del repo).
6. **Español** en mensajes user-facing de Zed; código/comentarios en inglés como el resto del repo.
7. Tras modificar código, ejecutar tests relevantes (`npm test -- --testPathPattern=...`).

## Decisiones de producto cerradas

| Tema | Decisión |
|------|----------|
| Nombres de terminal | Pool automático (~30 nombres cortos: Chase, Nate, Cesar…) al crear + renombrable |
| Resumen sesión Zed | Tool devuelve digest estructurado; LLM redacta máx 2 frases |
| Aura Zed | Sutil — gradiente ligero; no distraer del terminal |
| "Seguro" en Zed | = menos errores de ejecución, NO policy de comandos peligrosos |
| Orquestación swarm | En pausa |

## Dependencias entre paquetes

```
Agente 1 (Terminales) ──bloquea──► Agente 2 (Zed) para nombres + clicks
Agente 1 ──bloquea──► Agente 3 (Pizarra) para shared-view prod
Agente 4 (Diseño) ──paralelo──► no bloquea a nadie
```

- **Agente 2** puede empezar `summarize_terminal` y mejoras de prompt sin esperar nombres, pero `resolveByDisplayName` requiere Agente 1.
- **Agente 3** puede trabajar animaciones/aura en paralelo; rollout `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` en prod espera terminales estables.

## Mapa de archivos críticos (no tocar sin razón)

| Área | Archivos sensibles |
|------|-------------------|
| Terminal core | `src/components/TerminalTTY.jsx`, `src/lib/terminal/terminalNoiseFilter.js` |
| Panel state | `src/components/TerminalWorkspacesManager.jsx` |
| Zed tools | `src/lib/asistente/tools/terminal.js`, `docs/prompts/asistente/zed-system-prompt.md` |
| Pizarra | `src/components/pizarra/*`, `src/lib/pizarra/*` |
| Diseño | `src/app/globals.css`, `src/lib/theme/themes.js`, `src/chrome/morphology.js` |
| Sidecar (sync manual) | `sidecar-backend/sessionTransport.js` — debe mantener paridad con noise filter |

## Verificación post-delegación (humano + agente coordinador)

Cuando los 4 agentes terminen, un quinto paso de integración debe:

1. Correr suite completa `npm test` + E2E relevantes
2. Probar manualmente: click OpenCode, rename terminal, Zed "Chase haz X", toggle pizarra, aura sutil
3. Resolver conflictos de merge entre branches
4. Verificar que ningún agente tocó orquestación swarm

## Índice de prompts

| Agente | Prompt | Openspec change(s) |
|--------|--------|-------------------|
| 1 | [`01-agent-terminales.md`](01-agent-terminales.md) | `terminal-tui-interaction`, `terminal-display-names` |
| 2 | [`02-agent-zed.md`](02-agent-zed.md) | `zed-terminal-awareness` |
| 3 | [`03-agent-pizarra-motion.md`](03-agent-pizarra-motion.md) | `pizarra-motion-polish`, `zed-ambient-aura` |
| 4 | [`04-agent-diseno.md`](04-agent-diseno.md) | `sdd/ui-professionalization` desde propose |
| 5 | [`05-agent-planning-launch.md`](05-agent-planning-launch.md) | `planning-launch-hardening` |

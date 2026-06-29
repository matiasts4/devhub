# ZED Orchestrator Pod

Modelo de ejecución paralelo para DevHub: **ZED** coordina; cada **SDD Worker** corre un `gentle-orchestrator` con el flujo SDD estándar (sin perfiles ni fases SDD nuevas).

## Jerarquía

```
Operador (tú)
    ↓ conversación
ZED Orchestrator  (perfil OpenCode: zed-orchestrator)
    ↓ delega changes / tareas MCP
SDD Worker 1..N   (perfil OpenCode: gentle-orchestrator — sin cambios)
    ↓ subagentes SDD nativos
explore → propose → spec → design → tasks → apply → verify → archive
```

## Principios

1. **No nuevos SDD** — los workers usan `gentle-orchestrator` y los comandos `/sdd-*` existentes.
2. **Standby al launch** — terminales abiertas sin trabajo hasta que el operador hable con ZED.
3. **MCP como cola** — ZED lee/asigna tareas vía DevHub MCP; marca `qa_ready` cuando el worker termina; el operador prueba y cierra.
4. **Swarm legacy intacto** — plantillas `clean-slate`, `feature-delivery-team`, etc. siguen usando perfiles `swarm-*`.

## Documentos

| Archivo                                    | Contenido                                |
| ------------------------------------------ | ---------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)       | Componentes, perfiles, launch flow       |
| [LAUNCHPAD.md](./LAUNCHPAD.md)             | Plantilla `zed-orchestrator-pod` y modal |
| [PROMPT-CONTRACT.md](./PROMPT-CONTRACT.md) | Contrato del prompt ZED                  |

## Perfiles OpenCode

| Rol terminal | `role_key`     | Perfil OpenCode                                     |
| ------------ | -------------- | --------------------------------------------------- |
| ZED          | `zed`          | `zed-orchestrator` (repo `opencode.json`)           |
| SDD Worker N | `sdd_worker_N` | `gentle-orchestrator` (global `~/.config/opencode`) |

## Estado

- [x] Documentación base
- [x] Prompt `zed-orchestrator-v1.md`
- [x] Plantilla launchpad `zed-orchestrator-pod`
- [x] Modo bootstrap `standby`
- [x] Columna Kanban `qa_ready` (Pendiente revisión) + enum MCP
- [x] Asistente Zed (dock): contrato ZED Orchestrator Pod en system prompt
- [x] E2E `tests/e2e/zed-orchestrator-pod.spec.ts` (4 escenarios)
- [x] Tests unitarios/integration (Jest + MCP)
- [ ] Manual QA en terminales reales — ver [MANUAL-QA.md](./MANUAL-QA.md)

> **Relación con el Asistente Zed del dock**: el ZED Orchestrator Pod es el modo proactivo/orquestador de swarm, lanzado desde _Swarm Control_. No es el mismo producto que el asistente de voz/chat del dock derecho, aunque comparten voz e intenciones. Ver [`docs/designs/ZED-ARCHITECTURE-01-asistente-vs-agente.md`](../designs/ZED-ARCHITECTURE-01-asistente-vs-agente.md).

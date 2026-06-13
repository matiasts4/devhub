# Arquitectura — ZED Orchestrator Pod

## Control plane vs runtime

| Capa          | Componente                         | Responsabilidad                                          |
| ------------- | ---------------------------------- | -------------------------------------------------------- |
| Control plane | DevHub MCP + Kanban                | Tareas, estados, comentarios, cola                       |
| Orquestación  | ZED (`zed-orchestrator`)           | Asignar changes, monitorear workers, escalar al operador |
| Ejecución SDD | SDD Worker (`gentle-orchestrator`) | Pipeline SDD completo por change, con subagentes nativos |
| UI            | `SwarmLaunchWizardModal`           | Lanzar pod en standby (sin modal nuevo)                  |

ZED **no** ejecuta fases SDD directamente. Delega a workers que ya saben orquestar SDD vía Gentle Orchestrator.

## Flujo operativo

```mermaid
sequenceDiagram
    participant U as Operador
    participant Z as ZED Orchestrator
    participant M as DevHub MCP
    participant W as SDD Worker (gentle-orchestrator)

    U->>Z: Lanzar plantilla zed-orchestrator-pod
    Note over Z,W: Standby — sin claim ni SDD

    U->>Z: Asigna change X al Worker 2
    Z->>M: update_task / add_task_comment
    Z->>W: Mensaje con change_name + contexto

    W->>W: /sdd-continue, subagentes sdd-*
    W->>M: update_task(status=qa_ready) + [git:checkpoint]

    Z->>U: Listo para revisión humana (columna Kanban)
    U->>M: completed (tras prueba funcional; sin segundo checkpoint)
```

## Mapeo de roles en código

- `buildRoleAgentProfile('zed')` → `zed-orchestrator`
- `buildRoleAgentProfile('sdd_worker_1')` → `gentle-orchestrator` (`DEFAULT_OPENCODE_AGENT`)
- `isOrchestratorRoleKey('zed' | 'director')` — usado en launch y layout de terminales

## Launch standby

`bootstrapMode: standby` en el wizard:

- Misión vacía o placeholder
- Prompt ZED: identidad + esperar operador
- Prompt Worker: identidad + esperar asignación de ZED; al recibir change, usar flujo SDD estándar
- `sddEnabled: false` en draft de plantilla ZED (SDD lo activa el worker, no el launch)

## Archivos tocados

- `opencode.json` — agente `zed-orchestrator`
- `docs/prompts/swarm/zed-orchestrator-v1.md`
- `src/lib/operations/swarmControl.js` — catálogo, mapeo, topología
- `src/app/api/agenthub/operations/health/route.js` — prompts standby, director=zed
- `src/components/control-room/SwarmLaunchWizardModal.jsx` — UI plantilla destacada
- `src/components/terminal/utils/swarmRoleMeta.js` — meta ZED / SDD Worker
- `src/components/terminal/hooks/useSwarmLaunchController.js` — layout ZED-centric
- `src/components/TerminalWorkspacesManager.jsx` — `isOrchestratorRoleKey` en grid de terminales
- `src/views/SwarmControl.jsx` — terminate swarm + launch wizard

## Principio: no interferir con SDD estándar

- Workers usan **solo** `gentle-orchestrator` (mismo perfil que SDD normal).
- ZED usa **solo** `zed-orchestrator` (read-only, sin fases SDD).
- No se agregan perfiles `sdd-*` nuevos ni comandos SDD en el launch del pod ZED.
- `sddEnabled: false` en draft de plantilla ZED; el worker activa SDD al recibir un change.

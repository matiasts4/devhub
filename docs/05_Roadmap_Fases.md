---
Fecha de Modificación: 15 de mayo de 2026
Changelog:
  - 2026-03-27 v1: Consolidación de la antigua Hoja de Ruta al nuevo sistema de Wiki.
  - 2026-03-28 v2: Actualización completa — Fases 4-6 marcadas según estado real. Añadida Fase 7 Planning IA. Swarm Control marcado como completado.
  - 2026-05-14 v3: Alineación de roadmap con Swarm Workspace, SW-1.3 y SW-4.1 como capas separadas de SDD/OpenCode.
  - 2026-05-15 v4: Corrección del boundary MCP/Git. Se marcan como históricos los ítems viejos de Git/filesystem/terminal en MCP y se actualiza el cierre de Planning IA.
---

# 05 Roadmap y Fases

## Vista General

```
FASE 1 ── FASE 2 ── FASE 3 ── FASE 4 ── FASE 5 ── FASE 6 ── FASE 7 ── FASE 8
  ✅         ✅       🔄 (*)      ✅         ✅         ✅         ✅         ✅
Bases     Core UI    Tauri     MCPs/IA   IDE & Pul. Swarm    Planning   Equipo
```

(\*) Estructura lista — falta compilar (requiere Rust)

---

## FASE 1 — Bases ✅

- Repo consolidado (eliminado Python, frontend en raíz)
- Documentación `/docs` creada y reestructurada
- `.gitignore` corregido

---

## FASE 2 — Funcionalidad Core ✅

- **ProjectHub** — CRUD proyectos real con Supabase
- **Tareas** — Kanban completo (crear, mover, eliminar, prioridad)
- **Roadmap** — Milestones reales con timeline
- **Historial** — Timeline agrupado por mes
- **Dashboard** — Métricas reales (tareas, progreso, próximo hito)
- **Ajustes** — Editar proyecto, perfil usuario, eliminar
- **Conexiones** — CRUD de conexiones MCP

---

## FASE 3 — Instalador Tauri 🔄

### Hecho

- `src-tauri/` completo (Cargo.toml, main.rs, lib.rs, build.rs, tauri.conf.json)
- `next.config.js` con `output: export`
- Scripts npm: `tauri:dev`, `tauri:build`

### Pendiente (acción del usuario)

```bash
# 1. Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 2. Compilar
cd /home/matias/devhub
npm run tauri:build
```

---

## FASE 4 — MCPs y Agentes IA ✅

| Tarea                                                                        | Estado                    |
| ---------------------------------------------------------------------------- | ------------------------- |
| `devhub-mcp/server.js` como control plane operativo DevHub                   | ✅                        |
| Registrado en `mcp_config.json` — ACTIVO                                     | ✅                        |
| API Routes: `/api/ai/chat`, `/api/tasks`, `/api/mcp/connections`             | ✅                        |
| `CentroIA.jsx` — panel de estado del servidor MCP                            | ✅                        |
| `get_project_context` para planning exhaustivo ⭐                            | ✅                        |
| `bulk_create_tasks` / `bulk_create_milestones`                               | ✅                        |
| `get_execution_queue`, `claim_next_task`, `renew_task_lease`, `release_task` | ✅                        |
| Git/filesystem/terminal como surface general del MCP                         | ⚠️ Histórico / no vigente |
| Cierre de planning con `update_project(planning_status="completed")`         | ✅                        |

---

## FASE 5 — IDE y Pulido ✅

| Tarea                                                | Estado |
| ---------------------------------------------------- | ------ |
| Terminal Integrada (`xterm.js` + `node-pty`)         | ✅     |
| Editor Embebido (`@monaco-editor/react`)             | ✅     |
| Sincronización Real-Time (`chokidar` + WebSockets)   | ✅     |
| PWA para acceso móvil (manifest.json)                | ✅     |
| CI/CD GitHub Actions                                 | ✅     |
| Generador de Scaffolding Real (Smart-Scaffold)       | ✅     |
| Sistema Multi-Temas (Deep Sea, Nord, Dracula, Light) | ✅     |
| Centro de Notificaciones y Alertas                   | ✅     |
| Onboarding (wizard primer login)                     | ✅     |
| Burndown Chart en Project Dashboard                  | ✅     |
| Notificaciones Toast para eventos de Swarm           | ✅     |
| Preferencias Monaco Editor + xterm.js                | ✅     |

---

## FASE 6 — Swarm Control y Orquestación ⚠️ Histórica / Parcial

> Nota 2026-05-15: esta fase debe leerse como snapshot histórico de una etapa previa. Para la dirección vigente ver `23_Swarm_Workspace_Intencion_y_Roadmap.md` y `24_Politica_Git_y_Versionado_Agentes.md`. En particular, Git ya no debe interpretarse como surface general del DevHub MCP.

| Tarea                                                                   | Estado                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Herramientas Git en MCP (`git_branch`, `git_commit`, `git_diff_review`) | ⚠️ Histórico / reemplazado por capability del ejecutor |
| System Prompts Worker y QA Agent (`09_Prompts_Maestros_Agentes.md`)     | ✅                                                     |
| Git Hooks anti-push-a-main                                              | ✅                                                     |
| UI `/project/:id/swarm-control` — ver ramas activas                     | ✅                                                     |
| Visor de Diffs (`DiffViewer`) + botón Merge / Rechazar                  | ✅                                                     |
| `SwarmControl.jsx` reactivo consumiendo `/api/agent/status`             | ✅                                                     |
| Botón Auto-Spawn Worker en Tareas                                       | ✅                                                     |
| Endpoints `/api/agent/spawn` y `/api/agent/status`                      | ✅                                                     |
| Panel Central IA (`CentroIA.jsx`) con botón Zap                         | ✅                                                     |
| Vinculación `milestone_id` en `tasks` (FK)                              | ✅                                                     |
| Selector de Hito al crear/editar Tarea Kanban                           | ✅                                                     |
| Cálculo de progreso jerárquico (Hito → Tareas)                          | ✅                                                     |

---

## FASE 7 — Analítica Avanzada y Gestión de Memoria del Agente ⭐ ✅

> Ver documento completo: [10_Planning_IA.md](./10_Planning_IA.md)

| Tarea                                                                          | Estado |
| ------------------------------------------------------------------------------ | ------ |
| DB: `projects.planning_prompt` + `projects.planning_status`                    | ✅     |
| DB: Tabla `project_files` con RLS                                              | ✅     |
| MCP: `get_project_context` — lee archivos + prompt del proyecto                | ✅     |
| MCP: `update_project(planning_status="completed")` — marca planning completado | ✅     |
| API: `POST/GET/DELETE /api/projects/[id]/files`                                | ✅     |
| Frontend: Modal "Nuevo Proyecto" con Planning IA toggle + Dropzone             | ✅     |
| Frontend: `PlanningMode.jsx` — página completa de onboarding planning          | ✅     |
| Frontend: Badge "Plan pendiente" en tarjetas de ProjectHub                     | ✅     |
| Frontend: "Planning IA" en sidebar con dot pulsante                            | ✅     |
| Prompt de agente auto-generado y copiable                                      | ✅     |
| Polling en tiempo real de milestones/tareas creados                            | ✅     |

---

## FASE 8 — Multi-Proyecto y Colaboración en Equipo ✅

> Ver documento completo: [16_Multi_Usuario_y_Colaboracion.md](./16_Multi_Usuario_y_Colaboracion.md)

| Tarea                                                                    | Estado |
| ------------------------------------------------------------------------ | ------ |
| `[TEAM-01]` Sistema de Invitación a Proyecto con Roles (DB + Email)      | ✅     |
| `[TEAM-02]` Row Level Security multi-usuario para todas las tablas       | ✅     |
| `[TEAM-03]` Colaboración en tiempo real con Supabase Realtime + Presence | ✅     |
| `[TEAM-04]` Atribución de Tareas a Personas o Agentes                    | ✅     |
| `[TEAM-05]` Sistema de Comentarios en Tareas (humanos y agentes)         | ✅     |

---

## FASE 9 — Producción, Seguridad y Distribución 📋

| Tarea                                                                 | Prioridad |
| --------------------------------------------------------------------- | --------- |
| Integración API LLM externo (Gemini/Anthropic) para planning autónomo | 🟡 Media  |
| Sistema de templates de proyectos (E-commerce, SaaS, Mobile)          | 🟡 Media  |
| Dashboard multi-proyecto con vista Gantt                              | 🟢 Baja   |
| Colaboración multi-usuario en mismo proyecto                          | 🟢 Baja   |
| Exportar plan como PDF o Notion                                       | 🟢 Baja   |

---

## FASE 13 — Swarm Workspace 📋 INTENCIÓN

> Documento rector: [23_Swarm_Workspace_Intencion_y_Roadmap.md](./23_Swarm_Workspace_Intencion_y_Roadmap.md)

Esta fase corrige una diferencia importante entre la documentación histórica y el estado real: varias piezas de Swarm, Telegram/chatbot y MCP UI existen parcialmente o quedaron desalineadas. El objetivo no es seguir agregando features encima de bases débiles, sino refactorizar el sistema hacia un **Swarm Workspace** robusto.

Guardrail de interpretación para esta fase:

- `SW-1.3` formaliza roles runtime y estados runtime.
- `SW-4.1` define el supervisor/control plane duradero.
- Las fases/workflows SDD y los perfiles OpenCode se **reusan**, pero no reemplazan ese supervisor/control plane duradero.
- La integración correcta es mediante workers especializados y, si hace falta, adapters/wrappers que respeten el contrato DevHub.

| Área                | Intención                                                           |
| ------------------- | ------------------------------------------------------------------- |
| Swarm Core          | leases, roles de agentes, recuperación de tareas, supervisor loop   |
| Workspace Execution | branch/worktree/workspace aislado por agente                        |
| Artifacts           | logs, diffs, resultados de tests y evidencia por tarea              |
| Telegram            | rehacer como canal externo/adaptador, no como núcleo                |
| MCP Control Center  | pantalla real de diagnóstico/list tools/smoke por cliente           |
| Engram/Graphify     | responsabilidades claras: memoria vs grafo vs ejecución operacional |

Estado: **documentado como intención; pendiente de auditoría e implementación.**

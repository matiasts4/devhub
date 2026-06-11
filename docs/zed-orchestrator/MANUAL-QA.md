# Manual QA — ZED Orchestrator Pod

Checklist para validar el flujo completo en entorno local (dev server + terminales).

## Prerrequisitos

```bash
pnpm dev                    # http://localhost:3100 (o puerto configurado)
# OpenCode + perfiles: zed-orchestrator (repo) y gentle-orchestrator (global)
```

## 1. Launch idle → ZED pod

1. Ir a **Swarm / Control Room** (`/project/<id>/swarm-control`) con supervisor idle.
2. Verificar plantilla **ZED Orchestrator Pod** marcada como **Recomendada**.
3. **Abrir wizard** → paso Configure:
   - Copy de **modo standby**
   - Selector **SDD Workers (1–4)**
   - Sin toggle SDD en plantilla ZED
4. **Lanzar swarm local** → terminales ZED + workers abren en standby (sin SDD automático).

**Esperado:** prompts standby; ZED espera operador; workers esperan delegación.

## 2. Delegación ZED → worker

1. Conversar con ZED (terminal o dock) para delegar un change/tarea.
2. Worker recibe contexto y corre flujo SDD estándar (`gentle-orchestrator`, `/sdd-*`).

**Esperado:** solo workers ejecutan SDD; ZED no corre fases SDD.

## 3. Handoff `qa_ready`

1. Worker termina y marca tarea `qa_ready` vía MCP con comentario `[git:checkpoint]`.
2. Kanban (**Tareas**) muestra columna **Pendiente revisión**.
3. Dashboard / Historial reflejan `qa_ready`.

**Esperado:** gate checkpoint al pasar a `qa_ready`; humano no necesita segundo checkpoint.

## 4. Cierre humano → `completed`

1. Operador prueba funcionalmente el entregable.
2. Mueve tarea de **Pendiente revisión** → **Completada** (UI o MCP `update_task`).

**Esperado:** `completed` desde `qa_ready` sin segundo `[git:checkpoint]`.

## 5. Swarm legacy intacto

1. Lanzar **Arranque limpio guiado** (`clean-slate`) desde launchpad.
2. Verificar roles Director/Coder y perfiles `swarm-*` / delivery habituales.

**Esperado:** plantillas legacy sin regresión.

## Automatizado (referencia)

| Suite              | Comando                                                        |
| ------------------ | -------------------------------------------------------------- | ------------ | ------------ | ------------- |
| Unit + integration | `npm test -- --testPathPattern="swarmControl                   | taskStatuses | SwarmControl | Tareas.test"` |
| MCP tasks          | `cd devhub-mcp && npm test -- tests/integration/tasks.test.js` |
| E2E smoke          | `npm run test:e2e -- tests/e2e/zed-orchestrator-pod.spec.ts`   |

## Registro de ejecución

| Fecha      | Operador | Entorno   | Resultado         | Notas                                                                      |
| ---------- | -------- | --------- | ----------------- | -------------------------------------------------------------------------- |
| 2026-06-11 | CI/agent | local dev | Automatizado OK   | Jest 109/109, MCP 19/19, E2E 4/4; `launch_catalog` en health GET           |
|            |          |           | Manual terminales | Pendiente: launch real + delegación ZED + prueba funcional post-`qa_ready` |

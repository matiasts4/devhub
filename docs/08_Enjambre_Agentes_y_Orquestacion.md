---
Fecha de Modificación: 15 de mayo de 2026
Estado: PARCIAL / FUNDACIONAL
Changelog:
  - 2026-03-28 v1: Fundación de la Arquitectura Inteligente de Enjambre (Swarm) para prevención de degradación documental y manejo de colisiones por IA.
  - 2026-05-15 v2: Alineación con la separación actual entre DevHub MCP (control plane) y Git del ejecutor. Se deriva la política operativa al doc 24 y se reclasifican referencias Git-MCP como históricas.
---

# 08 Orquestación de Enjambre (Ai Swarm) y Memoria Git

> [!WARNING]
> Este documento queda como base conceptual del Swarm. Para operación vigente leer junto con:
>
> - [`04_Protocolo_MCP_y_Agentes.md`](./04_Protocolo_MCP_y_Agentes.md)
> - [`23_Swarm_Workspace_Intencion_y_Roadmap.md`](./23_Swarm_Workspace_Intencion_y_Roadmap.md)
> - [`24_Politica_Git_y_Versionado_Agentes.md`](./24_Politica_Git_y_Versionado_Agentes.md)
>
> Las referencias antiguas a Git como surface general del MCP deben leerse como **históricas**.

## El problema central: degradación de la documentación

En ciclos rápidos de desarrollo asistidos por IA, el código evoluciona más rápido que la documentación. Si no existe una regla explícita de branch, commit, push, comentarios y QA, `/docs` se desincroniza y el historial operativo queda opaco.

Este documento mantiene las bases del **Ecosistema Multi-Agente (Swarm)**: el trabajo debe seguir aislado, auditable y con obligación de mantener la memoria documental sincronizada.

---

## 🏗️ Flujo de trabajo tripartito (visión base)

La arquitectura sigue teniendo tres roles base, pero su interpretación vigente es la siguiente:

### 1. El despachador (Manager / Controller Agent)

- **Objetivo:** recibir la idea humana, estructurarla y subdividirla.
- **Comportamiento:**
  - organiza tareas e hitos en DevHub;
  - delimita alcance;
  - asigna trabajo;
  - **no toca código ni Git**.

### 2. El obrero especializado (Worker Agent)

- **Objetivo:** ejecutar código/docs dentro de una tarea concreta.
- **Comportamiento vigente:**
  1. reclama o recibe la tarea vía **DevHub MCP**;
  2. prepara una rama corta `task/<id>-<slug>` usando la **capability Git del ejecutor**;
  3. escribe código y docs usando su runtime/skill, no el MCP general;
  4. hace commits chicos y pushes frecuentes al branch de tarea según el doc 24;
  5. registra checkpoints, bloqueos y `qa-ready` con `add_task_comment`;
  6. no mergea a `main`.

### 3. El revisor y validador (QA / Test Agent)

- **Objetivo:** auditar branch, diff, docs y evidencia técnica antes de integrar.
- **Comportamiento vigente:**
  - revisa el branch/PR/artifacts del Worker;
  - valida documentación, checks y ausencia de secretos;
  - registra veredicto en DevHub;
  - solicita aprobación humana para merge/release;
  - **no hace push directo a `main`**.

---

## 🛡️ Protocolos anti-colisión y memoria temporal

Evitar colisiones entre agentes sigue requiriendo aislamiento transaccional.

Reglas vigentes:

- **Git + comentarios/artifacts en DevHub** son la fuente de verdad operativa hasta que Swarm Workspace formalice `agent_workspaces`, runs y supervisor loop.
- Si dos agentes trabajan en paralelo, deben hacerlo en **ramas/task branches distintas** y, cuando exista, en workspaces aislados.
- La bitácora cronológica vive en `add_task_comment`, no en mensajes efímeros.

> **Estado real del repo:**
> El proyecto incluye `.githooks/pre-commit` y `.githooks/pre-push` para bloquear commits/pushes directos a `main`/`master`. La activación efectiva del `hooksPath` debe verificarse en cada entorno de ejecución; no debe asumirse por documentación solamente.

> **Dirección vigente:**
> DevHub MCP no debe exponer Git como surface general. Git/workspaces deben vivir como capability del ejecutor y formalizarse más adelante con `agent_workspaces`, artifacts y supervisor gates en Swarm Workspace.

### Changelog histórico relevante

- 2026-03-28: [DOC-08 | Tarea 3.2] Se agregó `DiffViewer.jsx` para la UI del Agente QA como parte de la visión temprana de Swarm Control.

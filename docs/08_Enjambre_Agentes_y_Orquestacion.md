---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Fundación de la Arquitectura Inteligente de Enjambre (Swarm) para prevención de degradación documental y manejo de colisiones por IA.
---

# 08 Orquestación de Enjambre (Ai Swarm) y Memoria Git

## El Problema Central: Degradación de la Documentación
En ciclos rápidos de desarrollo asistidos por Inteligencia Artificial, el código evoluciona a un ritmo vertiginoso, superando la capacidad del programador (o la de un agente singular) de documentar las decisiones de diseño. A mediano plazo, el directorio `/docs` o los `README` quedan obsoletos, destruyendo el contexto funcional del proyecto.

Este documento asienta las bases y reglas estrictas para el **Ecosistema Multi-Agente (Swarm)** de DevHub. Este sistema abstrae el desarrollo aislando a agentes en tareas específicas con una **obligación inherente de mantener la memoria documental sincronizada.**

---

## 🏗️ Flujo de Trabajo Tripartito (Swarm Workflow)

La arquitectura de agentes se divide en **tres roles inmutables**, interactuando entre sí a través del Kanban (Supabase) y el Servidor MCP local de DevHub.

### 1. El Despachador (Manager / Controller Agent)
* **Objetivo:** Recibir la idea bruta humana, estructurar y subdividir.
* **Comportamiento:**
  - Toma las riendas al crear un "Nuevo Proyecto" en DevHub.
  - Define la Arquitectura inicial en un `documento maestro` y lo graba en `docs/`.
  - Usando la MCP tool `mcp_devhub_create_task`, divide el trabajo en *Sub-Tareas Granulares* y bloquea el alcance.
  - Asigna las tareas al Kanban. **Jamás programa ni toca código.**

### 2. El Obrero Especializado (Worker Agent)
* **Objetivo:** Bajar al barro, ejecutar código y actualizar invariablemente la Wiki del sistema. Funciona bajo estrictas reglas de Anti-Colisión.
* **Comportamiento (Reglas de Oro del Prompt PTY):**
  1. **Aislamiento Git (`Branching`):** Al leer su tarea asignada, el agente DEBE ejecutar `git checkout -b task/[id-tarea]`. Está estrictamente prohibido que un worker programe sobre la rama `main` temporal.
  2. **Ejecución Técnica:** Utiliza `FS-Worker` para escribir código.
  3. **Auto-Documentación Forzada:** Antes de finalizar, el agente *TIENE* que editar un archivo correspondiente en `docs/` o un `Changelog` describiendo la lógica abstracta de lo que acaba de escribir, por qué lo hizo y cualquier nuevo endpoint.
  4. **Entrega (`Commit & Push`):** El Worker debe empaquetar todo con `git add .` y `git commit -m "[TAREA] Detalle - Docs Actualizados"`.
  5. Cierra su tarea a `Completed` a través de MCP.

### 3. El Revisor y Validador (QA / Test Agent)
* **Objetivo:** Auditar la rama de Git terminada y el cierre de la tarea antes de unirla al núcleo.
* **Comportamiento:**
  - Inspecciona el Diff (los cambios hechos) entre la rama `task/` y `main`.
  - Verifica si verdaderamente la documentación fue escalada.
  - *Si hay error:* Reescribe/Corrige y rechaza la validación.
  - *Si es correcto:* Solicita permiso al Usuario Humano (UI) para hacer el `git merge master`.

---

## 🛡️ Protocolos Anti-Colisión y Memoria Temporal

Evitar que dos IAs corrompan un mismo archivo a la vez requiere control transaccional de estados. Puesto que no podemos tener *file-locks* tradicionales asíncronos en texto plano de manera confiable:
- **La única fuente de verdad transaccional será Git.** 
- Si un agente de backend y uno de frontend son despachados en paralelo, **ambos trabajarán en ramas Git distintas.** El Agente QA será el encargado de gestionar los *Git Merge Conflicts* y resolverlos consultando el contexto general creado por el *Manager Agent*.

> **Hito Técnico Desarrollado:**
> Para forzar las reglas de aislamiento (Regla de Oro 1), se implementaron *Git Hooks* centralizados (en `.githooks/pre-commit` y `.githooks/pre-push`). Todo intento de `commit` o `push` directo contra las ramas `main` o `master` es cancelado instintivamente en la máquina del humano y de los agentes trabajadores. La configuración global del repositorio usa la ruta personalizada ` core.hooksPath`.

> **Hito Técnico para el Servidor MCP:** 
> La próxima expansión arquitectónica del `devhub-mcp` debe exponer las herramientas nativas: `git_create_branch`, `git_commit_and_push`, `git_get_diff_to_main`, y `git_merge`. De esta manera, el LLM opera bajo comandos seguros en lugar de terminales sueltas que podrían desencadenar scripts peligrosos.


### Changelog
- 2026-03-28: [DOC-08 | Tarea 3.2] Se agregó el componente `DiffViewer.jsx` para la UI del Agente QA, exponiendo el visor de Diffs (delta) y los botones de 'Aprobar a Main' y 'Rechazar al Worker'.

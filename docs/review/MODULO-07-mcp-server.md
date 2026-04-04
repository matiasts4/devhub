# Módulo 7: MCP Server — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Archivos:** 1 server + 4 tests + config
> **Hallazgo principal:** README desactualizado (Supabase), tests no prueban el server real, openai instalado pero nunca usado

---

## 🔴 Hallazgos Críticos

### 1. README completamente desactualizado

El README todavía tiene instrucciones de setup con **Supabase**:

- `SUPABASE_SERVICE_ROLE_KEY` setup instructions
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback
- RLS bypass explanation
- Paths absolutos de `/home/matias/devhub`

**Necesita reescritura completa** para reflejar arquitectura SQLite local-first.

### 2. Tests no prueban el server real

Los 4 archivos de test son **simulaciones standalone** — no importan ni prueban `server.js`:

| Test File                  | Qué prueba                            | ¿Prueba el server?                       |
| -------------------------- | ------------------------------------- | ---------------------------------------- |
| `create_task.test.js`      | Lógica con mock Supabase              | ❌ No                                    |
| `create_milestone.test.js` | Lógica con mock Supabase              | ❌ No                                    |
| `get_next_task.test.js`    | Algoritmo de scoring diferente        | ❌ No (algoritmo distinto al del server) |
| `git_operations.test.js`   | Funciones que NO existen en el server | ❌ No                                    |

**19 de 23 herramientas MCP** tienen cero cobertura de tests.

### 3. `openai` instalado pero NUNCA usado

`package.json` incluye `openai@^6.33.0` pero el cliente `openai` inicializado en línea 37 **nunca se llama** en ninguna herramienta. `search_memory_semantic` no usa embeddings — solo ordena por `created_at DESC`.

---

## 🐛 Bugs y Issues

| Bug                                                                                   | Archivo              | Severidad |
| ------------------------------------------------------------------------------------- | -------------------- | --------- |
| `get_next_task` query `activeTask` no se usa (dead code)                              | `server.js:771-778`  | 🔴 Alta   |
| Scoring de `get_next_task` no incluye `due_date`                                      | `server.js:824`      | 🟡 Media  |
| `get_project` valida `.uuid()` pero DB soporta IDs legacy                             | `server.js:504`      | 🟡 Media  |
| `build_context_pack` usa `planning_prompt` como canonical summary                     | `server.js:1178`     | 🟡 Media  |
| `_upsertRows` tiene race condition (SELECT-then-INSERT)                               | `server.js:293-327`  | 🟡 Media  |
| `ensureLocalMcpTables` no crea `project_files`, `task_dependencies`, `agent_registry` | `server.js`          | 🟡 Media  |
| Jest config tiene nested `"jest"` key (non-standard)                                  | `jest.config.json:2` | 🟡 Media  |
| Variable `supabase` nombrada mal (es SQLite local)                                    | `server.js:428`      | 🟢 Baja   |
| Version hardcodeada `'1.0.0'`                                                         | `server.js:471`      | 🟢 Baja   |
| Paths absolutos de `/home/matias/devhub` en README                                    | `README.md`          | 🟢 Baja   |

---

## 📊 Herramientas MCP Expostas (23 total)

| #   | Tool                     | Categoría  | ¿Testeada?                         |
| --- | ------------------------ | ---------- | ---------------------------------- |
| 1   | `list_projects`          | Proyectos  | ❌                                 |
| 2   | `get_project`            | Proyectos  | ❌                                 |
| 3   | `update_project`         | Proyectos  | ❌                                 |
| 4   | `list_tasks`             | Tareas     | ❌                                 |
| 5   | `create_task`            | Tareas     | ❌ (test simula, no prueba server) |
| 6   | `update_task`            | Tareas     | ❌                                 |
| 7   | `add_task_comment`       | Tareas     | ❌                                 |
| 8   | `delete_task`            | Tareas     | ❌                                 |
| 9   | `create_task_dependency` | Tareas     | ❌                                 |
| 10  | `get_task_dependencies`  | Tareas     | ❌                                 |
| 11  | `get_next_task`          | Swarm      | ❌ (test usa algoritmo distinto)   |
| 12  | `list_milestones`        | Milestones | ❌                                 |
| 13  | `create_milestone`       | Milestones | ❌ (test simula)                   |
| 14  | `update_milestone`       | Milestones | ❌                                 |
| 15  | `get_dashboard`          | Dashboard  | ❌                                 |
| 16  | `get_project_context`    | Contexto   | ❌                                 |
| 17  | `mark_planning_done`     | Planning   | ❌                                 |
| 18  | `validate_topic_key`     | DocOps     | ❌                                 |
| 19  | `build_context_pack`     | DocOps     | ❌                                 |
| 20  | `register_agent`         | Swarm v2   | ❌                                 |
| 21  | `heartbeat_agent`        | Swarm v2   | ❌                                 |
| 22  | `unregister_agent`       | Swarm v2   | ❌                                 |
| 23  | `update_agent_status`    | Swarm v2   | ❌                                 |

---

## 🗑️ Archivos candidatos a eliminación

| Archivo                               | Razón                                           |
| ------------------------------------- | ----------------------------------------------- |
| `package.json` → dependencia `openai` | Nunca usada                                     |
| `tests/create_task.test.js`           | Simulación standalone, no prueba server real    |
| `tests/create_milestone.test.js`      | Simulación standalone, no prueba server real    |
| `tests/get_next_task.test.js`         | Algoritmo de scoring diferente al del server    |
| `tests/git_operations.test.js`        | Prueba herramientas que no existen en el server |

## 🔧 Fixes recomendados

### Prioridad 1 — Documentación

1. **Reescribir README.md** — eliminar Supabase, documentar SQLite local-first
2. **Eliminar paths absolutos** del README

### Prioridad 2 — Bugs

3. **Eliminar** query `activeTask` muerto en `get_next_task`
4. **Agregar** `due_date` al scoring de `get_next_task`
5. **Fix** Jest config — eliminar nested `"jest"` key
6. **Agregar** `project_files`, `task_dependencies`, `agent_registry` a `ensureLocalMcpTables()`

### Prioridad 3 — Limpieza

7. **Eliminar** dependencia `openai` del package.json
8. **Renombrar** variable `supabase` a `db` o `localClient` en server.js
9. **Escribir** tests de integración reales que prueben el server via stdio

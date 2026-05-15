---
Fecha de Modificación: 15 de mayo de 2026
Estado: VIGENTE
Owner: DevHub
Relacionado:
  - docs/04_Protocolo_MCP_y_Agentes.md
  - docs/08_Enjambre_Agentes_y_Orquestacion.md
  - docs/09_Prompts_Maestros_Agentes.md
  - docs/23_Swarm_Workspace_Intencion_y_Roadmap.md
  - docs/architecture-v2.md
Changelog:
  - 2026-05-15 v1: Política canónica de Git/versionado para agentes. Se separa DevHub MCP del runtime Git del ejecutor y se formalizan ramas, commits, pushes, comentarios y gates de merge.
  - 2026-05-15 v2: Aclarada la deprecación de tools Git dentro del DevHub MCP, la regla de commit mínimo por tarea/slice y la matriz de validación por tipo de cambio.
  - 2026-05-15 v3: Alineados hooks reales con la política canónica; `core.hooksPath` oficializado en Husky y `.githooks/*` marcado como legado inactivo.
---

# 24 Política de Git y Versionado para Agentes

## Resumen ejecutivo

Esta es la política canónica vigente para trabajo con Git dentro del ecosistema DevHub.

Decisiones confirmadas:

- **DevHub MCP es control plane**, no superficie general de Git/filesystem/terminal.
- **Git, archivos, tests y push viven en la capability/skill del agente ejecutor** (OpenCode, Hermes, Codex, editor, runner, etc.).
- **La unidad de versionado es la tarea o slice ejecutable**, no el milestone completo.
- **Las ramas protegidas (`main`/`master`) no reciben commits ni pushes directos** desde agentes.
- **Los comentarios en DevHub son la bitácora operativa** para preservar orden, cronología y evidencia.
- **Merge, release y force-push requieren aprobación humana explícita**.
- **No se deben reintroducir tools Git en el DevHub MCP general** (`git_branch`, `git_commit`, `git_diff_review`, etc.). Si aparecen en documentación histórica, deben tratarse como legacy/deprecated y reemplazadas por capability/skill del ejecutor.

---

## 1. Boundary operativo

| Capa                          | Responsabilidad                                                           | Ejemplos                                                                                |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **DevHub MCP**                | Estado operativo, roadmap, cola, leases, comentarios, registro de agentes | `list_tasks`, `claim_next_task`, `add_task_comment`, `renew_task_lease`, `release_task` |
| **Executor skill/capability** | Código, filesystem, Git, tests, diffs, PRs, SSH/GitHub auth               | `git switch`, `git commit`, `git push`, `gh pr create`, lectura/escritura de archivos   |

Regla: si la operación modifica Git o toca archivos del repo, pertenece al **ejecutor**. Si modifica estado operativo del proyecto/tarea/agente, pertenece a **DevHub MCP**.

---

## 2. Unidad de trabajo

La unidad correcta de versionado es una **tarea ejecutable** o un **slice corto de feature**.

### Reglas

1. **Un branch por tarea/slice**.
2. **Nunca esperar a un milestone completo** para recién pushear o integrar.
3. Si una tarea resulta demasiado grande para una rama corta:
   - dividir la tarea,
   - crear subtareas,
   - o separar en múltiples ramas/PRs pequeñas.
4. Los milestones agrupan roadmap; **no son la unidad de branch/push**.

---

## 3. Política de ramas

### Formato

```txt
task/<task-id>-<slug-corto>
```

Ejemplos:

- `task/sw-2.1-agent-workspaces`
- `task/sw-3.1-agent-artifacts`
- `task/doc-24-git-policy`

### Reglas

1. La rama debe ser **corta y de vida breve**.
2. Debe salir de la base vigente aprobada por el repo (`main` salvo política distinta).
3. El agente no trabaja nunca en `main`/`master`.
4. Los arreglos menores de QA se hacen sobre la **misma rama de tarea**, no en una rama compartida paralela.
5. No usar ramas largas de tipo `milestone/...`, `sprint/...` o “shared-dev” para mezclar trabajo de múltiples tareas.

### Hooks canónicos que hacen cumplir la política

El repo hoy usa **Husky como única ruta canónica de hooks activos**:

- `git config --local core.hooksPath = .husky/_`
- `.husky/pre-commit` = hook activo para bloquear commit directo a `main`/`master` y correr checks de commit.
- `.husky/pre-push` = hook activo para bloquear push directo a `refs/heads/main` y `refs/heads/master`.

Los archivos `.githooks/pre-commit` y `.githooks/pre-push` quedan como **legacy/inactivos mientras `core.hooksPath` apunte a `.husky/_`**. No deben considerarse enforcement real ni editarse como fuente canónica salvo migración explícita del `hooksPath`.

---

## 4. Política de commit

### Cuándo commitear

El agente debe commitear cuando exista un **checkpoint coherente y revisable**. No por cada guardado de archivo.

Regla mínima: toda tarea/slice que cambie archivos debe terminar con **al menos un commit final** antes de declararse `qa-ready`, `completed` o entregada al humano. Si no hubo commit porque era sólo análisis sin cambios, el reporte debe decir explícitamente `commit=none` y explicar por qué.

Hacer commit obligatoriamente:

1. en el **primer checkpoint útil** de la tarea;
2. antes de marcar una tarea como **blocked**;
3. antes de un **handoff** a otro agente/humano;
4. antes de declarar **qa-ready**;
5. en el cierre de una slice que ya deja código + docs en estado entendible.

### Formato obligatorio

Usar **Conventional Commits**. Si el trabajo viene de una tarea DevHub, el `scope` debe incluir el `task-id`.

```txt
<type>(<task-id>): <resumen corto>

- Contexto: <cambio técnico o razón>
- Docs: <archivo(s) afectados o "none">
- Checks: <validación ejecutada o "not run">
```

### Tipos permitidos

| Tipo       | Uso                                                     |
| ---------- | ------------------------------------------------------- |
| `feat`     | nueva capacidad o slice funcional                       |
| `fix`      | corrección de bug o ajuste QA                           |
| `docs`     | cambio documental puro                                  |
| `refactor` | mejora estructural sin cambio funcional esperado        |
| `test`     | cambios en tests o cobertura                            |
| `chore`    | checkpoint operativo, housekeeping, wiring no funcional |

### Ejemplos

```txt
feat(sw-2.1): define workspace metadata model

- Contexto: agrega branch_name, base_branch y cleanup_policy al diseño operativo
- Docs: docs/23_Swarm_Workspace_Intencion_y_Roadmap.md
- Checks: not run
```

```txt
chore(sw-2.1): checkpoint - branch strategy drafted

- Contexto: deja lista una primera versión revisable de la política de ramas
- Docs: docs/24_Politica_Git_y_Versionado_Agentes.md
- Checks: not run
```

```txt
fix(sw-2.1): qa adjustments for protected-branch policy

- Contexto: elimina flujo que empujaba directo a main
- Docs: docs/09_Prompts_Maestros_Agentes.md
- Checks: not run
```

### Regla documental

Si el cambio altera comportamiento, contrato, flujo operativo o arquitectura, el commit final de la slice debe incluir también la actualización documental correspondiente en la **misma rama**.

---

## 5. Política de push

### Cuándo pushear

El agente debe pushear al remoto del branch de tarea:

1. después del **primer checkpoint coherente** (para publicar la rama);
2. después de cada checkpoint relevante;
3. antes de quedar **blocked**;
4. antes de un **handoff**;
5. antes de declarar **qa-ready**.

### Reglas

1. El **primer push** debería usar:

```bash
git push -u origin HEAD
```

2. Los pushes siguientes pueden usar:

```bash
git push origin HEAD
```

3. **Nunca** pushear directo a `main`/`master`.
4. **Nunca** usar `--force` sin aprobación humana explícita.
5. Un push no reemplaza un comentario operativo: ambos deben existir.

### Regla de cadence

El patrón correcto es:

```txt
branch corto → commits chicos → pushes frecuentes al branch → QA → merge aprobado
```

No:

```txt
milestone grande → una sola rama larga → un push gigante al final
```

---

## 6. Comentarios DevHub como bitácora operativa

DevHub debe conservar la cronología mediante `add_task_comment`. Los comentarios son **append-only**: no se reescriben para “limpiar” historia.

### Prefijos recomendados

```txt
[git:start]
[git:checkpoint]
[git:blocked]
[git:qa-ready]
[git:qa]
[git:merge]
```

### Plantillas mínimas

**Inicio de trabajo**

```txt
[git:start] branch=task/sw-2.1-agent-workspaces base=main workspace=/path executor=hermes-opencode
```

**Checkpoint**

```txt
[git:checkpoint] commit=abc1234 summary="workspace metadata drafted" docs=[docs/24_Politica_Git_y_Versionado_Agentes.md] checks=[not run]
```

**Bloqueo**

```txt
[git:blocked] commit=abc1234 reason="missing repo policy input" needed="human decision on merge path"
```

**Listo para QA**

```txt
[git:qa-ready] branch=task/sw-2.1-agent-workspaces head=def5678 docs=[docs/24_Politica_Git_y_Versionado_Agentes.md,docs/09_Prompts_Maestros_Agentes.md] checks=[targeted-review]
```

**Resultado QA**

```txt
[git:qa] verdict=approved notes="docs y chronology ok; sin push directo a main"
```

**Merge**

```txt
[git:merge] method=pr target=main result=merged approver=human
```

Regla: el comentario debe permitir reconstruir **qué rama**, **qué commit**, **qué docs**, **qué checks** y **qué decisión** ocurrió.

---

## 7. QA, merge y ramas protegidas

### QA

QA valida sobre:

- rama de tarea;
- diff/PR/artifacts disponibles;
- comentarios operativos;
- docs actualizadas;
- checks relevantes al alcance.

### Checks

La validación debe ser **la mínima suficiente y relevante** para la tarea:

- tests focalizados;
- lint/typecheck si aplica;
- revisión de diff;
- smoke acotado.

**No usar build completo por defecto**. Hacer build sólo si el humano lo pide o si la tarea lo requiere explícitamente.

### Matriz de validación mínima

| Tipo de tarea                   | Validación mínima                                                      | Evidencia esperada                                         |
| ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `docs-only`                     | test documental o revisión focalizada del diff                         | comando de test o `checks=[targeted-doc-review]`           |
| `código normal`                 | tests focalizados del módulo/ruta modificada                           | comando + resultado resumido                               |
| `test-only`                     | ejecutar el test nuevo/modificado y, si aplica, una suite vecina       | comando + resultado                                        |
| `arquitectura/política/config`  | test documental/contractual si existe + revisión de consistencia       | archivos tocados + decisión registrada                     |
| `terminal/desktop/UI funcional` | tests focalizados + **smoke manual** o evidencia visual cuando aplique | comando técnico + pasos manuales + resultado humano/agente |
| `riesgoso/destructivo`          | plan explícito + aprobación humana antes de ejecutar                   | comentario con aprobación y alcance                        |

Para cambios de terminal, desktop, renderer, procesos, puertos o UI visual, no basta con “tests pasan”: debe existir una verificación funcional acotada. El agente puede entregar el comando y pedir al humano que levante la app y confirme el resultado.

### Merge

1. El merge requiere aprobación humana explícita.
2. La ruta preferida es **PR / maintainer merge path**.
3. Si el repo bloquea `push` a `main`, eso es correcto y debe respetarse.
4. Tras el merge:
   - registrar comentario `[git:merge]`,
   - cerrar/liberar la tarea según el flujo del supervisor,
   - limpiar la rama sólo cuando ya no haga falta para recuperación.

---

## 8. Integración con Swarm Workspace

Esta política cubre el estado operativo **actual** mientras Fase 13 termina de formalizar:

- `SW-2.1` → estrategia branch/worktree/workspace por agente;
- `SW-2.2` → `prepare_agent_workspace` / setup seguro del runtime;
- `SW-3.1` → runs, logs, diffs, tests, artifacts;
- `SW-4.1` → supervisor durable, gates y escalación humana.

Hasta que eso exista completo, la combinación correcta es:

```txt
executor skill/capability para Git + DevHub comments/tasks para chronology y control plane
```

---

## 9. Regla de interpretación documental

Si un documento viejo dice que DevHub MCP expone Git/filesystem/terminal como surface general, debe leerse como **histórico** o **desalineado**.

En particular, referencias a `git_branch`, `git_commit`, `git_diff_review`, `run_terminal_command`, `read_file` o `write_file` como tools del DevHub MCP general son legacy/deprecated salvo que el documento las marque explícitamente como capability externa del ejecutor o como integración separada.

Prioridad interpretativa vigente:

1. `docs/24_Politica_Git_y_Versionado_Agentes.md`
2. `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`
3. `docs/04_Protocolo_MCP_y_Agentes.md`
4. `docs/architecture-v2.md`

Regla simple: **Git vive en el ejecutor; DevHub MCP vive en el control plane.**

Regla de futuro: no volver a introducir tools Git en el DevHub MCP general. Si se necesita automatizar Git, debe vivir en una skill/capability del ejecutor, un adapter especializado o un supervisor/workspace formal con gates, no en la surface MCP operativa común.

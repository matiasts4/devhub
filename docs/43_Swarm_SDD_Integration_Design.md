# 43 — Swarm SDD Integration Design

## 1. Executive Summary

El swarm actual ya tiene perfiles por rol, worktrees reales y un director visible, pero el plan todavía mezcla ownership SDD incompatibles y sobrecarga la base con temas secundarios. El objetivo correcto es transformar el swarm visible en un **pipeline SDD por fases pequeñas**, donde cada rol tenga una responsabilidad principal clara y el `director` coordine slices cortos, verificables y trazables.

La **reactivación por sesión persistente** sigue siendo deseable, pero en esta revisión deja de ser un requisito fundacional. El rollout inicial debe poder funcionar con ownership correcto, artifacts bien handoffeados y progreso visible por fase.

---

## 2. Estado Actual

### 2.1 Prompts Swarm (bloqueadores)

Varios prompts swarm todavía contienen bloqueos explícitos o implícitos del estilo:

```
- Do NOT start SDD workflows
```

Esto vuelve inconsistente el uso de skills SDD (`sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-apply`, `sdd-verify`) dentro del swarm visible.

### 2.2 Lanzamiento actual

`buildAgentLaunchCommand` construye:

```bash
opencode --agent {swarm-role} --prompt "{quoted prompt}" --model {modelId}
```

El lanzamiento ya selecciona perfiles por rol y permite `modelId` por agente. Para este plan, el punto crítico no es la sesión persistente sino garantizar que el swarm visible ejecute el ownership SDD correcto y reciba contexto acotado por fase.

### 2.3 Modelos

El sistema ya soporta modelos por rol. La prioridad de este plan no es fijar un límite exacto de contexto ni unificar inmediatamente todos los aliases, sino asegurar que cada agente reciba una tarea lo bastante acotada como para completarla sin degradar calidad.

### 2.4 Worktrees

Sí se crean realmente (`git worktree add` + validación `.git` marker). Cada agente tiene su propio workspace aislado. Esto es correcto y se mantiene.

### 2.5 Estado real de las fases SDD

Las fases SDD vigentes no son equivalentes entre sí y no deben repartirse por intuición:

- `sdd-init` es bootstrap del proyecto y del contexto SDD.
- `sdd-explore` investiga y produce exploration.
- `sdd-propose`, `sdd-spec` y `sdd-design` pertenecen al tramo de definición del cambio.
- `sdd-tasks` es planificación ejecutable, no implementación.
- `sdd-apply` implementa.
- `sdd-verify` valida contra spec/design/tasks.
- `sdd-archive` cierra y consolida artifacts.
- `sdd-onboard` es un flujo guiado del orquestador.
- `sdd-roadmap` queda como fase estratégica separada del flujo táctico diario.

---

## 3. Objetivo

1. **Cada rol swarm absorbe una responsabilidad SDD coherente** (ver §4).
2. **El director puede disparar el flujo SDD completo usando solo el swarm visible**.
3. **La implementación se divide en phase slices pequeñas y revisables**, en vez de entregar cambios excesivamente grandes en una sola pasada.
4. **Cada fase reporta progreso claro**: estado, tasks completadas, pendientes, bloqueos y artifact actualizado.
5. **El Context Manager inyecta solo artifacts relevantes por rol y por fase**.
6. **La reactivación de sesiones queda como mejora posterior**, no como dependencia para validar el diseño base.

---

## 4. Mapeo Completo Rol Swarm ↔ Fase SDD

> **Principio**: Todos los skills SDD son herramientas legítimas. Los prompts swarm NO deben bloquear su ejecución. El bloqueo actual (`Do NOT start SDD workflows`) se elimina por completo.

| Rol Swarm | Skill SDD Principal | Skills SDD Secundarios | Responsabilidad | ¿Strict TDD? |
|-----------|-------------------|----------------------|-----------------|-------------|
| `swarm-director` | Orquestación | `sdd-init`, `sdd-tasks`, `sdd-onboard`, `sdd-roadmap` | Equivalente al **Gentle Orchestrator**. Inicializa el contexto SDD, decide qué fase ejecuta quién, corta el trabajo en phase slices y mantiene el mission thread. | No aplica |
| `swarm-explorer` | `sdd-explore` | — | Investigar codebase, comparar approaches, reportar findings estructurados. Alimenta el proposal. | No |
| `swarm-architect` | `sdd-propose` | `sdd-spec`, `sdd-design` | Define scope técnico, escribe requisitos observables y produce el diseño que guía la implementación. | Lee TDD config, no ejecuta |
| `swarm-coder` | `sdd-apply` | — | Leer specs + design + tasks, implementar task-by-task, reportar progreso y trabajar por slices pequeñas. | **Sí** (si strict_tdd activo) |
| `swarm-qa` | `sdd-verify` | — | Validar implementación contra specs, design y tasks; emitir verdict funcional y de cumplimiento. NO define el spec fuente ni arregla código. | **Sí** (verifica TDD evidence) |
| `swarm-reviewer` | `sdd-verify` (review adversarial) | — | Review de código / diff con enfoque en correctness, edge cases, security. Equivalente a revisión adversarial. Puede fusionarse con `swarm-qa` en equipos pequeños. | No |
| `swarm-auditor` | `sdd-archive` | — | Verificar que documentación final cumple formato openspec/engram. Sincronizar specs al source of truth. Archivar el cambio. | No |
| `swarm-devops` | — | Worktree cleanup, runtime validation | Servicios infraestructura. No ejecuta fases SDD directamente. | No |

### 4.1 Reglas de Ownership

- `sdd-spec` se mueve a `swarm-architect` porque sigue siendo definición del cambio, no verificación posterior.
- `sdd-tasks` se mueve a `swarm-director` porque es planificación operativa y slicing del trabajo, no ejecución de código.
- `swarm-qa` valida el cumplimiento del spec; no es el owner del spec.
- `swarm-reviewer` sigue como segunda capa de `verify`, enfocada en review adversarial.

### 4.2 Worktrees y Handoff entre Fases

**Estado real**: Plyrium crea worktrees **por rol dentro de un launch**:
- Layout: `.devhub/worktrees/<launch-id>/<role>`
- Rama: `devhub/swarm/{launchId}/{roleKey}`
- Creados realmente vía `git worktree add` + validación `.git`
- Aislados; cada agente tiene su propio workspace

**Para SDD secuencial**, el handoff principal NO debe ser un `git merge` entre worktrees por cada fase. Debe ser el artifact store + phase summaries:

1. **Fase explore**: `explorer` investiga en su worktree. Guarda findings en engram/openspec (no modifica código).
2. **Fase propose/spec/design**: `architect` lee exploration y produce artifacts de definición. El handoff es documental.
3. **Fase apply**: `coder` implementa en su worktree a partir de spec/design/tasks. Por defecto es el único writer de código del flujo.
4. **Fase verify**: `qa` y `reviewer` validan el trabajo del `coder` sobre su rama o, si hace falta, sobre un integration worktree.

**Regla base**:
- Handoff por artifact store primero.
- Integration worktree solo cuando haya múltiples writers o revisión de integración.
- No introducir `phase_branch_map` ni merges automáticos como fundamento del diseño inicial.

**Cleanup**: `swarm-devops` limpia worktrees de misiones `completed` tras `sdd-archive`.

---

## 5. Prompt Redesign por Rol

### 5.1 Principios Generales (Actualizados)

- **Eliminar por completo** el bloqueador `Do NOT start SDD workflows`. Los skills SDD son herramientas legítimas del ecosistema.
- **Agregar** el contrato de la fase SDD correspondiente, con instrucciones claras de qué skill usar y cómo.
- **Mantener** las reglas del swarm: no orquestar (eso lo hace el director), no crear sub-agentes ocultos, no planear más allá de la tarea asignada.
- **Agregar** la sección "Phase Slice Contract": cada directiva debe cubrir una unidad pequeña, verificable y con salida clara.
- **Agregar** la sección "Progress Contract": al final de cada fase el agente reporta estado, tasks completas, pendientes, bloqueos y artifact actualizado.
- **Variables de interpolación**: todos los prompts deben aceptar `{{change_name}}`, `{{phase}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}`, `{{tasks_assigned}}`, `{{progress_summary}}`.

### 5.2 swarm-explorer (SDD Explore Mode)

```markdown
# Swarm Explorer — SDD Explore Mode

You are a CODE EXPLORATION worker in a visible swarm. You investigate the codebase and return a structured handoff that feeds into SDD exploration artifacts.

## Rules
- Do NOT write code, do NOT modify files.
- Do NOT plan beyond the immediate exploration task.
- Read files, trace call graphs, map dependencies.
- Return a COMPRESSED but STRUCTURED summary: what exists, how it connects, what matters.
- Save important discoveries to engram via `mem_search` + `mem_save` with project: '{project}'.

## SDD Explore Contract
When the director assigns an exploration tied to a named change:
1. Parse: new feature? bug fix? refactor? what domain?
2. Investigate: read entry points, search related functionality, check existing tests.
3. Analyze options if multiple approaches exist (Pros/Cons/Complexity table).
4. Return EXACTLY this format:

   ## Exploration: {topic}
   ### Current State
   ### Affected Areas
   ### Approaches (table)
   ### Recommendation
   ### Risks
   ### Ready for Proposal

5. If a change name is provided, persist the artifact:
   - engram: topic_key `sdd/{change-name}/explore`, type `architecture`
   - openspec: `openspec/changes/{change-name}/exploration.md`

## Reactivation Contract
If you receive a message while already running (same tmux session):
- Acknowledge your previous task state.
- Read the new exploration directive.
- Append new findings to your previous summary.
- Return an updated structured handoff.

## Anti-patterns
- Do NOT implement anything
- Do NOT delegate further
```

### 5.3 swarm-architect (SDD Propose / Spec / Design Mode)

```markdown
# Swarm Architect — SDD Propose / Spec / Design Mode

You are an ARCHITECTURE / SYSTEM DESIGN worker in a visible swarm. You define the change before code is written: proposal, specification, and technical design.

## Rules
- Do NOT orchestrate the swarm and do NOT delegate further.
- Focus on architecture, boundaries, routing, data flow, workspace isolation, and system correctness.
- Prefer concrete evidence: files, symbols, call paths, invariants, and risks.
- If the task is unclear, ask ONE clarifying question and STOP.
- Save important discoveries to engram via `mem_save` with project: '{project}'.

## SDD Contract
When the director assigns a planning/design task with a change name:
1. Identify which artifact is missing or needs update: `proposal`, `spec`, or `design`.
2. Read the current change context and any prior artifacts for that change.
3. Produce the requested artifact:
   - **Proposal**: intent, scope, affected areas, rollback.
   - **Spec**: requirements + scenarios observables.
   - **Design**: technical approach, decisions, interfaces, file changes, testing strategy.
4. Persist the corresponding artifact:
   - engram: `sdd/{change-name}/proposal`, `sdd/{change-name}/spec`, or `sdd/{change-name}/design`
   - openspec: matching file inside `openspec/changes/{change-name}/`
5. Return summary to director: artifact produced, key decisions, open questions, next recommended phase.

## Shape Rules
- Keep each artifact compact and reviewable.
- Use tables and bullets over long prose.
- Do not mix proposal/spec/design in one response unless the director explicitly asks for more than one artifact.

## Reactivation Contract
If you receive a new design directive while running:
- Read any existing proposal/spec/design artifact for this change.
- Update or append based on the new directive.
- Re-persist and return delta summary.

## Anti-patterns
- Do NOT create sub-agents
- Do NOT act as Director
- Do NOT drift into unrelated implementation
```

### 5.4 swarm-coder (SDD Apply Mode)

```markdown
# Swarm Coder — SDD Apply Mode

You are a CODE IMPLEMENTATION worker in a visible swarm. You receive concrete tasks (with optional SDD context) and implement them directly.

## Rules
- Do NOT plan, do NOT orchestrate, do NOT delegate further.
- Implement the task directly. Read only what you need, write the code, verify it works.
- If the task is unclear, ask ONE clarifying question and STOP.
- Save important discoveries to engram via `mem_save` with project: '{project}'.
- Return a concise summary of what you changed and any risks.

## SDD Apply Contract
When the director assigns a coding task with SDD context (change name provided):
1. **Read dependencies FIRST:**
   - specs (acceptance criteria)
   - design (constraints)
   - tasks (what to implement)
   - existing code patterns
   - assigned slice (`tasks_assigned` or equivalent)
2. **Enforce Review Workload Decision:**
   - If tasks artifact says "Chained PRs recommended" or "400-line budget risk: High", STOP and report to director before writing code.
3. **Implement only the assigned phase slice.** Mark each task in that slice as complete.
4. **If Strict TDD is active:** follow RED → GREEN → REFACTOR for every task. Produce TDD Cycle Evidence table.
5. **Persist progress:**
   - engram: topic_key `sdd/{change-name}/apply-progress`, merge with previous progress if it exists.
   - openspec: update `tasks.md` with `[x]` marks.
6. **Return structured summary:** slice completed, files changed, deviations, issues, remaining tasks, status, and recommendation for next slice.

## Standard Mode (no SDD context)
If no change name or SDD artifacts are provided, fall back to simple implementation: read context, write code, run tests, commit.

## Reactivation Contract
If you receive a new coding directive while running:
- Read your existing apply-progress for this change.
- Resume from the first incomplete task in the assigned slice, or accept the newly assigned slice if the previous one is complete.
- Merge new progress and re-persist.
- Report cumulative status.

## Anti-patterns
- Do NOT create sub-agents
- Do NOT plan beyond the immediate task
- Do NOT refactor unrelated code
- Do NOT ignore specs or design when SDD context is present
```

### 5.5 swarm-qa (SDD Verify Mode)

```markdown
# Swarm QA — SDD Verify Mode

You are a TESTING AND QA worker in a visible swarm. You validate implementation against specs and emit a structured verdict.

## Rules
- Do NOT write production code. You MAY write test code if the task requires it.
- Run existing tests first to establish baseline.
- Execute the task's verification steps.
- Return a structured report: ✅ passed, ❌ failed, ⚠️ warnings.
- Save test results to engram via `mem_save` with project: '{project}'.

## SDD Verify Contract
When the director assigns verification for a named change:
1. Read spec, design, tasks, and apply-progress artifacts.
2. Resolve testing/TDD mode from cached capabilities.
3. Count completed vs incomplete tasks.
4. Map each spec scenario to implementation evidence + tests.
5. Run the checks needed for the current phase slice.
6. Build behavioral compliance matrix.
7. Persist verify-report:
   - engram: topic_key `sdd/{change-name}/verify-report`
   - openspec: `openspec/changes/{change-name}/verify-report.md`
8. Return:
   - Verdict: PASS / PASS WITH WARNINGS / FAIL
   - Issues grouped: CRITICAL / WARNING / SUGGESTION
   - Spec compliance matrix
   - Correctness table
   - Design coherence table
   - Progress note for director: verified slice, pending slices, blocker if any

## Reactivation Contract
If you receive a new verification directive while running:
- Read existing verify-report for this change.
- Re-run only the affected checks or the full suite as requested.
- Append new results and re-persist.

## Anti-patterns
- Do NOT implement fixes (report them instead)
- Do NOT plan or orchestrate
- Do NOT delegate further
- Do NOT skip tests that are already written
```

### 5.6 swarm-director (Gentle Orchestrator Equivalent)

```markdown
# Swarm Director — Gentle Orchestrator Mode

You are the DIRECTOR and ORCHESTRATOR for the visible tmux swarm. You are equivalent to the **Gentle AI Orchestrator** in the SDD workflow.

## Core Identity
- You coordinate, you do NOT implement directly (unless human explicitly overrides).
- You decide WHO does WHAT, WHEN, and in WHAT ORDER.
- You are the only role that sees the full mission thread across all phases.

## SDD Phase Ownership (Complete Mapping)
You assign phases to swarm roles. Each phase produces an artifact:

| Phase | Owner Swarm Role | Artifact Produced | Your Action |
|-------|-----------------|-------------------|-------------|
| `sdd-init` | You (director) | Project context, testing capabilities, persistence mode | Run once per project |
| `sdd-onboard` | You (director) | Guided walkthrough | Run only when the human asks for onboarding |
| `sdd-explore` | `swarm-explorer` | Exploration findings | Launch → wait → read summary |
| `sdd-propose` | `swarm-architect` | Change proposal (scope, intent) | Launch when exploration is ready |
| `sdd-spec` | `swarm-architect` | Delta specs with scenarios | Launch when proposal is ready |
| `sdd-design` | `swarm-architect` | Design document | Launch when spec is ready |
| `sdd-tasks` | You (director) | Task breakdown + phase slices | Generate or update before implementation |
| `sdd-apply` | `swarm-coder` | Apply progress, code changes | Launch one phase slice at a time |
| `sdd-verify` | `swarm-qa` + `swarm-reviewer` | Verify report | Launch → wait → check verdict |
| `sdd-archive` | `swarm-auditor` | Archive report, final docs | Launch after verify PASS |

## Phase Slice Management (CRITICAL)
You MUST:
- Divide large implementations into multiple apply phases.
- Assign one small, reviewable slice at a time.
- Require every phase to return: status, completed work, pending work, blockers, updated artifact.
- Prefer artifact references + short summaries over replaying full history.

## Continuation Protocol
Before assigning the next phase slice to a role:
1. Read the latest artifact and progress summary for that role.
2. If the agent is `running`, wait or queue the next slice.
3. If the agent is `idle` or `completed`, send the next slice with only the required context.
4. If the runtime needs relaunch, relaunch with the same role contract and current artifacts.
5. Do NOT make session persistence a prerequisite for the phase model.

## Decision Points (YOU must decide)
- If `sdd-tasks` forecasts >400 lines or high risk: ask human whether to use chained PRs.
- If `sdd-verify` returns FAIL: decide whether to re-run apply, re-run design, or ask human.
- If exploration finds ambiguity: ask human ONE clarifying question, then proceed.
- If a slice grows too much, split it before sending it to the coder.

## Anti-patterns
- No `delegate`, `delegation_list`, or `delegation_read` — the visible swarm IS your delegation mechanism.
- No shadow swarms outside the tmux roster.
- No asking an agent to do una fase excesivamente grande en una sola pasada.
- No pasar artifacts completos cuando basta con summary + referencia.

## Output Style
- Short coordination updates per phase.
- Explicit owner per task and per SDD phase.
- Explicit evidence per claim (cite artifact store path).
- Explicit blocker when waiting on human input.
- Phase sequence tracker: `[Phase X/Y] {phase} → {role} → {status}`.
- Visible progress tracker: `{slice current}/{slice total}` + tasks completed/pending.
```

### 5.10 swarm-reviewer (SDD Verify Mode — Adversarial Review)

```markdown
# Swarm Reviewer — SDD Verify / Adversarial Review Mode

You are a CODE REVIEWER and ADVERSARIAL VALIDATOR in a visible swarm.

## Rules
- Do NOT write production code. You MAY suggest fixes but the coder implements them.
- Focus on: correctness, edge cases, security, performance, maintainability.
- Read the spec scenarios as your acceptance criteria.
- Read the design decisions as your constraints.
- Return a structured verdict, not opinions.

## SDD Verify Contract
When the director assigns verification for a named change:
1. Read the apply-progress and the code diff.
2. Map each spec scenario to the implementation evidence.
3. Check: Are tests present? Do they cover the scenarios?
4. Check: Does the implementation match the design decisions?
5. Return:
   - Verdict: PASS / PASS_WITH_WARNINGS / FAIL
   - Issues grouped: CRITICAL / WARNING / SUGGESTION
   - For each CRITICAL: explain WHY it's wrong and WHAT the correct approach is.
   - Spec compliance matrix (scenario → implemented? → tested?)

## Reactivation Contract
If you receive a new review directive while running:
- Read existing verify-report for this change.
- Review only the NEW or CHANGED code since your last review.
- Append new findings and re-persist.

## Anti-patterns
- Do NOT implement fixes (report them)
- Do NOT skip reading the spec
- Do NOT approve without checking test coverage
```

### 5.11 swarm-auditor (SDD Archive Mode)

```markdown
# Swarm Auditor — SDD Archive Mode

You are a DOCUMENTATION AUDITOR and ARCHIVER in a visible swarm.

## Rules
- Do NOT write production code.
- Verify that all SDD artifacts exist and follow conventions.
- Ensure the archive report is complete and accurate.

## SDD Archive Contract
When the director assigns archiving for a named change:
1. Verify all required artifacts exist:
   - proposal, spec, design, tasks, apply-progress, verify-report
2. Check format compliance:
   - openspec: correct directory structure, naming conventions
   - engram: correct topic_keys, types, content format
3. Produce archive report:
   - Summary of what was built
   - Files changed
   - Issues found during verification
   - Final status: ARCHIVED / INCOMPLETE
4. Persist: topic_key `sdd/{change-name}/archive-report`

## Reactivation Contract
If you receive a new audit directive while running:
- Read existing archive-report.
- Update based on new artifacts or corrections.
- Re-persist.

## Anti-patterns
- Do NOT modify artifacts (report non-compliance instead)
- Do NOT skip verification steps
```

---

## 5.7 Fases Pequeñas y Checkpoints

Las fases pequeñas son el control principal de calidad del swarm visible.

### Reglas de oro

1. **Cada fase es una unidad autocontenida**: el agente recibe exactamente lo necesario para esa slice.
2. **Implementaciones grandes se cortan por slices**: Phase 1, Phase 2, Phase 3, con objetivo y salida claros.
3. **El director no asigna cambios excesivamente grandes**: si una slice no se puede verificar fácilmente, todavía está mal cortada.
4. **Cada cierre de fase deja checkpoint explícito**: estado, tareas completadas, tareas pendientes, blocker y artifact actualizado.

---

## 5.8 Context Manager (Viable con la arquitectura actual)

**Problema**: Actualmente no hay un componente que, antes de lanzar un agente en una fase, le inyecte SOLO los artefactos relevantes.

**Solución**: Un `ContextManager` (lógica en `swarmControl.js` o módulo separado) que:
- Dado `(changeName, phase, role)`, resuelva qué artefactos necesita ese rol.
- Priorice `artifact store + last phase summary + tasks_assigned`, en vez de pasar historial completo.
- Interpole las variables `{{change_name}}`, `{{phase}}`, `{{phase_slice}}`, `{{artifact_store}}`, `{{progress_summary}}`, etc.
- Se apoye en un **mission context SDD** persistido en SQLite para saber qué fase está activa y qué slice está asignada.

**Campos mínimos del mission context SDD**:
- `change_name`
- `current_phase`
- `phase_status`
- `tasks_assigned`
- `artifact_store`
- `last_phase_summary`
- `last_artifact_ref`

---

## 5.9 Seguimiento Visible por Fase

El swarm necesita dejar trazabilidad operativa por fase, no solo artifacts finales.

Cada fase debe reportar:
- `status`: `waiting | running | blocked | completed`
- `current_phase`
- `current_slice`
- `tasks_completed`
- `tasks_pending`
- `blocker_summary`
- `updated_artifact_ref`

El director usa este estado para decidir si continúa, replanifica o pide intervención humana.

---

## 6. Continuidad Operativa y Reactivación (Follow-up, No Bloqueante)

La continuidad entre fases es importante, pero **no es el fundamento de este plan**.

### 6.1 Decisión de Diseño

- El rollout inicial NO depende de resolver `--session` como requisito previo.
- El handoff entre fases se apoya primero en artifacts + summaries + estado persistido.
- Si más adelante se implementa reactivación real por sesión, debe reutilizar el binding existente al `opencode_session_id` real y no redefinir el ownership del plan.

### 6.2 Qué sí se deja especificado

- Reutilizar el canal de continuidad disponible cuando exista.
- Mantener `status`, `phase`, `slice`, `progress` y `artifact_ref` listos para relanzar o continuar.
- Evitar que la continuidad dependa de memoria implícita del proceso; debe depender del estado persistido del change.

---

## 7. Variables e Interpolación

El director construye prompts dinámicamente con estas variables:

| Variable | Fuente | Uso |
|----------|--------|-----|
| `{change-name}` | DevHub task / SDD artifact | Identificador del cambio |
| `{phase}` | Director (explore, propose, spec, design, apply, verify, archive) | Qué fase SDD ejecutar |
| `{phase-slice}` | Director | Slice concreta asignada en esta fase |
| `{artifact-store}` | Config del proyecto (engram/openspec/hybrid) | Dónde leer/escribir |
| `{previous-summary}` | Último return del agente | Handoff en reactivación |
| `{tasks-assigned}` | Tasks artifact | Qué tasks tocar (para coder) |
| `{progress-summary}` | Último checkpoint persistido | Estado acumulado visible |
| `{strict-tdd}` | Testing capabilities cache | Activar TDD o no |
| `{workspace-path}` | Worktree real del agente | CWD para tmux |

El `buildLaunchCommand` en `health/route.js` debe interpolar estas variables en el prompt base del rol.

---

## 8. Cambios en el Sistema de Lanzamiento

### 8.1 Contrato Base del Swarm Visible

- Garantizar que cada rol visible se lance con el perfil swarm correcto.
- Verificar que el runtime use efectivamente ese perfil como agente principal visible.
- Mantener `buildRoleAgentProfile` como fuente de mapeo rol → perfil.

### 8.2 `health/route.js` — Contexto de Fase

- Pasar al prompt inicial el contexto SDD mínimo: `changeName`, `phase`, `phaseSlice`, `artifactStore`, `tasksAssigned`, `progressSummary`.
- Persistir el estado operativo por fase al momento del launch y en cada checkpoint.
- Mantener la continuidad de sesión como follow-up, no como dependencia para esta parte.

### 8.3 SQLite — Mission Context SDD

- Agregar un contexto SDD de misión para guardar fase activa, slice actual, artifact store y último resumen.
- Permitir que director, coder, qa y reviewer lean el mismo estado operativo sin depender del historial del prompt.

### 8.4 `swarmControl.js` — Contrato de Ownership

- Mantener el mapeo actual de roles a perfiles.
- Agregar el mapeo explícito de rol → fase SDD principal en la capa de control.
- Usar ese mapeo para construir prompts, badges y checkpoints.

### 8.5 Reactivación por Sesión (Opcional, Posterior)

- Si se implementa, debe apoyarse en el binding real de OpenCode ya existente.
- No debe redefinir el diseño de ownership ni el flujo de phase slices.

---

## 9. Representación en la UI (DevHub)

### 9.1 Vista Swarm (terminales)

Cada rol debe tener su propio panel/terminal visible:

- `explorer` — fase actual: "Exploring" / "Idle" / "Blocked"
- `architect` — fase actual: "Proposing" / "Specifying" / "Designing" / "Idle"
- `coder` — fase actual: "Applying slice 2/4" / "Idle"
- `qa` — fase actual: "Verifying" / "Idle"
- `director` — coordinación

### 9.2 Badge de fase SDD

Cada terminal muestra un badge con:
- Nombre de la fase SDD activa (explore, propose, spec, design, apply, verify, archive)
- Nombre del change
- Slice actual (ej: `2/4`)
- Progreso (ej: `3/7 tasks`)
- Estado (`waiting`, `running`, `blocked`, `completed`)

### 9.3 Acciones por terminal

- **Continue / Reactivate**: enviar la siguiente slice o relanzar el rol con el estado persistido disponible.
- **View artifacts**: abrir el artifact store (engram/openspec) del change asignado.
- **Kill**: terminar sesión tmux (con confirmación).

---

## 10. Fases de Implementación (Actualizadas con Mapeo Completo)

### Milestone 1: Contrato Base del Swarm Visible

- Tarea 1.1: Formalizar el ownership rol → fase SDD en la capa de control (`director/init+tasks`, `architect/propose+spec+design`, `coder/apply`, `qa+reviewer/verify`, `auditor/archive`).
- Tarea 1.2: Verificar que el swarm visible se lance con el perfil correcto por rol y que ese perfil sea el contrato real del agente visible.
- Tarea 1.3: Agregar mission context SDD en SQLite: `change_name`, `current_phase`, `phase_status`, `tasks_assigned`, `artifact_store`, `last_phase_summary`, `last_artifact_ref`.
- Tarea 1.4: Dejar la continuidad por sesión como follow-up, no como dependencia de este milestone.

### Milestone 2: Prompts Rediseñados y Ownership SDD

- Tarea 2.1: Rediseñar `swarm-director.md` con ownership fijo, slicing operativo, decision points y progress contract.
- Tarea 2.2: Rediseñar `swarm-explorer.md` para `sdd-explore` con handoff estructurado.
- Tarea 2.3: Rediseñar `swarm-architect.md` para `sdd-propose`, `sdd-spec` y `sdd-design`.
- Tarea 2.4: Rediseñar `swarm-coder.md` para ejecutar solo la slice asignada y devolver checkpoint claro.
- Tarea 2.5: Rediseñar `swarm-qa.md` y `swarm-reviewer.md` para `verify` funcional + adversarial, sin ownership del spec.
- Tarea 2.6: Rediseñar `swarm-auditor.md` y `swarm-devops.md` para archive/runtime hygiene sin sobrecargar fases que no les pertenecen.

### Milestone 3: Context Manager + Phase Slices

- Tarea 3.1: Crear módulo `ContextManager` en `swarmControl.js` o archivo separado.
- Tarea 3.2: Implementar `build({ changeName, phase, role, artifactStore, phaseSlice })` que resuelva artifacts relevantes por rol.
- Tarea 3.3: Implementar interpolación de variables `{{change_name}}`, `{{phase}}`, `{{phase_slice}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}`, `{{tasks_assigned}}`, `{{progress_summary}}`.
- Tarea 3.4: Implementar phase summaries entre fases para que el director pueda continuar o replanificar sin pasar historial completo.
- Tarea 3.5: Hacer que `sdd-tasks` produzca slices pequeñas y que el director las despache una por una, con notificación visible de progreso.

### Milestone 4: Seguimiento Visible en DevHub

- Tarea 4.1: Badge de fase SDD por terminal (explore, propose, spec, design, apply, verify, archive, idle).
- Tarea 4.2: Visualización de progreso por slice (`slice X/Y`) y tasks completadas / pendientes.
- Tarea 4.3: Visualización de estado del agente (`waiting`, `running`, `blocked`, `completed`) con summary corto.
- Tarea 4.4: Acción `Continue / Reactivate` por terminal usando el estado persistido disponible.
- Tarea 4.5: Vista de artifacts ligada al change activo del agente.

### Milestone 5: Integración de Worktrees y Runtime Hygiene

- Tarea 5.1: Mantener worktrees por rol como aislamiento base.
- Tarea 5.2: Usar integration worktree solo para multi-writer o revisión de integración, no como handoff por defecto entre fases.
- Tarea 5.3: Implementar cleanup automático de worktrees post-archive en `swarm-devops`.
- Tarea 5.4: Documentar explícitamente que artifacts + summaries son el handoff principal del flujo.

### Milestone 6: Modelos, Strict TDD y Continuidad Posterior

- Tarea 6.1: Asegurar que `sdd-init` y el director dejen explícitas las testing capabilities y la política de strict TDD.
- Tarea 6.2: Asegurar que `swarm-coder` y `swarm-qa` respeten strict TDD cuando esté activo.
- Tarea 6.3: Revisar si conviene unificar aliases de modelo o mantener política por rol; no bloquear el rollout por esta decisión.
- Tarea 6.4: Si luego se necesita continuidad por sesión, implementarla reutilizando el binding real existente de OpenCode.

---

## 11. Riesgos y Mitigaciones (Actualizados)

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Ownership inconsistente entre documento, prompts y runtime | Alto | Definir una sola tabla canónica rol → fase y reutilizarla en prompts, UI y capa de control. |
| Una slice sigue siendo demasiado grande | Alto | El director debe rebanar antes de despachar; si no se puede verificar fácil, todavía no está bien cortada. |
| Dos directores mandan al mismo agente | Medio | Lease/lock por sesión (`agent_presence` o campo `status` en DB). Agente rechaza mensajes mientras `running`. |
| Mission context SDD desactualizado | Alto | Persistir checkpoints por fase y hacer del director el único writer del estado operativo de slicing. |
| Worktrees acumulan basura | Medio | Cleanup automático en `swarm-devops` tras `sdd-archive` completado. |
| Contexto operativo se pierde entre fases | Alto | Handoffs explícitos del director entre fases. El agente NO depende de memoria implícita; depende de artifacts + summaries + estado persistido. |
| Se introduce merge entre worktrees demasiado pronto | Medio | Mantener artifacts como handoff principal e integration worktree solo cuando realmente haya múltiples writers. |
| Prompts legacy con bloqueo SDD persisten | Bajo | Script de validación que grepee `"Do NOT start SDD"` en todos los prompts swarm y falle CI si encuentra coincidencias. |

---

## 12. Criterios de Aceptación (Actualizados)

- [ ] El `swarm-coder` puede recibir un task con SDD context y seguir el flujo sdd-apply (leer specs, design, tasks; implementar; persistir progress).
- [ ] El `swarm-director` puede disparar secuencia completa: `sdd-init` → `sdd-explore` → `sdd-propose` → `sdd-spec` → `sdd-design` → `sdd-tasks` → `sdd-apply` → `sdd-verify` → `sdd-archive`.
- [ ] El `swarm-architect` puede producir proposal, spec y design sin ambigüedad de ownership.
- [ ] La vista DevHub muestra qué fase SDD ejecuta cada agente, su estado, su slice actual y el progreso de tasks.
- [ ] Los prompts actualizados no contienen "Do NOT start SDD workflows" ni bloqueos equivalentes.
- [ ] El `ContextManager` inyecta SOLO los artifacts relevantes a cada rol, más el último progress summary y la slice asignada.
- [ ] El `swarm-director` ejecuta `sdd-init` al primer uso y detecta testing capabilities + strict TDD.
- [ ] El `swarm-qa` valida contra spec/design/tasks y deja verify-report con compliance matrix por slice o por fase.
- [ ] El `swarm-auditor` ejecuta `sdd-archive` verificando formato de todos los artifacts.
- [ ] Implementaciones grandes se dividen en múltiples phase slices con checkpoint visible entre una y otra.
- [ ] Los worktrees se usan como aislamiento por rol y el integration worktree aparece solo cuando hace falta integración real.
- [ ] La continuidad por sesión puede agregarse después sin obligar a rediseñar ownership, milestones ni handoffs del plan.

---

## 13. Diferencias con Plyrium Legacy (Documentación vs Código Real)

> **Nota importante**: Las documentaciones 28, 29 y 13 (`Plyrium-style`, `Swarm_Autonomo_v2`) están marcadas como legacy/parcial. El análisis de este documento se basa **exclusivamente en el código fuente real** verificado por sub-agentes exploradores.

| Aspecto | Documentación Legacy (Vieja) | Código Real (Verificado) |
|---------|------------------------------|--------------------------|
| **Worktrees** | Se mencionaban como "metadata" o se sugería compartirlos | Creados realmente vía `git worktree add`. Por rol, aislados, con rama propia (`devhub/swarm/{launchId}/{roleKey}`) |
| **Sesiones** | No se mencionaba reactivación | `sessionId` es artificial local (`{launchId}-{roleKey}-session`). NO usa `--session` de OpenCode. Headless consumer descubre `opencode_session_id` real vía SSE |
| **Modelo ejecución** | Descrito como "swarm paralelo" o "agentes independientes" | Un solo servidor OpenCode (puerto 4154, singleton). Agentes en tmux, no procesos OS separados. Supervisor es `setInterval` in-process. Secuencial (`director_first` con delay 4s) |
| **Contexto** | No se detallaba | DB SQLite (`swarm_missions`, `mission_messages`) + Engram (MCP proxy) + Prompts inyectados (`buildLaunchPrompt`). NO hay filesystem compartido |
| **Prompts swarm** | No se mencionaban | 8 prompts estáticos .md, varios con bloqueo SDD explícito o condicional, ninguno con variables de interpolación |

**Conclusión**: El código real ya tiene una base sólida (worktrees reales, DB de contexto y swarm visible por rol). Lo que falta como base del plan es: (1) fijar ownership SDD coherente, (2) quitar bloqueos SDD, (3) agregar mission context + Context Manager, (4) operar por phase slices con progreso visible, y (5) usar artifacts como handoff principal. La continuidad por sesión queda como follow-up posible, no como fundamento.

---

## 14. Prompts Rediseñados (Resumen de Contratos)

| Rol | Contrato SDD Principal | Input | Output | Variables |
|-----|----------------------|-------|--------|-----------|
| `swarm-director` | Orquestación + `sdd-init` + `sdd-tasks` | Mission, fases disponibles, estados de agentes, mission context | Phase assignments, slices, checkpoints, handoffs | `{{change_name}}`, `{{phase}}`, `{{phase_slice}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{progress_summary}}` |
| `swarm-explorer` | `sdd-explore` | Tema/feature a investigar | Exploration artifact (Current State, Approaches, Recommendation) | `{{change_name}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}` |
| `swarm-architect` | `sdd-propose` + `sdd-spec` + `sdd-design` | Exploration, change context, proposal/spec previos | proposal.md, spec.md, design.md | `{{change_name}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}`, `{{progress_summary}}` |
| `swarm-coder` | `sdd-apply` | Specs, design, tasks, slice asignada | Código modificado, apply-progress, checkpoint de slice | `{{change_name}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}`, `{{tasks_assigned}}`, `{{phase_slice}}` |
| `swarm-qa` | `sdd-verify` | Spec, design, tasks, apply-progress | verify-report, compliance matrix, estado de slice validada | `{{change_name}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}`, `{{progress_summary}}` |
| `swarm-reviewer` | `sdd-verify` (adversarial) | Diff, specs, design | Verdict, spec compliance matrix | `{{change_name}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}` |
| `swarm-auditor` | `sdd-archive` | Todos los artifacts SDD | Archive report, specs actualizados | `{{change_name}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}` |
| `swarm-devops` | Soporte infraestructura | Worktrees, misiones activas | Cleanup, integration worktree cuando haga falta | `{{change_name}}`, `{{artifact_store}}`, `{{mission_id}}`, `{{workspace_path}}` |

---

*Documento 43 — Swarm SDD Integration Design*
*Autor: Gentle AI Orchestrator*
*Fecha: 2026-05-29*
*Revisión: 3 (ownership SDD corregido, phase slices, milestones reordenados y continuidad por sesión relegada a follow-up)*

# Implementation log — ZED Orchestrator Pod

## 2026-06-10 — Fase 1 (foundation)

### Entregado

- Documentación: `README.md`, `ARCHITECTURE.md`, `LAUNCHPAD.md`, `PROMPT-CONTRACT.md`
- Perfil OpenCode `zed-orchestrator` en `opencode.json` + prompt `docs/prompts/swarm/zed-orchestrator-v1.md`
- Plantilla launchpad `zed-orchestrator-pod` (featured, categoría `orchestration`)
- Team `zed-sdd-pod`, swarm type `zed-orchestration-swarm`
- Bootstrap mode `standby`
- Mapeo roles:
  - `zed` → `zed-orchestrator`
  - `sdd_worker_*` → `gentle-orchestrator` (sin perfiles SDD nuevos)
- Launch prompts standby en `health/route.js`
- Modal `SwarmLaunchWizardModal`: UI destacada, selector workers 1–4, sin toggle SDD en plantilla ZED

### Fase 2 — fixes y alineación (2026-06-10)

- `findRecordById`: ya no devuelve el primer bootstrap mode cuando el id es `null` (evitaba que recovery/custom drafts heredaran `standby` de ZED).
- `resolveRosterStatus`: restaurado mapeo `quota-blocked` y `stale-registry` desde runtime diagnostics.
- `SwarmControl.jsx`: orden de hooks corregido (`handleTerminateSwarmLaunch` antes de `handlePrimaryAction`).
- `TerminalWorkspacesManager.jsx`: layout de launch usa `isOrchestratorRoleKey` (ZED o director).
- Tests `swarmControl.test.js`: catálogo con ZED pod en `templates[1]` cuando recovery es recomendado.

### Fase 3 — qa_ready + dock + E2E (2026-06-10)

- `src/lib/taskStatuses.js` — enum canónico con `qa_ready`
- Kanban `Tareas.jsx`: columna **Pendiente revisión** entre En Progreso y Bloqueada
- API `src/app/api/tasks/route.js` + DevHub MCP `update_task` / `list_tasks`:
  - `qa_ready` requiere `[git:checkpoint]` (handoff `qa-ready`)
  - `completed` desde `qa_ready` no exige segundo checkpoint (cierre humano post-prueba)
- Dashboard / Historial: stats y filtros para `qa_ready`
- `docs/prompts/asistente/zed-system-prompt.md`: sección ZED Orchestrator Pod
- `buildZedAmbientStatus` + `delegation.js`: perfiles `zed-orchestrator` / `gentle-orchestrator`
- E2E: `tests/e2e/zed-orchestrator-pod.spec.ts`
- MCP integration tests: `qa_ready` handoff en `devhub-mcp/tests/integration/tasks.test.js`

### Fase 4 — SwarmControl.test.jsx (2026-06-11)

- Helpers de test: `wrapFetchMock` (ignora `/api/agenthub/operators/timeline`), `findWizardButtonForTemplate`, `findFetchCallByAction`
- 13 tests corregidos tras ZED pod como plantilla recomendada idle
- **40/40 PASS** en `src/views/__tests__/SwarmControl.test.jsx`

### Fase 5 — cierre 100% (2026-06-11)

- `getFilterPillChromeStyle` exportado en `Tareas.jsx` — **5/5 PASS** `Tareas.test.jsx`
- `getSwarmControlChromeStyles` exportado en `SwarmControl.jsx` — **2/2 PASS** `SwarmControl.chrome.test.js`
- Health GET expone `launch_catalog` derivado de `selectSwarmLaunchCatalog`
- E2E ampliado: `tests/e2e/zed-orchestrator-pod.spec.ts` — **4/4 PASS** (API catalog + UI launchpad + wizard standby)
- MCP integration tasks: **19/19 PASS** (incl. `qa_ready` → `completed`)
- Suite Jest ZED-related: **109/109 PASS**
- Manual QA: checklist en `MANUAL-QA.md` (pasos operador: launch real, delegación, prueba funcional)

### Estado final

**Implementación automatizada: 100% verde.** Queda validación manual en terminales reales (OpenCode + perfiles) según `MANUAL-QA.md`.

### Decisiones

- Workers **no** reciben perfiles `swarm-*` ni SDD custom: solo `gentle-orchestrator`.
- ZED **no** ejecuta SDD; delega changes y usa MCP + bus.
- Plantilla recomendada por defecto cuando control room idle: `zed-orchestrator-pod`.

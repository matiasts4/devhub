# Architect Handoff — Swarm Delivery Init

**Date**: 2026-05-23
**Architect**: OpenCode (DeepSeek V4 Flash)
**Workspace**: `/home/matias/ArxonLabs/devhub`
**Mission**: Launch swarm feature delivery (Director / Coder / Auditor / DevOps / Architect)

---

## 1. Workspace Validation

| Check | Result |
|-------|--------|
| DB local_path | `/home/matias/devhub` — **DOES NOT EXIST** |
| Real source path | `/home/matias/ArxonLabs/devhub` ✅ |
| Sidecar | PID 1536246, port 4000, running from `/home/matias/ArxonLabs/devhub/sidecar-backend/server.js` ✅ |
| Git remote | `git@github-matiasts4:matiasts4/devhub.git` ✅ |
| Branch state | 13 branches: main + 12 feature/task/agent branches |
| Active branch | `task/2a14962d-swarm-control-panel-polish` (current worktree) |

**Action required**: DB `local_path` must be corrected to `/home/matias/ArxonLabs/devhub`. MCP tool `devhub_update_project` does NOT expose `local_path` — needs DB patch or MCP schema update.

---

## 2. Project State

- **80/80 tasks** completed
- **12/13 milestones** completed
- Milestone [DESKTOP-4] "Empaquetado y Distribución Linux" marked `in_progress` but **all its tasks are done** — status gap
- **0 pending tasks** available for swarm

**Implication**: Swarm delivery cannot run on existing task queue. Needs either:
(a) New sprint planning cycle to define next feature
(b) Close [DESKTOP-4] milestone, assess remaining work

---

## 3. Documentation Base

40 files in `/docs/` (00–17 series):
- `00_Guia_Maestra.md` — Master guide
- `02_Arquitectura_Sistema.md` — System architecture
- `03_Esquema_BaseDatos.md` — Database schema
- `08_Enjambre_Agentes_y_Orquestacion.md` — Swarm orchestration
- `09_Desktop_App.md` — Desktop Tauri app design
- `17_Produccion_Seguridad_y_Distribucion.md` — Production/distribution

Plus: `AGENTS.md` (DevHub), `AGENTS.md` (ArxonLabs workspace), `CODEBASE_AUDIT_REPORT.md`

**Verdict**: Well-documented project. Docs 08, 09, 10, 12, 13, 14, 15, 16, 17 are directly relevant to swarm delivery.

---

## 4. Knowledge Graph (Graphify)

- **8551 nodes** · **10748 edges** · **1783 communities**
- Extraction: 100%, inferred: 0%
- **Stale**: Last built 2026-04-29 (24 days ago)
- **Wiki empty**: 0/1783 community files rendered

**Action**: Rebuild graph after swarm work completes: `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`

---

## 5. Architectural Boundaries & Constraints

### 5.1 Stack
- **Frontend**: Next.js (v16.2.4), React
- **Backend**: Node.js sidecar (Express, WebSocket, node-pty)
- **Desktop**: Tauri v2 (WebKit2GTK)
- **DB**: SQLite (standalone) / Supabase (multi-user)
- **MCP**: Custom devhub-mcp server
- **CI**: GitHub Actions

### 5.2 Architecture Pattern
- **Backend-for-Frontend (BFF)**: Next.js API routes + Node sidecar
- **Sidecar pattern**: Tauri shell → Node sidecar → MCP + PTY
- **Message flow**: UI → Next.js API → MCP server → Git/filesystem
- **Persistence**: SQLite primary (local), Supabase optional (multi-user)

### 5.3 Key Constraints
1. **Tauri + Next.js SSR conflict resolved** by running Next.js in server mode (not static export), Tauri pointing to `localhost:3000`
2. **node-pty sidecar** detaches from Tauri window lifecycle (survives window close)
3. **Git isolation**: Agents work on separate branches (never push to main directly)
4. **No circular deps** allowed — dependency graph is a DAG
5. **Prompt-first**: Each agent task carries a pre-built prompt with file context

### 5.4 Current Technical Debt
- `local_path` drift (see §1)
- `[DESKTOP-4]` milestone status gap (see §2)
- Graphify wiki not rendered (see §4)
- `feature/browser-native-gtk-spike` branch may contain unmerged spike code

---

## 6. Swarm Delivery Recommendations

For the next feature delivery cycle, recommended scope (from docs/ context):
1. **Close [DESKTOP-4] milestone** (all tasks done anyway)
2. **Fix workspace path** in DevHub DB directly
3. **Run new planning** (SDD cycle: propose → spec → tasks → apply → verify → archive)
4. Candidate next feature areas (from existing docs):
   - Desktop auto-update (Tauri updater)
   - Agent memory visualization UI
   - Swarm execution dashboard polish
   - Multi-workspace agent routing

---

## 7. Evidence Log

| Evidence | Location |
|----------|----------|
| Workspace file structure | `/home/matias/ArxonLabs/devhub/` |
| Sidecar PID + port | `sidecar.pid` / `sidecar-port.txt` |
| DevHub project | ID `5e4330dc-c603-45f1-b466-ccfb4fc0308c` |
| Git remote/branches | `git remote -v`, `git branch` |
| Architecture docs | `/docs/02_Arquitectura_Sistema.md` |
| Graphify graph | `graphify-out/GRAPH_REPORT.md` |
| Active workers history | `.devhub/active_workers.json` |
| Engram (architecture) | `obs-e7c7a42e15776750` |
| Engram (workspace drift) | `obs-0381a7d4a51c4967` |
| DevHub task comment | `c1ec007a-81da-4860-a1a1-5fc08298fad2` |

---

**Handoff to Director**: Workspace validated, architecture boundaries documented, 3 gaps identified (path drift, milestone status, empty graph wiki). No pending tasks exist — next step is sprint planning or milestone closure before agent dispatch.

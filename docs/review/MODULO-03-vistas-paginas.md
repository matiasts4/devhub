# Módulo 3: Vistas/Páginas — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Total de vistas:** 14
> **Hallazgo principal:** 2 vistas muertas, archivos de 1,640 líneas, duplicación masiva

---

## 💀 Vistas Muertas

| Vista           | Líneas | Qué hace                           | Razón                                  |
| --------------- | ------ | ---------------------------------- | -------------------------------------- |
| `Dashboard.jsx` | 228    | Dashboard de métricas del proyecto | Reemplazado por `ProjectDashboard.jsx` |
| `Proyectos.jsx` | 122    | Lista estática con datos FAKE      | Reemplazado por `ProjectHub.jsx`       |

**Total: 350 líneas de código muerto**

---

## 📊 Vistas Vivas (12 vistas)

| Vista                  | Líneas | Importada por | Estado                            |
| ---------------------- | ------ | ------------- | --------------------------------- |
| `AgentHub.jsx`         | 1,507  | `App.js`      | ⚠️ Crítico — demasiado grande     |
| `SwarmControl.jsx`     | 1,640  | `App.js`      | ⚠️ Crítico — demasiado grande     |
| `Ajustes.jsx`          | 1,116  | `App.js`      | ⚠️ Alto — duplicado con /settings |
| `Tareas.jsx`           | 999    | `App.js`      | ⚠️ Alto — debería splittearse     |
| `Scaffolding.jsx`      | 802    | `App.js`      | ⚠️ Medio                          |
| `ProjectHub.jsx`       | 708    | `App.js`      | ⚠️ Medio                          |
| `Conexiones.jsx`       | 700    | `App.js`      | ⚠️ Medio                          |
| `Roadmap.jsx`          | 609    | `App.js`      | ✅ Aceptable                      |
| `ProjectDashboard.jsx` | 567    | `App.js`      | ✅ Aceptable                      |
| `Historial.jsx`        | 515    | `App.js`      | ✅ Aceptable                      |
| `TelegramMonitor.jsx`  | 359    | `App.js`      | ✅ Bien                           |
| `CodeEditor.jsx`       | 374    | `App.js`      | ✅ Bien                           |

---

## 🔴 Archivos Críticos por Tamaño

### 1. `SwarmControl.jsx` — 1,640 líneas

**Debe splittearse en al menos 6-8 archivos:**

| Extracto                        | Líneas estimadas |
| ------------------------------- | ---------------- |
| `useSessionStream` hook         | ~150             |
| `MiniTraceSummary` component    | ~80              |
| `LiveAgentCard` component       | ~120             |
| `ExpandedTracePanel` component  | ~120             |
| Agrupamiento y lógica de estado | ~300             |
| Fetch functions (10+)           | ~400             |
| JSX principal y layout          | ~470             |

**Issues:**

- 3 mecanismos de tiempo real simultáneos: SSE + Supabase Realtime + polling
- `opencodePort` lee env vars y hace HTTP directo bypassando API proxy
- `agent_registry` fetch legacy marcado como "backwards compat" pero corre en cada mount
- Buena accesibilidad: `aria-label`, `role="status"`, `aria-live`

### 2. `AgentHub.jsx` — 1,507 líneas

**Debe splittearse en al menos 4-5 archivos:**

| Extracto                                     | Líneas estimadas |
| -------------------------------------------- | ---------------- |
| Chat logic (handleSend, handleSendInjection) | ~400             |
| Sub-agent SSE streaming + RAF loop           | ~300             |
| Trace management                             | ~200             |
| Permission handling                          | ~100             |
| MCP panel + command palette                  | ~200             |
| Keyboard shortcuts + onboarding              | ~100             |
| Message editing + regeneration               | ~100             |
| JSX principal                                | ~107             |

**Issues:**

- `handleSendInjection` recursivo desde `parseAndExecuteCommands` — riesgo de loop infinito
- RAF loop corre a 60fps constante aunque no haya sub-agentes activos — desperdicia CPU
- `showOnboarding` state se setea pero nunca se activa a `true` — dead state
- `outputViewer` state se crea pero `setOutputViewer` nunca se llama — dead state
- Múltiples `useEffect` con `eslint-disable-line` — missing dependencies
- Sin error boundary — crash trae abajo todo el workspace

### 3. `Ajustes.jsx` — 1,116 líneas

**Issues:**

- **DUPLICACIÓN con `/settings` de Next.js** — Ajustes tiene tabs de theme y LLM que overlap con `/settings/appearance` y `/settings/llm-providers`
- `appConfig` state (autosave, notifications, confirmActions) nunca se persiste — cambios se pierden al refresh
- `deleteProject()` NO borra `agent_hub_sessions`, `agent_hub_messages`, `task_dependencies`, `mcp_connections` — datos huérfanos
- `handleSelectFolder` usa `@tauri-apps/plugin-dialog` — no funciona en modo web
- `supabase` creado dentro del componente (línea 315) — re-creado en cada render

---

## 🔄 Duplicación Detectada

### Dashboard views

| Vista                  | Estado    | Overlap                                                |
| ---------------------- | --------- | ------------------------------------------------------ |
| `Dashboard.jsx`        | 💀 Muerta | Task stats, progress bars, upcoming tasks              |
| `ProjectDashboard.jsx` | ✅ Activa | Task stats, progress bars, upcoming tasks + prediction |

### Project listing

| Vista            | Estado    | Overlap                                |
| ---------------- | --------- | -------------------------------------- |
| `Proyectos.jsx`  | 💀 Muerta | Project cards con datos fake           |
| `ProjectHub.jsx` | ✅ Activa | Project cards con datos reales + stats |

### Settings

| Sistema                          | Estado    | Overlap                        |
| -------------------------------- | --------- | ------------------------------ |
| `Ajustes.jsx` (React Router)     | ✅ Activa | Theme selection, LLM providers |
| `/settings` (Next.js App Router) | ✅ Activa | Appearance, LLM providers      |

### Task stats (computados en 3 lugares)

| Vista                  | Qué calcula                            |
| ---------------------- | -------------------------------------- |
| `ProjectDashboard.jsx` | Total, completed, in_progress, blocked |
| `Historial.jsx`        | Total, completed, blocked, in_progress |
| `Tareas.jsx`           | Total, completed, in_progress, blocked |

### Milestone data (fetch en 3 lugares)

| Vista                  | Qué hace                    |
| ---------------------- | --------------------------- |
| `ProjectDashboard.jsx` | Muestra "next milestone"    |
| `Roadmap.jsx`          | CRUD de milestones          |
| `Tareas.jsx`           | Filtra tareas por milestone |

---

## 🐛 Bugs y Issues por Vista

| Vista                  | Issue                                                  | Severidad   |
| ---------------------- | ------------------------------------------------------ | ----------- |
| `AgentHub.jsx`         | RAF loop 60fps constante sin sub-agentes activos       | 🟡 Media    |
| `AgentHub.jsx`         | `handleSendInjection` recursivo — riesgo loop infinito | 🟡 Media    |
| `AgentHub.jsx`         | `showOnboarding` y `outputViewer` states muertos       | 🟢 Baja     |
| `Ajustes.jsx`          | `appConfig` nunca se persiste                          | 🟡 Media    |
| `Ajustes.jsx`          | `deleteProject()` deja datos huérfanos                 | 🟡 Media    |
| `Ajustes.jsx`          | Tauri dialog no funciona en web mode                   | 🟡 Media    |
| `CodeEditor.jsx`       | Es read-only pero se llama "CodeEditor"                | 🟢 Baja     |
| `CodeEditor.jsx`       | `expanded` default asume directorio `src`              | 🟢 Baja     |
| `Conexiones.jsx`       | Dos instancias de `createClient()` (padre + modal)     | 🟢 Baja     |
| `Conexiones.jsx`       | Delete sin confirmación                                | 🟡 Media    |
| `Dashboard.jsx`        | 💀 DEAD — no se importa                                | 🔴 Eliminar |
| `Dashboard.jsx`        | Fallback `'E-commerce V2'` hardcodeado                 | 🟢 Baja     |
| `Historial.jsx`        | CSV export no escapa comas en títulos                  | 🟡 Media    |
| `Historial.jsx`        | `groupByMonth` produce "Invalid Date" si faltan fechas | 🟡 Media    |
| `ProjectDashboard.jsx` | `calculatePrediction()` corre en cada render           | 🟡 Media    |
| `ProjectDashboard.jsx` | Comentario menciona "Chat" pero no hay chat            | 🟢 Baja     |
| `ProjectHub.jsx`       | Navega a `/planning` que no existe                     | 🟡 Media    |
| `ProjectHub.jsx`       | FileReader síncrono para uploads grandes               | 🟡 Media    |
| `Proyectos.jsx`        | 💀 DEAD — datos 100% fake                              | 🔴 Eliminar |
| `Roadmap.jsx`          | `toggleComplete` salta estados `planned` y `at_risk`   | 🟡 Media    |
| `Roadmap.jsx`          | Delete sin confirmación                                | 🟡 Media    |
| `Scaffolding.jsx`      | Scripts via PTY — riesgo de code injection             | 🟡 Media    |
| `Scaffolding.jsx`      | Solo 3 templates hardcodeados                          | 🟢 Baja     |
| `SwarmControl.jsx`     | 3 mecanismos de realtime simultáneos                   | 🟡 Media    |
| `SwarmControl.jsx`     | `agent_registry` legacy corre en cada mount            | 🟢 Baja     |
| `Tareas.jsx`           | `selectStyles` hardcodea colores dark theme            | 🟡 Media    |
| `Tareas.jsx`           | `AgentQueueView` crea nuevo `createClient()`           | 🟢 Baja     |
| `Tareas.jsx`           | Kanban sin drag-and-drop                               | 🟢 Baja     |
| `TelegramMonitor.jsx`  | Sin UI de error si APIs fallan                         | 🟡 Media    |
| `TelegramMonitor.jsx`  | `timeAgo` asume UTC con append de 'Z'                  | 🟢 Baja     |

---

## 📋 Componentes Definidos Dentro de Vistas (deberían extraerse)

| Vista              | Componentes internos                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| `AgentHub.jsx`     | `formatMessage()` utility                                                     |
| `Ajustes.jsx`      | `Toggle`, `ThemeOptionCard`, `OnboardingWizard`, 6 tab renderers              |
| `Conexiones.jsx`   | `AddConnectionModal`                                                          |
| `Roadmap.jsx`      | `MilestoneModal`                                                              |
| `Scaffolding.jsx`  | `CardHeader` + 8 utility functions                                            |
| `SwarmControl.jsx` | `useSessionStream`, `MiniTraceSummary`, `LiveAgentCard`, `ExpandedTracePanel` |
| `Tareas.jsx`       | `TaskModal`, `StyledSelect`, `AgentQueueView`, `selectStyles`                 |

---

## 🗑️ Archivos candidatos a eliminación

| Archivo         | Líneas | Razón                                                   |
| --------------- | ------ | ------------------------------------------------------- |
| `Dashboard.jsx` | 228    | Vista muerta, reemplazada por ProjectDashboard          |
| `Proyectos.jsx` | 122    | Vista muerta con datos fake, reemplazada por ProjectHub |

**Total a eliminar: 350 líneas**

## 🔧 Fixes recomendados

### Prioridad 1 — Eliminar vistas muertas

1. **Eliminar** `Dashboard.jsx` (228 líneas)
2. **Eliminar** `Proyectos.jsx` (122 líneas)

### Prioridad 2 — Splittear archivos críticos

3. **Splittear** `SwarmControl.jsx` (1,640 → 6-8 archivos)
4. **Splittear** `AgentHub.jsx` (1,507 → 4-5 archivos)

### Prioridad 3 — Resolver duplicación

5. **Resolver** Ajustes vs `/settings` — elegir un sistema de settings
6. **Extraer** lógica de task stats a hook compartido (`useTaskStats`)
7. **Extraer** lógica de milestones a hook compartido (`useMilestones`)

### Prioridad 4 — Fixes de bugs

8. **Memoizar** `calculatePrediction()` en ProjectDashboard
9. **Agregar** confirmación de delete en Conexiones y Roadmap
10. **Fix** CSV export en Historial (escapar comas)
11. **Fix** `toggleComplete` en Roadmap (ciclo completo de estados)
12. **Persistir** `appConfig` en Ajustes (localStorage)
13. **Agregar** error boundary a AgentHub y SwarmControl

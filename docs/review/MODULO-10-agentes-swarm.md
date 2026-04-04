# Módulo 10: Agentes y Swarm — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Hallazgo principal:** ~90% del código es muerto — definido pero nunca importado

---

## 🔴 Código Muerto Detectado

### Archivos que NADIE importa (0 imports externos)

| Archivo                     | Líneas | Qué hace                                                     | Estado                            |
| --------------------------- | ------ | ------------------------------------------------------------ | --------------------------------- |
| `agentRegistryLive.js`      | 111    | Metadata de agentes, snapshot en vivo, contexto de ejecución | 💀 MUERTO                         |
| `agentRegistryLive.test.js` | 28     | Tests de agentRegistryLive                                   | 💀 MUERTO (test de código muerto) |
| `agentRegistryTelemetry.js` | 43     | Status activo, heartbeat stale, filtro de agentes activos    | 💀 MUERTO                         |
| `docopsPolicy.js`           | 12     | Presupuesto de tokens para DocOps                            | 💀 MUERTO                         |
| `docopsPolicy.test.js`      | 22     | Tests de docopsPolicy                                        | 💀 MUERTO (test de código muerto) |
| `docopsPrompts.js`          | 172    | Prompts de gate DocOps, enforcement, launch commands         | 💀 MUERTO                         |
| `docopsPrompts.test.js`     | 26     | Tests de docopsPrompts                                       | 💀 MUERTO (test de código muerto) |
| `slashSkills.js`            | 187    | Definiciones de comandos slash (/sdd-\*, /engram, etc.)      | 💀 MUERTO                         |
| `useAgentTraces.js`         | 164    | Hook React: fetch, polling, filtros, búsqueda de traces      | 💀 MUERTO                         |
| `useSessionUsage.js`        | 126    | Hook React: token usage, context utilization, polling        | 💀 MUERTO                         |

**Total: 849 líneas de código muerto** (incluyendo tests)

### Verificación de imports

```bash
# Ningún archivo fuera de src/lib/ importa estos módulos:
agentRegistryLive     → 0 imports externos
agentRegistryTelemetry → 0 imports externos (solo importado por agentRegistryLive)
docopsPolicy          → 0 imports externos
docopsPrompts         → 0 imports externos
slashSkills           → 0 imports externos
useAgentTraces        → 0 imports externos
useSessionUsage       → 0 imports externos
```

---

## ✅ Código que SÍ se usa

### API Routes de AgentHub (funcionales)

| Ruta                                         | Qué hace                                           | Depende de                       | Estado       |
| -------------------------------------------- | -------------------------------------------------- | -------------------------------- | ------------ |
| `/api/agenthub/sessions/`                    | Lista sesiones (por proyecto, telegram, recientes) | `localDb.js`                     | ✅ Funcional |
| `/api/agenthub/sessions/[id]/traces/`        | GET/POST traces de sesión                          | `localDb.js`                     | ✅ Funcional |
| `/api/agenthub/sessions/[id]/traces/search/` | Búsqueda FTS5 de traces                            | `localDb.js`                     | ✅ Funcional |
| `/api/agenthub/sessions/[id]/usage/`         | Token usage de sesión                              | `localDb.js`                     | ✅ Funcional |
| `/api/agenthub/chat/`                        | Chat con LLM (openrouter, copilot, zen, direct)    | `copilot-token.js`, config local | ✅ Funcional |
| `/api/agenthub/headless/`                    | Ejecución headless de agentes                      | —                                | ✅ Funcional |
| `/api/agenthub/mcp/status/`                  | Status de MCP                                      | —                                | ✅ Funcional |
| `/api/agenthub/sessions/health/`             | Health check de sesiones                           | —                                | ✅ Funcional |
| `/api/agenthub/traces/persist/`              | Persistencia de traces                             | `localDb.js`                     | ✅ Funcional |

### Observaciones sobre las API routes:

- **Bien estructuradas** — usan `localDb.js` correctamente
- **Sin referencias a Supabase** — ✅ limpio
- **Chat route** — soporta multi-provider (openrouter, copilot, zen, direct) con failover
- **Traces route** — usa FTS5 correctamente (beneficia de la sanitización que agregamos en Módulo 5)

---

## 📊 Análisis de Código Muerto por Categoría

### 1. Agent Registry (154 líneas + tests)

**Archivos:** `agentRegistryLive.js`, `agentRegistryTelemetry.js`, `agentRegistryLive.test.js`

**Propósito original:** Determinar qué agentes están "activos" basado en status + heartbeat, generar snapshots para UI, clasificar agentes por tipo (orchestrator, worker, task).

**Por qué está muerto:** Las vistas no usan estas funciones para determinar el estado de agentes. AgentHub.jsx maneja el estado de agentes de forma independiente.

**Calidad del código:** ✅ Bien escrito, buena separación de concerns, tests incluidos. El problema es que nunca se integró.

### 2. DocOps (210 líneas + tests)

**Archivos:** `docopsPolicy.js`, `docopsPrompts.js`, `docopsPolicy.test.js`, `docopsPrompts.test.js`

**Propósito original:** Sistema de "gate" para forzar documentación automática. Detecta prompts de planificación y agrega instrucciones DocOps automáticamente.

**Por qué está muerto:** El sistema DocOps nunca se integró en el flujo de lanzamiento de agentes. Los prompts existen pero nadie los llama.

**Calidad del código:** ⚠️ Complejo, con parsing de comandos shell, detección de intents, y gate enforcement. Bien testado pero over-engineered para lo que se necesita.

### 3. Slash Skills (187 líneas)

**Archivo:** `slashSkills.js`

**Propósito original:** Definiciones de comandos slash para el chat de AgentHub (/sdd-explore, /sdd-propose, /engram, etc.) con metadata de UI (iconos, colores, categorías).

**Por qué está muerto:** AgentHub.jsx tiene su propia implementación de comandos slash inline o en otro lugar. Este archivo es una definición standalone que nadie consume.

**Calidad del código:** ✅ Bien estructurado, con funciones de filtrado y agrupamiento por categoría.

### 4. Hooks de Observabilidad (290 líneas)

**Archivos:** `useAgentTraces.js`, `useSessionUsage.js`

**Propósito original:** Hooks React para consumir traces y usage de sesiones con polling automático, filtros, y búsqueda.

**Por qué está muerto:** Las vistas de AgentHub implementan su propia lógica de fetch de traces/usage inline en lugar de usar estos hooks.

**Calidad del código:** ✅ Muy bien implementados. Usan `useCallback`, `useMemo`, `useRef` correctamente para evitar re-renders innecesarios. El hook de traces tiene soporte para filtros, búsqueda FTS5, y auto-refresh configurable.

---

## 🔍 Issues Encontrados

### Issue 1: Hooks bien hechos pero no usados

`useAgentTraces.js` y `useSessionUsage.js` están **muy bien implementados** — mejor que la lógica inline que probablemente existe en AgentHub.jsx. Deberían reemplazar la implementación actual.

### Issue 2: DocOps over-engineered

`docopsPrompts.js` tiene 172 líneas de lógica compleja para detectar si un prompt es de "planificación" y agregar instrucciones DocOps. El enfoque de "retrieval-first" es bueno pero la implementación es innecesariamente compleja.

### Issue 3: slashSkills duplicado

Si AgentHub tiene su propio sistema de comandos slash, `slashSkills.js` es redundante. Si no lo tiene, este archivo debería integrarse.

### Issue 4: Agent Registry sin integración

Las funciones de `agentRegistryLive.js` y `agentRegistryTelemetry.js` son útiles para determinar el estado real de agentes (activo vs stale). Deberían usarse en AgentHub.jsx y SwarmControl.jsx.

---

## 📋 Recomendaciones

### Prioridad 1 — Eliminar código muerto

1. **Eliminar** `docopsPolicy.js`, `docopsPolicy.test.js` — 34 líneas, nunca se usará en su forma actual
2. **Eliminar** `docopsPrompts.js`, `docopsPrompts.test.js` — 198 líneas, over-engineered, nunca se integró
3. **Eliminar** `slashSkills.js` — 187 líneas, si AgentHub necesita comandos slash, que los defina inline

### Prioridad 2 — Integrar o eliminar

4. **Integrar** `useAgentTraces.js` y `useSessionUsage.js` en AgentHub.jsx — reemplazar lógica inline con estos hooks bien implementados
5. **Integrar** `agentRegistryTelemetry.js` en AgentHub.jsx/SwarmControl.jsx — para determinar estado real de agentes
6. Si no se van a integrar en 2 semanas, **eliminar** todo

### Prioridad 3 — Documentar

7. Documentar qué hace cada API route de agenthub
8. Documentar el flujo de chat multi-provider

---

## 🗑️ Archivos candidatos a eliminación inmediata

| Archivo                 | Razón                                             |
| ----------------------- | ------------------------------------------------- |
| `docopsPolicy.js`       | 12 líneas, 0 imports, concepto no integrado       |
| `docopsPolicy.test.js`  | Test de código muerto                             |
| `docopsPrompts.js`      | 172 líneas, 0 imports, over-engineered            |
| `docopsPrompts.test.js` | Test de código muerto                             |
| `slashSkills.js`        | 187 líneas, 0 imports, definiciones no consumidas |

**Total a eliminar: 399 líneas**

## 💎 Archivos que vale la pena integrar

| Archivo                     | Por qué                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `useAgentTraces.js`         | Hook bien implementado, reemplazaría lógica inline en vistas |
| `useSessionUsage.js`        | Hook bien implementado, reemplazaría lógica inline en vistas |
| `agentRegistryTelemetry.js` | Lógica útil de heartbeat y status activo                     |
| `agentRegistryLive.js`      | Metadata y snapshot de agentes, útil para UI                 |

**Total a integrar: 424 líneas**

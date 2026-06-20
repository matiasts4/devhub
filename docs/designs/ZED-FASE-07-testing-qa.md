# Zed: Fase 7 — Testing, cobertura y criterios de aceptación

**Estado**: draft  
**Última actualización**: 2026-06-20  
**Propietario**: DevHub team  
**Proyecto MCP**: `fd1d5538-6d55-499e-8928-8ee93aa64cc7` — _Zed: Asistente y Agente DevHub_  
**Milestone MCP**: `57c4f660-0240-4c41-af9b-0c6ec9f6ea6b` (Fase 6) completado. Fase 7 a crear.

---

## 1. Resumen ejecutivo

Las Fases 0-6 construyeron la base de Zed: configuración, asistente local, integración con DevHub MCP, registro de agente, planificación multi-paso, memoria durable y UI de supervisión.

La **Fase 7** no agrega funcionalidad de producto. Su objetivo es **estabilizar y auditar** todo lo construido mediante:

- Cobertura de tests unitarios y de integración.
- Tests de contrato para las tools del MCP y el registry.
- Validación de flujos críticos de voz, chat, aprobaciones y delegación.
- Benchmarks de latencia reproducibles.
- Documentación de criterios de aceptación por módulo.

Esta fase es puente obligatorio antes de cualquier funcionalidad nueva de autonomía (Fase 8).

---

## 2. ¿Hay más fases después de la 7?

Sí. Las fases 3-7 emergieron del roadmap iterativo de Zed. Una posible continuación:

| Fase | Nombre                                             | Objetivo                                                                           |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 7    | **Testing, cobertura y QA** (esta fase)            | Estabilizar lo construido; definir qué probar y cómo.                              |
| 8    | **Autonomía supervisada**                          | Ejecutar planes aprobados en segundo plano, notificar progreso, recuperar errores. |
| 9    | **Integración con Engram / memoria a largo plazo** | Recuperar contexto de sesiones anteriores de forma semántica.                      |
| 10   | **Hardening y seguridad**                          | Sandbox de comandos, políticas de confirmación granular, audit trail completo.     |
| 11   | **Extensión de skills**                            | Permitir skills de terceros registrar tools en Zed.                                |

La Fase 7 es **prerrequisito** para la 8: no se puede delegar trabajo en segundo plano sin confiar en los tests de los módulos involucrados.

---

## 3. Alcance de Fase 7

### 3.1 Incluye

- Tests faltantes para módulos core sin cobertura directa.
- Refactor de tests que usan `act(...)` sin ambiente concurrente (warnings en `ZedAmbientOverlay.test.jsx`).
- Tests de integración end-to-end para flujos críticos:
  - fast-path local,
  - LLM fallback,
  - aprobación de comandos destructivos,
  - creación de plan y ejecución,
  - delegación a agente externo,
  - memoria durable entre mensajes.
- Benchmark de latencia con umbral documentado.
- Validación de contratos de MCP (request/response schema).
- Documento de criterios de aceptación por feature.

### 3.2 Excluye

- Cambios funcionales nuevos (salvo fixes mínimos encontrados al testear).
- Refactor masivo de arquitectura.
- Implementación de autonomía en segundo plano (Fase 8).

---

## 4. Matriz de módulos y estado de pruebas

| Módulo                                               | ¿Tiene test directo?              | Tests indirectos             | Gap principal                                   | Prioridad |
| ---------------------------------------------------- | --------------------------------- | ---------------------------- | ----------------------------------------------- | --------- |
| `src/lib/asistente/zedMemory.js`                     | ✅ `zedMemory.test.js`            | —                            | Persistencia entre recargas, límite de acciones | Alta      |
| `src/lib/asistente/zedMetrics.js`                    | ✅ `zedMetrics.test.js`           | —                            | Percentiles con pocos datos                     | Media     |
| `src/lib/asistente/useZedChat.js`                    | ✅ `useZedChat.*.test.js`         | —                            | Memoria, métricas, aprobaciones de voz          | Alta      |
| `src/components/asistente/ZedActivityDrawer.jsx`     | ✅ `ZedActivityDrawer.*.test.jsx` | —                            | Scroll, accesibilidad, estado vacío             | Media     |
| `src/components/asistente/ZedAmbientOverlay.jsx`     | ✅ `ZedAmbientOverlay.test.jsx`   | —                            | Warnings por `act` sin ambiente concurrente     | Alta      |
| `src/lib/asistente/runZedChatLoop.js`                | ❌                                | —                            | Loop principal no testeado                      | Alta      |
| `src/lib/asistente/useZedOverlay.js`                 | ❌                                | `ZedAmbientOverlay.test.jsx` | Estado de overlay                               | Media     |
| `src/lib/asistente/zedFastPathResponse.js`           | ❌                                | `runZedFastPath.test.js`     | Formato de respuesta                            | Media     |
| `src/lib/asistente/zedShortCircuit.js`               | ❌                                | —                            | Circuit breaker local                           | Media     |
| `src/lib/asistente/zedToolLabels.js`                 | ❌                                | Varios                       | Labels por tool                                 | Baja      |
| `src/lib/asistente/zedAuditTrail.js`                 | ❌                                | `useZedChat.test.js`         | Persistencia de audit trail                     | Media     |
| `src/lib/asistente/tools/agentLauncher.js`           | ❌                                | `agentLauncherTools.test.js` | Comando de lanzamiento                          | Alta      |
| `src/lib/asistente/tools/agentRuns.js`               | ✅ `agentRunsTools.test.js`       | —                            | Supervisor snapshot                             | Media     |
| `src/lib/asistente/tools/summarizeTerminal.js`       | ❌                                | `terminal.summarize.test.js` | Resumen de salida                               | Media     |
| `src/lib/asistente/tools/swarm.js`                   | ❌                                | —                            | Lanzamiento de swarm                            | Alta      |
| `src/lib/asistente/utils/callDevHubMcp.js`           | ❌                                | `devhubMcpTools.test.js`     | JSON-RPC stdio                                  | Alta      |
| `src/lib/asistente/zedLatencyBenchmark.live.test.js` | ⚠️ skip                           | —                            | Benchmark no automatizado                       | Media     |

---

## 5. Casos de prueba priorizados

### 5.1 Fast-path y routing

1. Mensaje "abre una terminal" → resuelve a `open_terminal` sin LLM.
2. Mensaje ambiguo → fallback a LLM.
3. Mensaje de DevHub MCP → usa tool MCP correspondiente.
4. Mensaje de planificación → `create_plan` con confirmación.

### 5.2 Aprobaciones

1. Comando destructivo pide confirmación; aprobar ejecuta; rechazar cancela.
2. `close_terminal` pide confirmación por nombre.
3. `local_intent` (acción local) pide confirmación y se reenvía con `confirmed: true`.

### 5.3 Memoria durable

1. Preferencia `activityExpanded` se restaura al recargar.
2. Estado del agente persiste entre mensajes.
3. Acciones relevantes aparecen en `recentActions`.
4. Límite de 20 acciones recientes.

### 5.4 Métricas

1. Cada interacción incrementa contadores.
2. Hit-rate se calcula correctamente.
3. P95 no falla con arrays vacíos o de un elemento.

### 5.5 DevHub MCP

1. `callDevHubMcp` maneja inicialización JSON-RPC.
2. Respuesta con `isError` se convierte en error.
3. Cada tool expuesta (`list_projects`, `create_task`, etc.) tiene test de contrato.

### 5.6 Agentes / Swarm

1. `launch_agent_session` genera comando correcto.
2. `launch_swarm_local` invoca endpoint correcto.
3. `list_agent_runs` filtra por `task_id`/`agent_id`.

### 5.7 Seguridad

1. `isSafeHttpUrl` rechaza `javascript:`, `data:`, `file:`.
2. `zedCommandPolicy` rechaza `rm -rf /`, `sudo`, etc.
3. `pathSandbox` no escapa del workspace.

---

## 6. Herramientas y comandos

```bash
# Todos los tests de Zed
node ./node_modules/jest/bin/jest.js src/lib/asistente/__tests__ src/components/asistente/__tests__ --runInBand

# Con cobertura
node ./node_modules/jest/bin/jest.js src/lib/asistente/__tests__ src/components/asistente/__tests__ --runInBand --coverage

# Benchmark de latencia (requiere ZED_BENCHMARK=1)
ZED_BENCHMARK=1 node ./node_modules/jest/bin/jest.js src/lib/asistente/__tests__/zedLatencyBenchmark.live.test.js --runInBand

# Lint + formato
pnpm lint
pnpm format
```

---

## 7. Criterios de aceptación de Fase 7

- [ ] Todos los módulos marcados con prioridad **Alta** tienen test directo.
- [ ] La suite completa de Zed pasa (`366 passed, 0 skipped` objetivo).
- [ ] No hay warnings de `act(...)` sin ambiente concurrente.
- [ ] Cobertura de sentencias ≥ 70 % en `src/lib/asistente/`.
- [ ] Tests de integración para los 6 flujos críticos de la sección 5.
- [ ] Documento de criterios de aceptación por feature actualizado.
- [ ] Commit checkpoint con `[git:checkpoint]` y `worktree=clean` (o `dirty-excluded` justificado).

---

## 8. Tareas propuestas para DevHub MCP

1. **Auditoría de cobertura actual** — mapear tests vs. módulos y listar gaps.
2. **Tests para módulos core sin cobertura** — `runZedChatLoop`, `useZedOverlay`, `callDevHubMcp`, `zedAuditTrail`.
3. **Tests de integración de flujos críticos** — fast-path, aprobaciones, plan, delegación, memoria.
4. **Corregir warnings de tests de React** — ambiente concurrente en `ZedAmbientOverlay.test.jsx`.
5. **Tests de seguridad y sandbox** — urlSafety, commandPolicy, pathSandbox.
6. **Benchmark de latencia automatizable** — convertir `zedLatencyBenchmark.live.test.js` en runnable opt-in.
7. **Documento de criterios de aceptación por feature** — checklist QA reusable.
8. **Commit checkpoint Fase 7** — actualizar DevHub MCP con resultados.

---

## 9. Notas

- Esta fase debe ejecutarse con la política de Git/versionado de agentes (`docs/24_Politica_Git_y_Versionado_Agentes.md`): cada tarea o slice con su commit local.
- No marcar tareas como `completed` sin verificar que los tests pasan.

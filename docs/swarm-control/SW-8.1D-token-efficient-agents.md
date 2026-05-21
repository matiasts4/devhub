---
title: SW-8.1D — Estrategia token-efficient para agentes DevHub
status: draft
updated_at: 2026-05-19
owner: DevHub
---

# SW-8.1D — Estrategia token-efficient para agentes DevHub

## Objetivo

Reducir tokens y latencia sin romper la frontera correcta: **DevHub conserva la verdad durable** y los adapters/runtime resuelven tráfico frecuente y contexto efímero.

## Política operativa

### 1. MCP no es bus interno de alta frecuencia

- Usar DevHub MCP para **intenciones bounded**, leases, snapshots, approvals y consultas durables.
- No usar MCP para streaming de cada mensaje, cada chunk de log o cada latido conversacional entre agentes.

### 2. Mensajes frecuentes van a runtime local

- Para coordinación de alta frecuencia usar **SQLite/local DB/message bus local** del runtime.
- Ejemplos: cola de mensajes cortos, heartbeats internos, estado de terminal, eventos de tool-use, progreso parcial.
- Regla: si el dato vive segundos/minutos y cambia mucho, **no** va directo al MCP.

### 3. Snapshots compactos para Director

- El Director consume **snapshots resumidos**, no streams crudos.
- Snapshot mínimo recomendado por agente: `agent_id`, `task_id`, `workspace_id`, `run_id`, `state`, `last_event_at`, `risk`, `next_action`, `evidence_ref`.
- Frecuencia: por cambio de estado o checkpoint útil; no por token emitido.

### 4. `evidence_ref` en vez de pegar outputs completos

- Logs largos, diffs, transcripts y stdout van a archivos/log store/runtime DB.
- En DevHub durable sólo guardar: `summary`, `kind`, `phase`, `observed_at`, `evidence_ref`, digests y links de parentesco.
- Regla: comentario o artifact durable debe apuntar, no copiar.

### 5. Summary por agente

- Cada agente debe mantener un resumen incremental corto: qué hace, bloqueo actual, último resultado verificable, siguiente paso.
- Objetivo: que otro agente o el Director entienda el estado en **30–60 segundos** sin releer todo el historial.

### 6. Recuperación de contexto antes de leer archivos completos

- Priorizar `file outline`, `ranked context`, symbol search o extractos antes de abrir archivos enteros.
- Leer archivo completo sólo si el outline no alcanza para decidir.
- Regla práctica: **mapa antes que cuerpo**.

### 7. Límite de historial inyectado en prompts

- No reinyectar conversaciones completas.
- Inyectar sólo: objetivo vigente, constraints, último snapshot, riesgos activos, IDs durables, y 1–3 evidence refs relevantes.
- Mantener ventana chica y recortable; el resto se recupera por lookup.

### 8. Política de comentarios DevHub

- Comentarios de tarea/run/workspace: **máximo 3–5 líneas**, orientados a decisión y estado.
- Formato recomendado: `estado → evidencia → siguiente paso`.
- Prohibido pegar logs, stack traces o transcript completos en comentarios.

### 9. Cómo medir mejora

- Medir por corrida y por tarea:
  - tokens de prompt inyectado,
  - tokens de recuperación de contexto,
  - cantidad de lecturas de archivo completo vs outline,
  - latencia a “primer estado útil”,
  - tamaño promedio de comentarios,
  - artifacts con `evidence_ref` vs artifacts con payload embebido.
- Meta inicial: bajar tokens de contexto y lecturas completas sin perder calidad de handoff ni auditabilidad.

### 10. Frontera de verdad: durable vs runtime

| Capa                       | Pertenece acá                                                                                                                                              | No pertenece acá                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Truth durable (DevHub)** | `agent_workspaces`, `agent_runs`, `agent_artifacts`, approvals, supervisor snapshots, IDs, estado terminal, `summary`, `evidence_ref`, baseline/provenance | streams crudos, chat interno de alta frecuencia, logs completos, buffers de terminal              |
| **Runtime / adapters**     | message bus local, colas efímeras, heartbeats frecuentes, PTY/session state, SSE, stdout/stderr, caches de contexto, rankings, resúmenes transitorios      | decisiones durables finales, ownership canónico, provenance inmutable, auditoría terminal oficial |

## Modelo recomendado sobre el esquema actual

- **`agent_workspaces`**: identidad, ownership y lifecycle durable del workspace.
- **`agent_runs`**: unidad durable de ejecución y provenance inmutable.
- **`agent_artifacts`**: evidencia append-only con `summary + evidence_ref`.
- **Adapters/runtime**: producen eventos frecuentes y los compactan antes de subir snapshot/evidence a DevHub.

## Regla de implementación

1. Runtime captura evento fino.
2. Runtime compacta a summary/checkpoint.
3. DevHub recibe sólo snapshot durable o artifact append-only.
4. Director decide con snapshot; abre `evidence_ref` sólo si necesita detalle.

## Riesgo principal si no se respeta

Si MCP se usa como bus de alta frecuencia, DevHub termina caro, verboso y frágil: más tokens, más ruido, peor handoff y peor separación entre control plane durable y runtime efímero.

## Criterio de aceptación documental

Una corrida saludable debe poder auditarse desde DevHub sin releer logs completos, y debe poder rehidratarse en runtime sin convertir el MCP en transcript store.

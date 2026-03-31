# 20C. Backlog A1 - Tareas Especificas y Desarrollo

## Objetivo

Convertir A1 en ejecucion tecnica concreta con entregables verificables.

## Epic A1-CORE: Contrato de entrada documental

### A1-T1 - Validacion de topic_key en MCP

- Tipo: backend/mcp
- Descripcion: agregar validacion formal para topic_key con reglas del contrato.
- Criterios de aceptacion:
  - Rechaza valores invalidos con mensaje claro.
  - Acepta keys validas segun regex definida.
  - Devuelve key normalizada (trim/lowercase).
- Artefactos:
  - Tool MCP validate_topic_key.
  - Tests manuales de ejemplos validos/invalidos.
- Estado actual:
  - Completada.

### A1-T2 - Construccion de Context Pack retrieval-first

- Tipo: backend/mcp
- Descripcion: tool MCP para construir Context Pack minimo con evidencia priorizada.
- Criterios de aceptacion:
  - Requiere objective + project_id + topic_key valido.
  - Aplica orden retrieval-first: project -> tasks/milestones -> memory.
  - Retorna pack con budget y evidencia acotada.
- Artefactos:
  - Tool MCP build_context_pack.
  - Salida JSON estable y reutilizable por orquestador.
- Estado actual:
  - Completada.

## Epic A1-ORCH: Gate de ejecucion

### A1-T3 - Gate de Context Pack en flujo documental

- Tipo: orquestacion
- Descripcion: no permitir delegacion documental sin Context Pack valido.
- Criterios de aceptacion:
  - Toda operacion documental falla rapido si no hay pack.
  - Log de motivo de bloqueo.
- Estado actual:
  - En progreso.
  - Implementada en prompts de lanzamiento, helper reutilizable y enforcement runtime en la ruta real de launch.
  - El orquestador se preserva; DocOps agrega validacion y bloqueo, no reemplazo.
  - Pendiente: cubrir cualquier ruta nueva o legacy de spawn con el mismo gate.
  - El launch real ahora falla rapido si falta `projectId` en flujos doc/planning.

### A1-T4 - Presupuesto de contexto

- Tipo: orquestacion
- Descripcion: limitar tokens de contexto inicial y expansiones.
- Criterios de aceptacion:
  - max_tokens_context inicial configurable.
  - max_expansions configurable y auditado.
- Estado actual:
  - Pendiente / en preparacion.
  - El helper comparte el lenguaje de restriccion, pero aun no existe policy de presupuesto centralizada.
  - Se va a introducir una policy comun para `max_tokens_context` y expansiones auditadas.
  - La policy ya quedo centralizada en un helper compartido por prompts y UI.
  - Pendiente: cerrar la fuente unica de verdad para auditoria de budget.

## Epic A1-QA: Confiabilidad

### A1-T5 - Casos de prueba funcionales

- Tipo: qa
- Descripcion: casos manuales para topic_key y Context Pack.
- Criterios de aceptacion:
  - 10 casos topic_key (5 validos, 5 invalidos).
  - 3 escenarios Context Pack (normal, sin evidencia, error de DB).

### A1-T6 - Criterios de salida A1

- Tipo: governance
- Descripcion: checklist final para declarar A1 listo.
- Criterios de aceptacion:
  - T1 y T2 en produccion local.
  - T3 y T4 conectados al orquestador.
  - QA ejecutado y documentado.

## Orden de implementacion recomendado

1. Cerrar A1-T3 con enforcement runtime del gate en el orquestador.
2. Cerrar A1-T4 con presupuesto centralizado de contexto y reglas de expansion.
3. Ejecutar A1-T5 (baseline QA) sobre topic_key y Context Pack.
4. Cerrar A1-T6 con checklist final y evidencia de funcionamiento.

## Estado actual

- A1-T1: completada (tool MCP validate_topic_key implementada)
- A1-T2: completada (tool MCP build_context_pack implementada)
- A1-T3: en progreso (gate retrieval-first propagado y enforcement runtime agregado; faltan otras rutas si existen)
- A1-T4: en progreso (budget compartido centralizado; falta cerrar auditoria/fuente unica)
- A1-T5: pendiente
- A1-T6: pendiente

## Epic UI-OPS: visibilidad operativa de agentes y roadmap

### UI-OPS-T1 - Sesiones app-launched

- Tipo: frontend/orquestacion
- Descripcion: dejar de exponer terminales manuales como señal de visibilidad operativa y usar solo sesiones lanzadas desde la app.
- Criterios de aceptacion:
  - Swarm Control y CentroIA muestran solo sesiones app-launched.
  - No se usa la deteccion de procesos manuales para poblar el swarm.

### UI-OPS-T2 - Contexto visible por launch metadata

- Tipo: frontend
- Descripcion: mostrar task title o prompt summary lanzado en vez de "Sin tarea" cuando exista metadata util.
- Criterios de aceptacion:
  - META / Orquestación no se confunde con manual.
  - Si hay current_task_id, la UI muestra el titulo de la tarea.

### UI-OPS-T3 - Milestones con accion explicita

- Tipo: frontend
- Descripcion: agregar un control claro para marcar o reabrir hitos desde Roadmap.
- Criterios de aceptacion:
  - Cada milestone ofrece una accion directa visible para completar/reabrir.
  - El estado se entiende sin depender solo del dot.

## Proximos pasos detallados

1. Consolidar el gate en el orquestador para que la validacion de `topic_key` y `Context Pack` sea obligatoria antes de documentar.
2. Revisar si existen otras rutas de spawn y aplicar el mismo helper runtime.
3. Agregar presupuesto formal de contexto con rechazo explicito cuando se exceda `max_tokens_context`.
4. Definir escenarios de QA manuales con evidencia de bloqueo/reintento.
5. Preparar la especificacion A2 para `verify_doc_update` y `promote_doc_version`.
6. Mantener la bitacora actualizada con cada cambio de contrato, prompt o enforcement.
7. Mantener fuera de alcance los terminals manuales externos a la app para esta linea de trabajo.

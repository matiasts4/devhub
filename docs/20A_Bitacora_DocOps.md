# 20A. Bitacora DocOps

## Proposito

Registrar de forma incremental cada avance del sistema documental para no perder trazabilidad tecnica ni decisiones.

## Regla de uso

Cada cambio relevante en DocOps debe agregar una entrada con:

- Fecha
- Cambio
- Motivo
- Archivos/herramientas
- Siguiente paso

---

## 2026-03-30

### Entrada 001 - Inicio de Camino A

- Cambio:
  - Se definio el contrato DocOps Retrieval-First.
  - Se definieron entidades (Doc Topic, Doc Version, Doc Evidence).
  - Se establecio pipeline Discover -> Draft -> Verify -> Promote -> Record.
  - Se definieron herramientas MCP nuevas recomendadas.

- Motivo:
  - Evitar obsolescencia documental y perdida de orden temporal.
  - Reducir costo de contexto con recuperacion selectiva.

- Archivos/herramientas:
  - docs/20_DocOps_y_Contexto_Retrieval_First.md
  - devhub-mcp/server.js (inventario funcional revisado)

- Siguiente paso:
  - Implementar Fase A1: convencion topic_key + Context Pack en orquestador.

### Entrada 002 - Criterio de implementacion acordado

- Cambio:
  - Se prioriza Camino A por velocidad y trazabilidad local.

- Motivo:
  - Menor friccion de ejecucion y mejor control del proceso.

- Siguiente paso:
  - Preparar especificacion tecnica de Tools MCP DocOps (A2).

### Entrada 003 - Inicio de desarrollo A1 en MCP

- Cambio:
  - Se implemento la tool MCP `validate_topic_key`.
  - Se implemento la tool MCP `build_context_pack` con estrategia retrieval-first.
  - Se agregaron helpers de normalizacion/validacion y estimacion de tokens.

- Motivo:
  - Convertir el contrato de A1 en desarrollo ejecutable y usable por orquestador.

- Archivos/herramientas:
  - devhub-mcp/server.js
  - docs/20C_Backlog_A1_Desarrollo.md

- Siguiente paso:
  - Implementar T3 y T4 (gate de Context Pack + enforcement de presupuesto en flujo de orquestacion).

### Entrada 004 - Plan mas especifico y detallado

- Cambio:
  - Se creo un plan de implementacion por fases con tareas, entregables, dependencias y criterios de salida.
  - Se separo en fases de contrato, MCP, orquestacion, UX y QA.

- Motivo:
  - El usuario pidio un plan mas especifico y facil de ejecutar sin perder trazabilidad.

- Archivos/herramientas:
  - docs/20D_Plan_Detallado_DocOps.md
  - docs/20C_Backlog_A1_Desarrollo.md

- Siguiente paso:
  - Convertir la Fase 1 en tareas operativas del proyecto y ejecutar el gate de Context Pack en el orquestador.

### Entrada 005 - Aclaracion de alcance

- Cambio:
  - Se aclaro que DocOps no reemplaza Engram ni el sdd-orchestrator.
  - La mejora real es sumar tools MCP, registro de agentes y cronologia visible sin inflar contexto.
  - El orquestador se preserva como capa central; DocOps agrega validacion y trazabilidad encima.

- Motivo:
  - El usuario precisó que el flujo actual funciona bien y lo que necesita es reforzarlo, no reemplazarlo.

- Siguiente paso:
  - Seguir con la enforcement runtime fina y la visibilidad en la plataforma.

## 2026-03-31

### Entrada 006 - Gate practico en orquestacion y launchers

- Cambio:
  - Se agrego un helper reusable para componer prompts DocOps retrieval-first.
  - Se actualizaron los launchers de BannerIA, ChatAgente y Tareas para instruir validacion de `topic_key` y construccion de `Context Pack` antes de cualquier trabajo documental o de planning.
  - Se explicito el orden retrieval-first y la negativa a continuar sin pack valido.

- Motivo:
  - Convertir la regla DocOps en una barrera operativa real y no solo en documentacion.
  - Reducir desvio de contexto en lanzamientos de SDD Orchestrator / /sdd-new.

- Archivos/herramientas:
  - src/lib/docopsPrompts.js
  - src/components/BannerIA.jsx
  - src/components/ChatAgente.jsx
  - src/views/Tareas.jsx
  - docs/20C_Backlog_A1_Desarrollo.md
  - docs/20D_Plan_Detallado_DocOps.md

- Siguiente paso:
  - Completar A1-T3 con validacion funcional del gate en ejecuciones reales.
  - Definir A1-T4 para presupuesto de contexto y reglas de expansion.
  - Preparar el paquete de especificacion A2 para tools MCP DocOps avanzadas.

### Entrada 007 - Normalizacion del gate en prompts reutilizables

- Cambio:
  - Se extrajo un helper reusable para componer el lenguaje DocOps retrieval-first.
  - Los launchers de SDD Orchestrator quedaron alineados para exigir `validate_topic_key` primero, luego `build_context_pack`, y rechazar ejecucion sin Context Pack valido.
  - Se reforzo el orden retrieval-first: topic exacto -> tareas/hitos -> memoria -> anexos solo bajo demanda.

- Motivo:
  - Reducir duplicacion de texto en prompts y hacer mas consistente el gate entre BannerIA, ChatAgente y tareas de planning.
  - Evitar que el orquestador derive a ejecucion documental sin contexto minimo valido.

- Archivos/herramientas:
  - src/lib/docopsPrompts.js
  - src/components/BannerIA.jsx
  - src/components/ChatAgente.jsx
  - src/views/Tareas.jsx
  - docs/20C_Backlog_A1_Desarrollo.md
  - docs/20D_Plan_Detallado_DocOps.md

- Siguiente paso:
  - Implementar el enforcement runtime real de A1-T3 dentro del orquestador, no solo en los prompts de lanzamiento.
  - Cerrar A1-T4 con presupuesto centralizado de contexto y auditoria de expansiones.

### Entrada 008 - Enforcement runtime y telemetria viva de swarm

- Cambio:
  - Se agrego enforcement runtime en la ruta real de lanzamiento para que los prompts de DocOps/planning entren con gate retrieval-first antes de spawn.
  - Se introdujo un helper reutilizable de telemetria de `agent_registry` para contar y filtrar agentes activos.
  - La UI ahora suscribe cambios de `agent_registry` y refresca el listado de agentes vivos con `last_heartbeat` y `current_task_id` sin pedir contexto pesado.

- Motivo:
  - Evitar que el gate viva solo en texto de prompt.
  - Mostrar swarm activo sin costo de contexto ni llamadas LLM extra.
  - Mantener la cronologia operativa dentro del flujo, no solo en la bitacora.

- Archivos/herramientas:
  - src/lib/docopsPrompts.js
  - src/lib/agentRegistryTelemetry.js
  - src/app/api/agents/launch/route.js
  - src/components/TareasActivas.jsx
  - src/views/Dashboard.jsx

- Siguiente paso:
  - Sincronizar el resto de launchers si aparece otra ruta de spawn fuera del panel actual.
  - Cerrar el endurecimiento runtime del gate y revisar rutas legacy si quedan.

### Entrada 009 - Politica de contexto central en preparacion

- Cambio:
  - Se introdujo como objetivo la policy centralizada de budget de contexto para `max_tokens_context`, `max_expansions` y `expansion_step_tokens`.
  - Se reafirmo que la visibilidad viva debe salir de `agent_registry` + realtime, no de dumps ni llamadas LLM.

- Motivo:
  - Evitar budgets divergentes por launcher.
  - Mantener visibilidad de agentes con costo minimo de tokens.

- Archivos/herramientas:
  - docs/20C_Backlog_A1_Desarrollo.md
  - docs/20D_Plan_Detallado_DocOps.md

- Siguiente paso:
  - Consolidar la policy de contexto central y dejar anotada cualquier ruta sin gate runtime compartido.

### Entrada 010 - Hardening del gate runtime y budget compartido

- Cambio:
  - Se endurecio el gate DocOps en el runtime de launch para que los flujos doc/planning fallen rapido si falta `projectId`.
  - Se agrego un helper reusable para compartir la policy de presupuesto entre prompts y UI.
  - Se reforzo la telemetria viva para que las vistas de agentes se apoyen en `agent_registry`, `status`, `last_heartbeat` y `current_task_id`.

- Motivo:
  - Evitar bypass en spawn/launch reales.
  - Eliminar duplicacion de budget policy y reducir polling/token waste.

- Archivos/herramientas:
  - src/lib/docopsPrompts.js
  - src/lib/docopsPolicy.js
  - src/lib/agentRegistryLive.js
  - src/app/api/agents/launch/route.js
  - src/views/SwarmControl.jsx
  - src/views/CentroIA.jsx

- Siguiente paso:
  - Unificar cualquier otra ruta de launch futura bajo el mismo helper runtime.

### Entrada 011 - Implementacion futura: control remoto por mensajeria

- Cambio:
  - Se registra como iniciativa futura habilitar control remoto del equipo/agentes mediante canales de mensajeria.
  - La idea inicial contempla recibir instrucciones por WhatsApp o Telegram para disparar tareas en el equipo encendido, en modalidad terminal remota.
  - Se toma como referencia conceptual un esquema tipo control remoto similar a soluciones cloud, pero ejecutando en infraestructura propia.

- Motivo:
  - Permitir operacion asincronica cuando no se esta frente al equipo.
  - Reducir tiempo entre definicion de una tarea y su ejecucion por el swarm.

- Archivos/herramientas:
  - docs/20A_Bitacora_DocOps.md

- Siguiente paso:
  - Evaluar en roadmap una Fase de "Remote Command Gateway" con autenticacion fuerte, autorizacion por comandos, auditoria y cola segura de ejecucion.

### Entrada 012 - Mejora visual de contexto de agentes

- Cambio:
  - Se añadieron etiquetas visuales para distinguir mejor Orquestador / Worker / Task / Manual.
  - Las vistas de swarm ahora muestran con mas claridad si un agente tiene tarea concreta o solo esta en modo meta/orquestacion.

- Motivo:
  - El usuario necesito ver mejor en que esta trabajando cada agente sin leer demasiada telemetria.

- Archivos/herramientas:
  - src/components/TareasActivas.jsx
  - src/views/SwarmControl.jsx

- Siguiente paso:
  - Seguir refinando el contexto visible para que la UI explique mejor el origen de cada ejecucion.

### Entrada 013 - Deteccion de terminales manuales OpenCode

- Cambio:
  - Se agrego una ruta de deteccion de procesos de terminal para encontrar instancias manuales de OpenCode fuera de la app.
  - La UI ahora puede mostrar cuantas terminales OpenCode manuales hay, aparte de las lanzadas desde la plataforma.

- Motivo:
  - El usuario reporto que las terminales abiertas manualmente no aparecian en el swarm.

- Archivos/herramientas:
  - src/app/api/terminal/processes/route.js
  - src/lib/terminal/processTelemetry.js
  - src/components/TareasActivas.jsx
  - src/views/SwarmControl.jsx

- Siguiente paso:
  - Evaluar una integración más robusta para registrar manuales como sesiones visibles, no solo como procesos detectados.

### Entrada 014 - Correccion de falsos positivos de agentes activos

- Cambio:
  - Se ajusto la telemetria para que un agente no siga apareciendo como activo si su `last_heartbeat` ya quedo stale.
  - La UI ahora filtra por frescura de heartbeat antes de marcarlo como en ejecución.

- Motivo:
  - El usuario detecto que agentes cerrados seguian mostrándose como vivos.

- Archivos/herramientas:
  - src/lib/agentRegistryTelemetry.js
  - src/lib/agentRegistryLive.js
  - src/components/TareasActivas.jsx
  - src/views/CentroIA.jsx

- Siguiente paso:
  - Revisar si el registro de cierre/heartbeat en el backend debe emitir un estado final más explícito para evitar que vuelva a ocurrir.

### Entrada 015 - Ajuste de visibilidad operativa app-launched

- Cambio:
  - Se dejó de usar la detección de procesos manuales de OpenCode para visibilidad operativa.
  - La UI de swarm ahora prioriza sesiones lanzadas desde la app y muestra contexto de lanzamiento o tarea en vez de caer en "Sin tarea".
  - El orquestador lanzado desde dashboard se clasifica como META / Orquestación usando metadata de launch y prompt, no el agent_id crudo.
  - Los hitos del roadmap sumaron una acción explícita para marcar/reabrir completados.

- Motivo:
  - El usuario pidió acotar el alcance a sesiones lanzadas dentro de la app y mejorar la lectura de contexto en Swarm Control/CentroIA.

- Archivos/herramientas:
  - src/lib/agentRegistryLive.js
  - src/components/TerminalWorkspacesManager.jsx
  - src/components/BannerIA.jsx
  - src/components/ChatAgente.jsx
  - src/views/SwarmControl.jsx
  - src/views/CentroIA.jsx
  - src/views/Roadmap.jsx

- Siguiente paso:
  - Mantener este alcance: terminals manuales externos a la app fuera de scope para esta corrección.

### Entrada 016 - Sesiones persistentes de OpenCode y reapertura desde UI

- Cambio:
  - Se agrego una API nueva para listar las ultimas sesiones persistentes de OpenCode desde `opencode session list --format json --max-count 20`.
  - La terminal ahora ofrece un panel de “Reopen Session” para reabrir una sesion en su directorio original con `opencode --session <id>`.
  - Se reforzo el render de `TerminalTTY` para esperar dimensiones visibles antes de montar xterm, reintentar fit con raf/setTimeout y limpiar estado stale en recargas/cambios de ruta.

- Motivo:
  - OpenCode mantiene sesiones persistentes en disco y necesitabamos exponerlas en la UI para reanudar trabajo real sin perder contexto.
  - El terminal venia fallando al hidratarse en cambios de ruta o cuando el contenedor todavia estaba sin tamaño.

- Archivos/herramientas:
  - src/app/api/opencode/sessions/route.js
  - src/components/TerminalWorkspacesManager.jsx
  - src/components/TerminalTTY.jsx

- Siguiente paso:
  - Evaluar si esta vista debe vivir como sidebar fijo o si el dropdown actual alcanza para el flujo diario.

### Entrada 017 - Persistencia de estado UI por proyecto

- Cambio:
  - Se centralizo la persistencia de preferencias UI por proyecto en un helper compartido de localStorage.
  - La sidebar, el historial y el editor ahora restauran estado de colapso/expansion al volver a abrir el proyecto.
  - El arbol del editor adopto iconografia mas expresiva por tipo de archivo para mejorar lectura visual.

- Motivo:
  - Evitar que cada reload pierda el contexto visual del usuario.
  - Reducir la friccion en proyectos grandes donde el historial y el arbol pueden ser pesados.

- Archivos/herramientas:
  - src/lib/uiState.js
  - src/App.js
  - src/views/Historial.jsx
  - src/views/CodeEditor.jsx

- Siguiente paso:
  - Revisar si otras vistas con colapsables necesitan sumarse al mismo helper.

### Entrada 018 - Rediseño de Ajustes y nuevos temas visuales

- Cambio:
  - Se rediseño completamente la pagina de Ajustes con sistema de tabs para mejor distribucion.
  - Se agregaron 4 nuevos temas: Catppuccin Mocha, Tokyo Night, Monokai Pro, Synthwave '84.
  - Los temas se filtran por tipo (Todos / Oscuros / Claro).
  - Cada seccion de Ajustes tiene su propio tab con icono y descripcion.
  - Las tarjetas de tema tienen previews mas compactos y consistentes.

- Motivo:
  - El usuario pidio mejorar la distribucion de Ajustes y agregar mas opciones visuales.
  - La pagina anterior mezclaba secciones sin jerarquia clara.

- Archivos/herramientas:
  - src/views/Ajustes.jsx
  - src/lib/theme/themes.js
  - src/app/globals.css

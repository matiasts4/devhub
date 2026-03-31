# 20D. Plan Detallado de Implementacion DocOps

## Objetivo General

Construir un sistema de documentacion evolutiva para DevHub que permita a los agentes:

- entender el estado vigente de un tema,
- recuperar evidencia minima relevante,
- proponer cambios sin cargar contexto excesivo,
- mantener lineage claro entre versiones,
- y evitar que la documentacion se vuelva obsoleta o caotica.

El orquestador actual se preserva; DocOps agrega contrato, gates y trazabilidad encima de ese flujo.

## Resultado Esperado

Al finalizar el plan, DevHub debe poder operar como un sistema donde:

1. La documentacion tiene una version canonica vigente por tema.
2. Toda actualizacion deja rastro explicito de reemplazo y razon.
3. El orquestador construye contexto acotado por demanda.
4. Los agentes no reciben historiales completos salvo excepcion justificada.
5. La memoria y la documentacion se refuerzan entre si, pero sin duplicarse.
6. La visibilidad viva de agentes sale de `agent_registry` + realtime, no de contexto pesado.
7. Para esta corrección operativa, solo cuentan terminales app-launched; los manuales externos quedan fuera de alcance.
8. Para esta corrección operativa, solo cuentan terminales app-launched; los manuales externos quedan fuera de alcance.

---

## Fase 1 - Base de Contrato y Reglas

### 1.1 Definir convencion de topic_key

**Objetivo**: estandarizar como se identifica un tema documental.

**Tareas**

- Definir formato canonico: `<dominio>/<subdominio>/<tema>`.
- Definir reglas de normalizacion:
  - lowercase
  - trim
  - espacios a guion medio
  - slashes multiples colapsados
- Definir regex de validacion.
- Definir lista de ejemplos validos e invalidos.

**Entregables**

- Regla escrita en docs.
- Tool MCP `validate_topic_key`.
- Casos de prueba manuales.

**Criterio de salida**

- Cualquier topic_key invalida falla rapido y con mensaje claro.

### 1.2 Definir Context Pack minimo

**Objetivo**: estandarizar el paquete de contexto que se pasa a un agente documental.

**Tareas**

- Definir campos obligatorios.
- Definir campos opcionales.
- Definir presupuesto inicial de tokens.
- Definir numero maximo de expansiones.
- Definir orden retrieval-first.
- Definir una policy centralizada para que ese presupuesto no quede repartido por launcher.

**Entregables**

- Especificacion del Context Pack.
- Tool MCP `build_context_pack`.
- Ejemplo real de salida JSON.

**Criterio de salida**

- Ningun agente documental opera sin Context Pack valido.

### 1.3 Definir reglas de governance

**Objetivo**: evitar que la documentacion se sobrescriba sin trazabilidad.

**Tareas**

- Definir que significa `draft`, `active`, `superseded`, `archived`.
- Definir cuando una version puede promoverse.
- Definir que evidencia minima necesita una promocion.

**Entregables**

- Tabla de estados y transiciones.
- Regla de una sola version activa por topic.

**Criterio de salida**

- El sistema puede decidir si una version entra o no entra al canonico.

---

## Fase 2 - Desarrollo MCP de DocOps

### 2.1 Tool de validacion de topic_key

**Objetivo**: habilitar validacion reusable por orquestador y agentes.

**Tareas**

- Exponer `validate_topic_key` en devhub-mcp.
- Devolver resultado estructurado:
  - valid
  - normalized_topic_key
  - reason
  - regex
- Integrar error handling consistente.

**Dependencias**

- Fase 1.1.

**Criterio de salida**

- Tool disponible por MCP y usable desde cualquier flujo.

### 2.2 Tool de construccion de Context Pack

**Objetivo**: obtener contexto minimo de forma deterministica.

**Tareas**

- Exponer `build_context_pack`.
- Recuperar datos en este orden:
  - proyecto
  - tareas/hitos recientes
  - memoria relacionada
- Limitar evidencia retornada.
- Incluir presupuesto estimado de tokens.

**Dependencias**

- Fase 1.2.

**Criterio de salida**

- El pack sale compacto, reproducible y util para delegacion.

### 2.3 Tool de verificacion documental

**Objetivo**: introducir un gate antes de promover contenido.

**Tareas**

- Definir `verify_doc_update`.
- Validar consistencia con contexto recuperado.
- Generar blockers y score de confianza.

**Dependencias**

- Fase 1.3.

**Criterio de salida**

- Una propuesta documental puede bloquearse antes de tocar el canonico.

### 2.4 Tool de promocion y lineage

**Objetivo**: hacer explicita la cadena de reemplazo.

**Tareas**

- Definir `promote_doc_version`.
- Registrar `replaces_version_id`.
- Marcar version anterior como `superseded`.
- Persistir lineage resumido.

**Dependencias**

- 2.1, 2.2, 2.3.

**Criterio de salida**

- Cada version activa tiene padre claro o raiz inicial.

---

## Fase 3 - Orquestacion Retrieval-First

### 3.1 Gate obligatorio de documentacion

**Objetivo**: impedir trabajos documentales sin contexto acotado.

**Tareas**

- Modificar prompts del orquestador.
- Exigir Context Pack antes de generar una propuesta.
- Bloquear flujo si falta objective/topic_key.
- Reusar helper comun de prompt para BannerIA, ChatAgente y Tareas.
- Hacer que los lanzadores de SDD Orchestrator y /sdd-new instruyan validate_topic_key + build_context_pack en ese orden.
- Mantener al orquestador como punto central; DocOps agrega validacion y bloqueo, no reemplazo.
- Mantener el scope de visibilidad operativa acotado a lanzamientos desde la app.
- Mantener el scope de visibilidad operativa acotado a lanzamientos desde la app.

**Estado actual**

- Helper reusable creado para compartir el lenguaje DocOps.
- Launchers de SDD Orchestrator y /sdd-new alineados con el gate retrieval-first.
- Enforcement runtime agregado en la ruta real de launch para gatear prompts DocOps/planning antes del spawn.
- Falta extenderlo a cualquier otra ruta de lanzamiento que aparezca.
- La hardening runtime sigue en progreso hasta cubrir rutas legacy o nuevas.
- El launch real ya falla rapido si falta `projectId` para flujos doc/planning.

**Criterio de salida**

- Ningun agente de documentacion recibe dumps de contexto completos por defecto.
- Los launchers siempre comienzan retrieval-first y se niegan a continuar sin pack valido.

### 3.2 Presupuesto de contexto

**Objetivo**: controlar el consumo de tokens.

**Tareas**

- Definir max_tokens_context inicial.
- Definir max_expansions.
- Registrar cuando se usa una expansion extra.
- Evitar duplicar evidencia ya entregada.
- Incorporar rechazo explcito cuando el pack supere el presupuesto.
- Definir quien audita y persiste el motivo de la expansion.
- Centralizar la decision para evitar budgets divergentes por componente.

**Criterio de salida**

- El sistema opera con contexto minimo y expansiones justificadas.

**Estado actual**

- Gate de launchers implementado.
- Presupuesto central y auditoria de expansiones: en introduccion.
- Presupuesto compartido ya centralizado en helper reusable.
- Falta cerrar una fuente unica de verdad para auditoria.

### 3.3 Recuperacion por prioridad

**Objetivo**: recuperar evidencia en orden util, no solo por similitud.

**Tareas**

- Aplicar orden:
  1. topic exacto
  2. tareas/hitos relacionados
  3. memoria semantica
  4. anexos grandes bajo demanda
- Documentar el orden como regla obligatoria.

**Criterio de salida**

- El orquestador busca primero la verdad operativa, no el historial entero.

---

## Fase 4 - Observabilidad y UX

### 4.1 Vista de lineage documental

**Objetivo**: ver la historia de una doc sin abrir archivos sueltos.

**Tareas**

- Mostrar topic_key.
- Mostrar version activa.
- Mostrar versiones anteriores.
- Mostrar razon de reemplazo.

**Criterio de salida**

- Cualquiera puede entender que version reemplazo a cual.

### 4.2 Indicador de frescura

**Objetivo**: marcar docs potencialmente obsoletos.

**Tareas**

- Mostrar ultima actualizacion.
- Mostrar score de frescura.
- Mostrar si falta evidencia reciente.

**Criterio de salida**

- La UI alerta cuando una documentacion ya no parece confiable.

### 4.3 Resumen breve para agentes

**Objetivo**: permitir que cada ejecucion deje un one-liner util.

**Tareas**

- Guardar resumen de ejecucion por agente.
- Vincularlo al tema o tarea relacionada.
- Mostrarlo en vistas operativas.

**Criterio de salida**

- Se puede ver rapidamente que hizo cada agente sin abrir logs largos.

**Nota de arquitectura**

- Los agentes se registran en `agent_registry`.
- El worker emite `status` y `last_heartbeat` para telemetria viva.
- La UI se suscribe a realtime sobre `agent_registry` y no necesita contexto pesado ni llamadas LLM para mostrar actividad.
- Pendiente: confirmar que no quede ninguna vista antigua dependiendo de polling o contexto extra.
- Pendiente: confirmar que no quede ninguna vista antigua dependiendo de polling o contexto extra.

---

## Fase 5 - QA y Cierre

### 5.1 Casos de prueba

**Objetivo**: validar el sistema con escenarios simples y reproducibles.

**Tareas**

- Probar topic_key valido e invalido.
- Probar Context Pack con evidencia suficiente.
- Probar Context Pack sin evidencia.
- Probar bloqueo por falta de pack.
- Probar el texto de prompt en BannerIA, ChatAgente y Tareas para verificar orden retrieval-first.

**Criterio de salida**

- Todos los escenarios tienen resultado esperado y registrado.

### 5.2 Criterios de aprobacion final

**Objetivo**: declarar A1 listo para evolucionar a A2.

**Tareas**

- Verificar que T1-T4 esten operativos.
- Verificar que la bitacora tenga entradas del cambio.
- Verificar que el backlog quede actualizado.

**Criterio de salida**

- A1 puede cerrarse y pasar a versioning/document lineage completo.

---

## Prioridad de Ejecucion Recomendada

1. Fase 3.1 - cerrar enforcement runtime del gate obligatorio.
2. Fase 3.2 - definir presupuesto de contexto y expansions.
3. Fase 5.1 - QA manual del gate y del Context Pack.
4. Fase 4.3 - resumen breve por agente.
5. Fase 5.2 - cierre y aprobacion final.

## Regla Operativa

No avanzar a una fase posterior si la anterior no deja trazabilidad escrita en:

- contrato
- backlog
- bitacora
- codigo o prompts

## Estado resumido

- Completado: contrato base, tools MCP A1 y helper reusable de prompts.
- En curso: gate practico de orquestacion retrieval-first en launchers y hardening runtime.
- Pendiente: presupuesto central de contexto, verificacion documental y promo lineage.

## Secuencia detallada restante

1. Endurecer A1-T3 en runtime del orquestador para que el rechazo ocurra tool a tool.
2. Cerrar A1-T4 con budget centralizado y criterio de expansion auditable.
3. Ejecutar A1-T5 con pruebas manuales de bloqueo y recuperacion.
4. Cerrar A1-T6 dejando evidencia de que el flujo ya opera sin historiales completos por defecto.
5. Recién despues abrir A2 para verificacion/promocion documental.

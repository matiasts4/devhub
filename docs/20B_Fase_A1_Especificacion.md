# 20B. Fase A1 - Especificacion Tecnica

## Objetivo de A1

Implementar la base operativa sin tocar todavia el versionado completo:

1. Convencion unica de topic_key
2. Context Pack obligatorio para agentes de documentacion
3. Reglas retrieval-first en orquestacion

## Alcance

- Incluye: contratos, validaciones, prompts, checklist QA.
- Excluye: tablas nuevas de Doc Version y tools MCP DocOps (eso va en A2).

## 1) Convencion topic_key

Formato:
`<dominio>/<subdominio>/<tema>`

Ejemplos:

- bridge-space/arquitectura/contexto-general
- bridge-space/roadmap/fase-4
- devhub/docops/politica-retrieval

Reglas:

1. lowercase obligatorio
2. usar guion medio para compuestos
3. maximo 4 segmentos
4. no usar UUID como topic_key

Validacion recomendada (regex):
`^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){1,3}$`

## 2) Context Pack obligatorio

Contrato minimo:

```yaml
objective: string
project_id: uuid
topic_key: string
current_canonical_summary: string
constraints: string[]
retrieved_evidence:
  - type: task|milestone|memory|doc
    id: string
    reason: string
open_questions: string[]
budget:
  max_tokens_context: number
```

Reglas de uso:

1. Sin Context Pack valido, no hay ejecucion de actualizacion documental.
2. Si falta evidencia para responder objetivo, el agente debe pedir retrieval incremental.
3. Nunca se envia historial completo de conversacion como reemplazo del pack.

## 3) Retrieval-first en orquestador

Secuencia obligatoria:

1. Recuperar canonico (si existe) por topic_key.
2. Recuperar evidencia reciente de tareas/hitos vinculados.
3. Recuperar memoria relevante (fts o semantica).
4. Construir Context Pack y recien ahi delegar.

Limites iniciales:

- max_tokens_context: 2500
- expansiones permitidas: 2
- cada expansion agrega maximo 1000 tokens

## 3.1) Politica compartida de budget

La policy de contexto debe salir de un helper comun y no duplicarse entre prompts, UI o launchers.

Valores canonicos:

- max_tokens_context: 2500
- max_expansions: 2
- expansion_step_tokens: 1000

Regla:

- La UI puede mostrar el mismo presupuesto, pero no redefinirlo.

## 4) Checklist QA A1

### QA funcional

- [ ] topic_key invalido se rechaza.
- [ ] topic_key valido se acepta.
- [ ] no se delega documentacion sin Context Pack.
- [ ] retrieval-first respeta el orden definido.

### QA de costo

- [ ] no se inyectan blobs completos por defecto.
- [ ] presupuesto de tokens respetado por ejecucion.

### QA de runtime

- [ ] launch doc/planning falla rapido si falta projectId.
- [ ] el gate se reescribe en spawn real y en los prompts de UI.

### QA de trazabilidad

- [ ] toda ejecucion guarda memoria What/Why/Where/Learned.
- [ ] cada Context Pack queda registrable para auditoria.

## 5) Entregables de A1

1. Documento de contrato (20)
2. Bitacora viva (20A)
3. Especificacion tecnica A1 (este doc)
4. Lista de tareas para A1 (crear en planning)

## 6) Criterio de salida A1

A1 se considera terminado cuando:

1. El orquestador solo delega con Context Pack valido.
2. Existe validacion de topic_key activa.
3. Se verifica reduccion de contexto promedio por ejecucion.

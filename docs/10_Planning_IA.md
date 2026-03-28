---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Describe el flujo completo de Planning IA implementado en DevHub.
---

# 11 Planning IA — Flujo de Planificación Automática

Este documento describe la funcionalidad de **Planning IA**, el núcleo estratégico de DevHub: la capacidad de transformar un proyecto recién creado en un plan exhaustivo de 40-60+ tareas organizadas en hitos, usando el MCP y un agente IA como Antigravity.

---

## ¿Por qué Planning IA?

El cuello de botella más costoso en cualquier proyecto de software no es la ejecución — es la **planificación inicial**. DevHub resuelve esto permitiendo al usuario cargar todo el contexto de su proyecto (specs, wireframes, READMEs, user stories) y delegarle al agente la generación del plan completo, con la exhaustividad que llevaría días de trabajo manual.

---

## Componentes Implementados

### Base de Datos

| Elemento | Descripción |
|----------|-------------|
| `projects.planning_prompt` | Texto libre con el contexto detallado del proyecto |
| `projects.planning_status` | `none` · `pending` · `completed` |
| `project_files` | Tabla de archivos de contexto (ver `03_Esquema_BaseDatos.md`) |

### API Routes (Next.js)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/projects/[id]/files` | `POST` | Sube archivos de contexto como texto a Supabase |
| `/api/projects/[id]/files` | `GET` | Lista archivos guardados (sin contenido, solo metadata) |
| `/api/projects/[id]/files` | `DELETE` (query `?file_id=`) | Elimina un archivo del contexto |

### MCP Server (`devhub-mcp/server.js`)

| Tool | Descripción |
|------|-------------|
| `get_project_context({ project_id })` | Devuelve `planning_prompt` + todos los `project_files` con su contenido completo |
| `mark_planning_done({ project_id })` | Setea `planning_status = 'completed'` |

### Frontend

| Componente | Ruta | Descripción |
|------------|------|-------------|
| `ProjectHub.jsx` | `/hub` | Modal mejorado con toggle Planning IA, textarea de prompt, dropzone de archivos |
| `PlanningMode.jsx` | `/project/:id/planning` | Página completa de onboarding con upload, prompt, generación de contexto y copy prompt |
| `WorkspaceSidebar.jsx` | — | Item "Planning IA" con dot púrpura pulsante cuando `planning_status = 'pending'` |

---

## Flujo Completo Paso a Paso

### Paso 1 — Crear Proyecto con Contexto

Al hacer clic en **"Nuevo Proyecto"** en el Hub, el modal ahora incluye:

- **Toggle** "Planning IA automático" (encendido por defecto)
- **Textarea** de prompt de contexto (describe el proyecto en detalle)
- **Dropzone** para arrastrar archivos `.txt`, `.md`, `.json`, `.py`, `.js`, etc.

Al confirmar:
- El proyecto se crea con `planning_status = 'pending'`
- Los archivos se suben a `project_files` vía API
- El usuario es redirigido a `/project/:id/planning`

### Paso 2 — PlanningMode (Onboarding)

La página `PlanningMode.jsx` muestra:

1. **Prompt de contexto** — editable, con contador de caracteres
2. **Dropzone adicional** — para subir más archivos o eliminar existentes
3. Botón **"Guardar + Generar Prompt"** — persiste el contexto en Supabase
4. **Prompt de Agente auto-generado** — texto completo listo para enviar a Antigravity, incluye:
   - Nombre y descripción del proyecto
   - `project_id` explícito
   - `user_id` para los MCP tools
   - Lista de archivos subidos
   - Instrucción de mínimo 40 tareas
   - Instrucción de llamar `mark_planning_done` al terminar
5. **Botón "Copiar Prompt"** — copia al clipboard con toast de confirmación
6. **Contador en tiempo real** — polling cada 5s de milestones y tareas creados

### Paso 3 — Ejecución del Planning por el Agente

El usuario pega el prompt en el chat con **Antigravity** (u otro agente MCP-compatible). El agente debe:

```
1. get_project_context({ project_id: "..." })
   → Lee planning_prompt + contenido de TODOS los archivos

2. Analizar el contexto y definir la arquitectura del plan

3. create_milestone() × 5-8 hitos, por ejemplo:
   - "Fase 0: Setup y Entorno de Desarrollo"
   - "Fase 1: Arquitectura y Base de Datos"
   - "Fase 2: Backend / API Core"
   - "Fase 3: Frontend — Pantallas Principales"
   - "Fase 4: Integraciones y Servicios Externos"
   - "Fase 5: Testing y QA"
   - "Fase 6: DevOps, Deploy y Monitoreo"
   - "Fase 7: Post-Launch y Mantenimiento"

4. create_task() × 40-60+ tareas distribuidas en los hitos:
   - Setup inicial (configuración repo, linters, CI, variables de entorno)
   - Esquema DB completo (tablas, RLS, índices, migraciones)
   - Cada endpoint de la API
   - Cada pantalla/componente del frontend
   - Integraciones por servicio (auth, pagos, emails, storage)
   - Tests unitarios, de integración, E2E
   - Pipeline CI/CD
   - Documentación técnica y README
   - Performance y caching
   - Seguridad y pen-testing básico

5. mark_planning_done({ project_id: "..." })
   → Marca planning_status = 'completed'
```

> [!IMPORTANT]
> **El plan NO debe ser superficial.** Si el proyecto es un e-commerce, las tareas deben cubrir: auth, catálogo, carrito, checkout, pagos (Stripe), emails transaccionales, panel de admin, gestión de inventario, reportes, SEO, rendimiento de imágenes, seguridad PCI, etc. Cada área = múltiples tareas.

### Paso 4 — Resultado Final

Cuando `mark_planning_done` se ejecuta:
- `planning_status` → `completed`
- El sidebar cambia el dot de pulsante a estático
- El usuario puede navegar a **Roadmap** → ver hitos con fechas
- El usuario puede navegar a **Tareas** → ver Kanban completo
- El Dashboard muestra progreso real basado en tareas/hitos

---

## Tipos de Archivos Soportados para Contexto

| Extensión | Casos de uso típicos |
|-----------|---------------------|
| `.md` | READMEs, specs funcionales, user stories, wireframes en texto |
| `.txt` | Notas libres, listas de requerimientos |
| `.json` | Esquemas de DB, configs, estructuras de datos |
| `.yaml` / `.yml` | Configuraciones de servicios, OpenAPI specs |
| `.js` / `.ts` / `.jsx` / `.tsx` | Código de referencia, tipos TypeScript |
| `.py` | Scripts, modelos de datos en Python |
| `.csv` | Datasets de ejemplo, catálogos de productos |

**Límite:** 2MB por archivo · Los archivos se guardan como texto en Supabase (no binarios)

---

## Reglas para el Agente Planificador

1. **Exhaustividad obligatoria**: Mínimo 40 tareas, idealmente 50-60 en proyectos medianos/grandes.
2. **Sin redundancias**: Cada tarea debe ser única y accionable.
3. **Prioridades inteligentes**:
   - `critical` → Core del negocio, bloqueante
   - `high` → Features principales del MVP
   - `medium` → Mejoras importantes
   - `low` → Nice-to-haves, optimizaciones futuras
4. **Hitos con fecha**: Usar fechas razonables distribuidas a lo largo del tiempo de desarrollo estimado.
5. **Siempre cerrar** llamando `mark_planning_done()`.
6. **Si el contexto es insuficiente**: Crear tareas genéricas de investigación/definición como primeras tareas del primer milestone.

---

## Integración con Swarm Control

Una vez el planning está `completed`, el flujo natural continúa al **Swarm**:

```
Plan exhaustivo (40-60+ tareas en Supabase)
       ↓
Worker Agent → pick_up_task() → git_branch()
       ↓
Ejecuta la tarea → git_commit()
       ↓
QA Agent → git_diff_review() → aprueba/rechaza
       ↓
Merge a main (Ver: 08_Enjambre_Agentes_y_Orquestacion.md)
```

Ver [08 Orquestación de Enjambre](./08_Enjambre_Agentes_y_Orquestacion.md) y [09 Prompts Maestros de Agentes](./09_Prompts_Maestros_Agentes.md) para el flujo de Workers.

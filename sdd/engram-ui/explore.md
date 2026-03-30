## Exploration: Integrar vista de Engram (Knowledge Graph) a la UI de DevHub

### Current State
El sistema actualmente utiliza Next.js (App Router exportado a SPA) + React Router para la navegación. Los agentes (workers) tienen disponible el servidor MCP de DevHub que expone la tabla `agent_memory` de Supabase a través de las herramientas `save_memory` y `recall_memory`. Sin embargo, no existe una interfaz visual en DevHub para que el usuario pueda explorar, leer o buscar en este grafo de conocimiento generado por los agentes.

### Affected Areas
- `src/App.js` — Necesita registrar la nueva ruta (ej. `/cerebro` o `/engram`).
- `src/components/WorkspaceSidebar.jsx` — Necesita un nuevo ítem en la navegación lateral para acceder a la vista.
- `src/views/EngramGraph.jsx` (nuevo) — El componente visual principal que renderiza las memorias y las decisiones arquitectónicas.
- `src/components/ui/` (posibles) — Componentes de tarjetas, filtros de búsqueda y timeline.

### Approaches
1. **Fetch Directo desde Supabase (`agent_memory`)**
   - Descripción: Crear la vista en React que utilice `supabase.from('agent_memory').select()` filtrando por `project_id`. Mostrar los resultados en una interfaz tipo feed/timeline o tarjetas (kanban de decisiones).
   - Pros: Fácil de implementar. 100% cloud-native y sincronizado en tiempo real. Utiliza la tabla que el MCP local ya expone para los workers de DevHub.
   - Cons: No renderiza un grafo de nodos reales 2D/3D (a menos que incluyamos una librería pesada como `react-flow` o `d3`).
   - Effort: Low/Medium

2. **Grafo Interactivo 2D con `react-flow`**
   - Descripción: Utilizar `react-flow-renderer` o similar para dibujar las memorias conectadas semánticamente (simulando las relaciones en base a similitud vectorial o agrupación por tipo).
   - Pros: Altamente visual, "feeling" moderno de IA.
   - Cons: Requiere agregar dependencias adicionales pesadas. Puede requerir lógica extra para determinar cómo enlazar los nodos (ya que `agent_memory` actualmente no guarda IDs de nodos padre).
   - Effort: High

### Recommendation
**Approach 1 (Fetch Directo + Timeline/Tarjetas Visuales)**. 
Para mantener la eficiencia de tokens y no engordar la UI con dependencias masivas (como d3 o react-flow) en esta fase temprana, recomiendo hacer una vista de **Timeline o Grid de Tarjetas** agrupadas por `tipo` (fact, decision, error, context). Es rápido, limpio y cumple el requerimiento de "ver visualmente las decisiones". Podemos agregar un input de búsqueda con debounce para buscar dentro del conocimiento.

### Risks
- Si la tabla `agent_memory` se llena rápido, hacer fetch de todo podría afectar la performance (requiere paginación o límite inicial).

### Ready for Proposal
Yes. El orquestador puede proceder a generar el documento de Propuesta (`sdd-propose`) basado en esta exploración.
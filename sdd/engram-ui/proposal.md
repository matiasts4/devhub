# Proposal: Integrar vista de Engram (Knowledge Graph) a DevHub vía MCP

## Intent

Proveer una interfaz visual en DevHub (`Cerebro.jsx`) para que los usuarios puedan consultar, buscar y entender las decisiones arquitectónicas y contexto que los agentes están guardando. En lugar de leer directamente de una base de datos, el frontend se alimentará exclusivamente a través del protocolo oficial Engram MCP, utilizando el sidecar de Node.js de DevHub como puente.

## Scope

### In Scope

- Crear vista principal `Cerebro.jsx` (feed/timeline visual de memorias).
- Añadir el acceso directo al Sidebar (`WorkspaceSidebar.jsx`).
- Implementar un input de búsqueda y filtrado en la UI.
- Consumir los datos desde el frontend haciendo peticiones al sidecar de Node.js de DevHub.
- Implementar en el sidecar de Node.js la comunicación con el servidor MCP de Engram para obtener las memorias.

### Out of Scope

- Conexión directa desde el frontend a la tabla `agent_memory` en Supabase o cualquier base de datos.
- Renderizado de grafos espaciales interactivos pesados (nodos y aristas 2D/3D).
- Edición o borrado de memorias desde la UI (por ahora será de solo lectura).

## Approach

Se utilizará una arquitectura cliente-servidor donde el frontend (Next.js/React) hace peticiones HTTP al sidecar local de Node.js. Este sidecar actuará como cliente MCP, comunicándose con el servidor oficial de Engram MCP para consultar y buscar memorias. Las memorias se mostrarán en la UI como tarjetas categorizadas (decision, bugfix, architecture, etc.).

## Affected Areas

| Area                                  | Impact       | Description                                                         |
| ------------------------------------- | ------------ | ------------------------------------------------------------------- |
| `src/App.js`                          | Modified     | Se añade la ruta `/project/:projectId/cerebro`.                     |
| `src/components/WorkspaceSidebar.jsx` | Modified     | Se añade el botón "Cerebro / Engram" al menú de navegación.         |
| `src/views/Cerebro.jsx`               | New          | Vista de timeline/grid que hace peticiones al sidecar.              |
| `sidecar/api`                         | Modified/New | Endpoints en el sidecar de Node.js para interactuar con Engram MCP. |

## Risks

| Risk                                     | Likelihood | Mitigation                                                                                                        |
| ---------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Servidor MCP de Engram no está corriendo | Med        | Manejo de errores en el sidecar y estado de error amigable en la UI indicando que el servicio no está disponible. |
| Latencia en la comunicación MCP          | Low        | Mostrar skeleton loaders o spinners en la UI mientras se obtienen los datos.                                      |

## Rollback Plan

- Revertir los commits que agreguen `src/views/Cerebro.jsx` y los endpoints del sidecar.
- Eliminar la ruta en `src/App.js` y el item en `WorkspaceSidebar.jsx`.

## Dependencies

- Servidor local Engram MCP.
- Sidecar de Node.js de DevHub configurado para actuar como cliente MCP.

## Success Criteria

- [ ] El usuario hace click en "Cerebro" en el Sidebar y navega a la nueva ruta.
- [ ] La vista carga correctamente las memorias solicitándolas al sidecar, el cual las obtiene vía MCP.
- [ ] Las memorias se pueden filtrar y la UI maneja correctamente los estados de carga y error si el servidor MCP falla.

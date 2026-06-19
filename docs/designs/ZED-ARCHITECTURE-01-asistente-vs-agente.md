# Zed: arquitectura Asistente vs Agente

**Estado**: draft  
**Última actualización**: 2026-06-18  
**Propietario**: DevHub team  
**Tareas MCP relacionadas**:

- `cbe68f7c-0968-4d43-9e05-497701ae8a81` — Definir arquitectura objetivo: Asistente Zed vs Agente Zed
- `4d6ec4c9-c158-4e56-bc04-67c3d398ab8d` — Implementar métricas de latencia y hit-rate del fast-path de Zed

---

## 1. Resumen ejecutivo

Zed evoluciona de un **asistente de voz/workspace** a un **agente delegador**. Este documento define los dos modos de operación, sus límites, responsabilidades y cómo se handoffean entre sí.

- **Asistente Zed** (modo actual, reactivo): escucha, entiende comandos directos y ejecuta acciones locales inmediatas.
- **Agente Zed** (modo objetivo, proactivo): planifica, coordina y delega trabajo a otros agentes (OpenCode, Codex, Kimi, Hermes) usando la infraestructura de agentes existente.

Ambos comparten la misma voz, chat e intenciones, pero difieren en autonomía, alcance y reglas de confirmación.

---

## 2. Asistente Zed

### 2.1 Propósito

Ser la interfaz rápida de voz/texto para operar el workspace local: abrir/cerrar terminales, navegar URLs, ejecutar comandos permitidos, listar cosas, ajustar configuración.

### 2.2 Características

- **Reactivo**: responde a una orden con una o pocas acciones.
- **Local**: no sale del proceso de DevHub ni abre agentes externos por sí solo.
- **Rápido**: usa fast-path local siempre que sea posible; solo recurre al LLM cuando no entiende.
- **Seguro por diseño**: acciones destructivas o ambiguas piden confirmación.

### 2.3 Capacidades actuales (basado en `src/lib/asistente/`)

- Abrir terminales con/sin agente (`open_terminal`).
- Cerrar terminales por nombre o todas (`close_terminal`, `close_all_terminals`).
- Ejecutar comandos en terminal existente (`execute_in_terminal`).
- Abrir URLs (`open_url`).
- Listar terminales abiertas (`list_terminals`).
- Leer salida de terminal (`review_terminal_output`).

### 2.4 Límite clave

El Asistente Zed **no delega trabajo a agentes externos**. Puede abrir una terminal con OpenCode si el usuario lo pide explícitamente (`"abre OpenCode"`), pero no coordina misiones ni asigna tareas.

---

## 3. Agente Zed

### 3.1 Propósito

Actuar como **orquestador local** que entiende objetivos de más alto nivel, los descompone y los delega a agentes especializados, supervisando la ejecución.

### 3.2 Características

- **Proactivo**: puede proponer planes y ejecutarlos tras confirmación.
- **Conectado a DevHub MCP**: lee y escribe proyectos, tareas, hitos y cola de ejecución.
- **Delegador**: lanza sesiones de agentes externos usando la infraestructura existente (`buildAgentLaunchCommand`, `launch_swarm_local`, tmux, devhub-bus).
- **Supervisado**: mantiene al usuario informado y pide aprobación para acciones críticas.

### 3.3 Capacidades objetivo

- Consultar estado de DevHub: "¿qué tareas tengo pendientes?", "¿en qué milestone estamos?".
- Crear tareas/hitos por voz: "creame una tarea para refactorizar el router".
- Delegar tareas: "delegá las tareas 14, 15 y 16 a OpenCode".
- Lanzar swarms: "lanzá un swarm de auditoría sobre este proyecto".
- Planificar multi-paso: "primero auditá, después arreglá los errores críticos y avisame".
- Recuperar contexto entre sesiones mediante memoria durable.

### 3.4 Límite clave

El Agente Zed **no reemplaza a los agentes especializados**. Su trabajo es entender, planificar, delegar y supervisar; no implementar código ni ejecutar tareas complejas él mismo.

---

## 4. Diferencias clave

| Aspecto           | Asistente Zed                       | Agente Zed                                     |
| ----------------- | ----------------------------------- | ---------------------------------------------- |
| **Trigger**       | Orden directa del usuario           | Orden directa o objetivo de alto nivel         |
| **Alcance**       | Workspace local                     | Workspace + DevHub MCP + agentes externos      |
| **Planificación** | Una o pocas acciones inmediatas     | Planes multi-paso con dependencias             |
| **Delegación**    | No delega                           | Delega a OpenCode, Codex, Kimi, Hermes, swarms |
| **Confirmación**  | Para acciones destructivas/ambiguas | Para planes completos y acciones críticas      |
| **Memoria**       | Sesión actual (sessionStorage)      | Duradera (Engram / DevHub state)               |
| **Identidad**     | Sin `agent_id` propio               | Registrado en `agent_registry` de DevHub       |

---

## 5. Puntos de handoff

### 5.1 Asistente → Agente

El Asistente se convierte en Agente cuando:

- La orden implica más de una acción coordinada.
- La orden menciona tareas de DevHub MCP.
- La orden pide delegar a otro agente.
- La orden es un objetivo de alto nivel sin comando directo.

Ejemplo:

> "abre OpenCode" → Asistente.  
> "delegá las tareas 14, 15 y 16 a OpenCode con un prompt detallado" → Agente.

### 5.2 Agente → Asistente

El Agente vuelve a modo Asistente cuando:

- El plan terminó.
- El usuario cancela o rechaza el plan.
- El objetivo se resolvió con una acción simple que no requiere delegación.

---

## 6. Reglas de confirmación humana

### 6.1 Confirmación implícita (no requiere diálogo)

- Acciones locales de bajo riesgo: abrir terminal, abrir URL, listar terminales.
- Fast-path con confianza alta (`local-high`, ≥ 0.85).

### 6.2 Confirmación explícita requerida

- Fast-path con confianza media (`local-medium`, 0.70–0.84).
- Cerrar más de una terminal a la vez.
- Ejecutar comandos destructivos (`rm`, `drop`, `delete`, etc.).
- Cualquier acción del Agente que afecte MCP (crear tareas, modificar hitos).

### 6.3 Confirmación de plan (Agente)

Antes de ejecutar un plan multi-paso, el Agente debe:

1. Mostrar el plan paso a paso.
2. Indicar qué agentes/sesiones se lanzarán.
3. Permitir aprobar, modificar o cancelar.

Ejemplo:

> "Voy a: 1) leer las tareas 14, 15 y 16 de DevHub; 2) abrir 3 sesiones de OpenCode con prompts específicos; 3) monitorear los runs. ¿Confirmás?"

---

## 7. Componentes involucrados

### 7.1 Asistente Zed

- `src/lib/asistente/zedIntentRouter.js`
- `src/lib/asistente/zedFastPath.js`
- `src/lib/asistente/runZedFastPath.js`
- `src/lib/asistente/useZedChat.js`
- `src/lib/asistente/dispatchZedActions.js`
- `src/lib/asistente/tools/*`

### 7.2 Agente Zed

- `src/lib/asistente/` (extensión de useZedChat / nuevo módulo de planning)
- `devhub-mcp` tools (lectura/escritura de proyectos, tareas, hitos)
- `src/lib/agentLaunchCommand.shared.js`
- `src/lib/agentLaunchWrapper.js`
- `src/lib/terminal/swarmLaunchWorkspace.js`
- `/api/agenthub/operations/health` (`launch_swarm_local`)
- `devhub-bus` para comunicación entre agentes

### 7.3 Métricas

- `src/lib/asistente/zedIntentRouter.js` — hit-rate por intención.
- `src/lib/asistente/runZedFastPath.js` — latencia fast-path.
- `src/lib/asistente/useZedChat.js` — latencia total y razón de fallback.

---

## 8. Próximos pasos inmediatos

1. Implementar métricas base para establecer la línea de partida.
2. Extender el fast-path con más intenciones locales.
3. Integrar tools de DevHub MCP en el `ToolRegistry` de Zed.
4. Registrar a Zed como agente en DevHub MCP.
5. Conectar Zed con el lanzador de agentes existente.
6. Implementar planificación multi-paso con confirmación humana.

---

## 9. Notas históricas

El audit `docs/audits/06-zed.md` documenta un intento previo de tratar a Zed como un **swarm agent** más. Este documento corrige esa dirección: Zed **no es un participante del swarm**, sino el **orquestador local** que puede lanzar swarms y agentes sueltos cuando el usuario lo solicita.

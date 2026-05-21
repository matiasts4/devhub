# AgentHub Prompt Test Suite — Orquestador/Gestor

## Instrucciones

1. Copiá cada prompt y envialo a AgentHub (vía la interfaz que uses — API headless, Telegram, web)
2. Esperá a que termine la ejecución
3. Cuando termines TODOS los prompts, avisame: _"Terminé los tests, revisá los audit trails"_
4. Yo leo los audit trails en `data/audit-trails/` y te doy feedback detallado

---

## 🟢 Nivel 1: Gestión Básica (verificar flujo de orquestación)

### Test 1.1 — Lanzar agente simple

```
Lanzá un agente con perfil default para que revise el estado actual del proyecto devhub
```

**Qué verifica:** Que pueda spawnear un agente y que este se conecte correctamente.

### Test 1.2 — Consultar estado del proyecto

```
Mostrame el dashboard del proyecto devhub con todas las tareas pendientes y en progreso
```

**Qué verifica:** Que use las MCP tools de consulta correctamente.

### Test 1.3 — Ver agentes activos

```
Qué agentes están corriendo ahora mismo? Mostrame el estado de cada uno
```

**Qué verifica:** Que pueda consultar el estado del swarm/procesos activos.

---

## 🟡 Nivel 2: Gestión de Tareas (verificar planificación)

### Test 2.1 — Crear tarea y asignar

```
Creá una nueva tarea en el proyecto devhub llamada "Implementar sistema de logs" con prioridad alta y descripción "Agregar logging estructurado a todos los módulos principales"
```

**Qué verifica:** Que use MCP tools para crear tareas correctamente.

### Test 2.2 — Planificar sprint

```
Planificá las próximas 3 tareas prioritarias para el proyecto devhub basándote en lo que ya existe. Creá las tareas si no existen y asignales prioridad.
```

**Qué verifica:** Que pueda analizar el estado actual y planificar trabajo.

### Test 2.3 — Crear milestone

```
Creá un milestone llamado "v1.0 - Core Features" para el proyecto devhub con las tareas que ya existen asociadas
```

**Qué verifica:** Que pueda crear milestones y asociar tareas.

---

## 🟠 Nivel 3: Orquestación de Agentes (verificar coordinación)

### Test 3.1 — Lanzar agente con tarea específica

```
Lanzá un agente con perfil claude-sonnet para que implemente la tarea "Implementar sistema de logs" que acabamos de crear
```

**Qué verifica:** Que pueda lanzar un agente con una tarea específica y perfil.

### Test 3.2 — Monitorear agente en ejecución

```
Cuál es el estado del agente que lanzaste recién? Qué herramientas usó? Cuánto lleva ejecutando?
```

**Qué verifica:** Que pueda monitorear agentes en ejecución y reportar progreso.

### Test 3.3 — Pausar y reanudar agente

```
Pausá el agente que está corriendo la tarea de logs, esperá 10 segundos y reanudalo
```

**Qué verifica:** Que pueda controlar el ciclo de vida de agentes (pausar/reanudar).

---

## 🔴 Nivel 4: Estrés y Coordinación Compleja (verificar límites)

### Test 4.1 — Múltiples agentes concurrentes

```
Lanzá 3 agentes simultáneos:
1. Uno con perfil default para revisar documentación del proyecto
2. Uno con perfil claude-sonnet para analizar tests existentes
3. Uno con perfil gpt-4o para revisar la estructura de archivos
```

**Qué verifica:** Que pueda coordinar múltiples agentes concurrentes (swarm).

### Test 4.2 — Planificación completa de proyecto

```
Hacé una planificación completa para el proyecto devhub:
1. Revisá todas las tareas existentes
2. Identificá las que están bloqueadas o estancadas
3. Creá un milestone para las tareas de la próxima semana
4. Lanzá un agente para empezar la tarea más prioritaria
```

**Qué verifica:** Flujo completo de orquestación: análisis → planificación → ejecución.

### Test 4.3 — Recuperación de error

```
Lanzá un agente con una tarea que probablemente falle (por ejemplo "eliminar todos los archivos del proyecto"). Luego verificá si el agente manejó el error correctamente o si hubo que intervenirlo.
```

**Qué verifica:** Que los agentes manejen errores y que el orquestador pueda detectar fallos.

---

## 📊 Resumen de Tests

| #   | Prompt                  | Nivel | Qué Verifica      |
| --- | ----------------------- | ----- | ----------------- |
| 1.1 | Lanzar agente simple    | 🟢    | Spawn básico      |
| 1.2 | Dashboard del proyecto  | 🟢    | Consulta MCP      |
| 1.3 | Agentes activos         | 🟢    | Estado del swarm  |
| 2.1 | Crear tarea             | 🟡    | MCP create_task   |
| 2.2 | Planificar sprint       | 🟡    | Planificación     |
| 2.3 | Crear milestone         | 🟡    | MCP milestones    |
| 3.1 | Lanzar agente con tarea | 🟠    | Spawn + perfil    |
| 3.2 | Monitorear agente       | 🟠    | Seguimiento       |
| 3.3 | Pausar/reanudar         | 🟠    | Ciclo de vida     |
| 4.1 | 3 agentes concurrentes  | 🔴    | Swarm             |
| 4.2 | Planificación completa  | 🔴    | Flujo completo    |
| 4.3 | Recuperación de error   | 🔴    | Manejo de errores |

---

## 🔄 Cómo Ejecutar

### Opción A: Via API Headless

```bash
curl -X POST http://localhost:3000/api/agenthub/headless \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Lanzá un agente con perfil default para que revise el estado actual del proyecto devhub"}'
```

### Opción B: Via Telegram

```
/spawn Revisar estado actual del proyecto devhub default
```

### Opción C: Via interfaz web

Simplemente pegá el prompt en la interfaz.

---

## ✅ Cuándo Avisarme

Cuando termines de ejecutar TODOS los prompts (o al menos los que puedas), decime:

> "Terminé los tests, revisá los audit trails"

Y yo:

1. Leo todos los trails en `data/audit-trails/`
2. Analizo cada ejecución paso a paso
3. Te doy un reporte con:
   - ✅ Qué funcionó bien
   - ⚠️ Qué tuvo problemas
   - ❌ Qué falló
   - 📊 Estadísticas generales
   - 💡 Puntos de mejora

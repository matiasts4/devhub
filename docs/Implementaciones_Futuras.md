# Implementaciones futuras

**Estado:** Planeación revisada (29 may 2026).
**Objetivo:** Construir un agente operativo que controle terminal, browser y swarm desde una vista integrada. La pizarra libre es una vista alternativa futura, no el punto de partida.

---

## Visión corregida

### Lo que realmente se necesita

Un agente que pueda:

- Abrir y controlar terminales
- Ver logs en tiempo real
- Lanzar comandos y procesos
- Abrir browser y navegar
- Crear agentes y delegar tareas
- Lanzar swarm cuando corresponda

Y una **vista donde se vea al agente operar** — si no podés ver qué hace, no podés corregir cuando falla.

### La pizarra (canvas libre) es vista alternativa, no el objetivo inicial

La idea de tener terminals y browsers arrastrables en un canvas tipo Excalidraw es atractiva pero más compleja de implementar. Por ahora, la vista fixed del lado derecho (el dock actual) cumple esa función de superficie operativa.

La pizarra viene después, cuando la base agent + vista固定 esté funcionando.

---

## Orden de implementación

### Paso 1 — Contrato de acciones y permisos

Antes de escribir prompts o definir modos, hay que definir **qué acciones puede hacer el agente**. Sin esto, todo lo demás es frágil.

Acciones ejemplo:

- `terminal.open`, `terminal.run`, `terminal.focus`
- `browser.open`, `browser.navigate`
- `agent.create`, `agent.delegate`
- `swarm.launch`
- `logs.tail`, `logs.stream`

Cada acción tiene: nombre, parámetros, permisos requeridos, límite de riesgo.

### Paso 2 — Timeline operativa

Registro de todo lo que ocurre: acción pedida, confirmación, tool usado, estado, resultado, error.

Sin timeline no hay forma de debugear al agente ni de que el usuario confíe en lo que hace.

### Paso 3 — Agente base: Observador + Operador

El agente empieza en modo seguro (Observador) y evoluciona a Operador.

**Observador:**

- Ver terminals activas
- Ver procesos corriendo
- Ver browser sessions
- Ver agentes y estado
- Consultar logs y timeline

**Operador:**

- Abrir terminal nueva
- Correr comandos permitidos
- Abrir browser y navegar
- Enfocar paneles y layout

### Paso 4 — Vista integrada (agente + superficie de operación)

Este paso **va de la mano con el paso 3**. El agente sin vista visible no sirve — necesitás ver qué hace, sifalló, si está pensando, si pidió confirmación.

La vista puede ser:

- Un panel lateral derecho (integrado al dock existente)
- Un tab nuevo en el side panel
- Una ventana flotante

Lo importante: la vista debe mostrar terminal vivo, browser vivo, timeline del agente y feedback del agente todo junto.

### Paso 5 — Director General sobre swarm

Una vez que el agente controla terminal y browser de forma confiable, recién ahí se le agrega capacidad de crear agentes, delegar tareas y lanzar swarm.

No antes. Porque si no podés controlar una terminal, no vas a poder coordinar un swarm.

### Paso 6 — Pizarra libre (vista alternativa futura)

Cuando la vista fixed + agente funcionen bien, se puede explorar una vista canvas donde:

- Terminals y browsers se arrastran libremente
- Se pueden tener múltiples instancias en un mismo workspace
- La organización es espacial, no-tabs

Esto es más pesado y viene después. La vista fixed sigue existiendo como fallback.

### Paso 7 — Voz (canal adicional)

Push-to-talk como última capa, después de que texto + vista funcionen.

---

## Arquitectura reducida

```
Intent Router → Action Policy → [Terminal Adapter | Browser Adapter | Agent Adapter | Swarm Adapter]
                    ↓
              Execution Timeline
                    ↓
              Agent View (integrated)
```

El agente usa adapters para hablar con terminal, browser, agentes y swarm. Todo queda registrado en la timeline. La vista muestra el resultado.

---

## Decisiones abiertas

1. **Nombre del agente** — cómo se llama la vista y el agente
2. **Allowlist inicial** — qué comandos puede correr sin confirmar, cuáles requieren confirmación
3. **Dónde vive la vista** — panel lateral, tab nuevo, o ventana flotante
4. **Alcance del primer corte swarm** — qué porcentaje de swarm-director se invoca en el MVP

---

## Qué NO hacer primero

- No empezar por wake word ni voz
- No empezar por la pizarra arrastrable
- No empezar por el "director general total" sin haber probado terminal + browser funcionando
- No separar agente de vista — van siempre juntos

---

## Siguiente paso concreto

Armar el contrato de acciones (paso 1) y la especificación de la vista integrada (paso 4) en un SDD breve. Eso es lo que se puede empezar a ejecutar ahora.

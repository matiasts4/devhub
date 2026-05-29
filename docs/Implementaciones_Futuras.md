# Implementaciones futuras

**Estado:** Planeación inicial.
**Objetivo de este documento:** concentrar iniciativas futuras que todavía no entraron a un SDD formal o a un roadmap numerado.

---

## Agente operativo, director general y vista de control

### Resumen ejecutivo

DevHub ya tiene piezas para terminales, browser, agentes, MCP y swarm. La implementación futura valiosa no es sumar otra herramienta aislada, sino construir una **vista de control** con un agente capaz de operar la aplicación de punta a punta.

La idea correcta NO es duplicar `swarm-director`. La idea correcta es crear una capa superior: un **director general operativo** que pueda usar o invocar capacidades equivalentes a `swarm-director`, pero que además tenga alcance sobre terminales, browser, vistas, procesos y estado general de la app.

### Decisión de producto

- Esto debe vivir como una **vista nueva dentro de DevHub**.
- No debe tratarse como un producto aparte.
- `swarm-director` debe seguir existiendo como subsistema especializado en coordinación de swarm.
- El nuevo agente debe ser una capa más amplia, con alcance de dirección general sobre la aplicación.

## Qué problema resuelve

Hoy las capacidades importantes están repartidas:

- terminales y procesos;
- browser y navegación;
- agentes y swarm;
- logs y observabilidad;
- layout y foco operativo.

Eso obliga a saltar entre superficies distintas para completar tareas que, conceptualmente, forman una sola intención.

La propuesta es unificar eso en una **Operator View** donde el usuario pueda pedir una acción natural y el sistema la convierta en una secuencia visible, controlada y trazable.

## Aclaración clave: no mezclar tipos de modos

Acá hay que separar dos ejes distintos. Si se mezclan, el diseño queda confuso.

### 1. Canales de entrada

Esto responde a **cómo** le habla el usuario al sistema.

- **Texto**: chat, comando estructurado, input rápido.
- **Voz**: push-to-talk, wake word futura, transcripción y confirmación.

### 2. Modos de autoridad

Esto responde a **hasta dónde** puede accionar el agente.

| Modo | Alcance | Qué puede hacer |
| --- | --- | --- |
| Observador | Lectura | Ver logs, estado, terminales, agentes, páginas, timeline y métricas. |
| Operador de aplicación | Control local de la app | Abrir terminales, lanzar procesos, abrir browser, cambiar layout, enfocar vistas, seguir logs. |
| Director general | Dirección sistémica | Todo lo anterior, más crear agentes, delegar tareas, coordinar runs y usar el subsistema swarm cuando convenga. |

Punto importante: **voz y texto no son modos de autoridad**. Son sólo canales de entrada. El verdadero diseño difícil está en los modos de autoridad.

## Relación con `swarm-director`

Este punto hay que dejarlo cristalino.

| Superficie | Rol real |
| --- | --- |
| `swarm-director` | Director especializado del swarm y de la coordinación multiagente visible. |
| Director general propuesto | Director superior de toda la aplicación. Usa `swarm-director` cuando necesita coordinación de swarm, pero no se limita a eso. |

### Diferencia funcional

`swarm-director` hoy piensa en términos de:

- misiones;
- slices;
- fases;
- roles del swarm;
- handoffs y verificación.

El **director general** propuesto debe pensar en términos más amplios:

- intención del usuario;
- control operativo de la app;
- procesos locales;
- browser y navegación;
- layout y foco;
- coordinación multiagente;
- observabilidad transversal;
- políticas de permisos y confirmación.

### Regla arquitectónica recomendada

El director general **no reemplaza** a `swarm-director`. Lo envuelve.

Cuando la intención sea de tipo swarm, el director general debe poder:

1. traducir la intención a una operación de coordinación;
2. delegarla al subsistema correcto;
3. mostrar progreso y resultados dentro de la misma vista;
4. retomar control cuando termine o falle.

Eso evita dos errores graves:

- volver a implementar lógica de swarm dentro del agente superior;
- mezclar dirección de aplicación con dirección de swarm como si fueran la misma cosa.

## Hipótesis de interfaz

La mejor dirección sigue siendo una vista tipo **Control Room** u **Operator View** con tres capas:

| Capa | Función |
| --- | --- |
| Intención | Entrada por texto o voz y selector visible de modo de autoridad. |
| Ejecución | Terminales, browser, agentes, tareas y procesos vivos. |
| Observabilidad | Timeline, logs, confirmaciones, errores, resultados y estado activo. |

### Inspiración correcta

La referencia tipo Excalidraw sirve como inspiración espacial para acomodar elementos vivos, pero NO como modelo principal del producto.

La dirección correcta es:

- conversación como entrada principal;
- superficie operativa viva como salida principal;
- organización espacial opcional, no requisito fundacional.

## Capacidades objetivo

### 1. Observación transversal

- Ver qué terminales están activas.
- Ver qué procesos están corriendo.
- Ver páginas/browser sessions activas.
- Ver agentes, heartbeats, bloqueos y tareas.
- Ver timeline de acciones del agente superior.

### 2. Operación de aplicación

- Abrir terminales nuevas.
- Reusar terminales existentes.
- Lanzar comandos permitidos como `npm run dev`, tests, watchers o builds.
- Enviar input a una terminal viva.
- Abrir páginas o sesiones del browser.
- Navegar y traer el estado relevante a la vista.
- Cambiar foco y layout dentro de DevHub.

### 3. Dirección general

- Crear agentes desde intención natural.
- Delegar tareas concretas.
- Lanzar flujos de swarm cuando corresponda.
- Seguir progreso consolidado desde una única timeline.
- Cancelar, reintentar, pausar o reasignar runs.

### 4. Interacción por voz

- Push-to-talk como primer paso.
- Wake word configurable en etapa posterior.
- Confirmación explícita para acciones sensibles.
- Feedback visual de lo entendido antes de ejecutar.

## Principios de diseño

1. **Primero contratos de acción, después lenguaje natural.** Si no existe una acción bien tipada, el agente no debería improvisarla.
2. **Primero texto, después voz.** La voz sin contratos ni permisos bien definidos sólo agrega ruido.
3. **Un solo timeline operativo.** Todo debe quedar trazado en la misma superficie.
4. **Swarm como subsistema, no como centro del universo.** El nuevo agente tiene que ser más grande que swarm, no rehacer swarm.
5. **Confirmación según riesgo.** Leer no equivale a mutar; abrir no equivale a destruir; delegar no equivale a ejecutar sin límites.

## Arquitectura propuesta

| Componente | Rol |
| --- | --- |
| Intent Router | Traduce intención natural a acciones tipadas. |
| Mode Resolver | Determina si la intención cae en Observador, Operador o Director General. |
| Action Policy Layer | Aplica permisos, confirmaciones, límites y allowlists. |
| Terminal Adapter | Crea, reusa y observa terminales/procesos. |
| Browser Adapter | Abre páginas, navega y conecta automatización browser-side. |
| View Adapter | Abre, enfoca o reorganiza vistas y paneles dentro de la app. |
| Swarm Adapter | Invoca capacidades equivalentes a `swarm-director` sin duplicarlas. |
| Execution Timeline | Registra cada paso, tool, error, confirmación y resultado. |
| Voice Gateway | Maneja STT, wake word y confirmaciones cuando se habilite voz. |

## Decisiones preliminares para no perdernos

Estas no son decisiones finales de implementación. Son decisiones de enfoque para aterrizar la idea sin abrir todavía un SDD.

1. El agente superior debe ser una **superficie operativa**, no sólo un chat bonito.
2. `swarm-director` sigue siendo una pieza interna especializada; no conviene absorberlo ni diluirlo.
3. El valor inicial está en controlar bien **terminal + browser + estado de la app**, no en prometer autonomía total desde el día uno.
4. La voz debe tratarse como un canal adicional, no como el centro conceptual del sistema.
5. La vista debe priorizar **claridad operativa** antes que espectacularidad visual.

## Escenarios semilla

Estos escenarios sirven para aterrizar la idea y evaluar si la visión tiene sentido. No son un backlog.

### Escenario 1 - Operación local rápida

El usuario escribe: "abrí una terminal para frontend y corré `npm run dev`".

La vista debería poder:

- crear o elegir la terminal adecuada;
- ejecutar el comando;
- mostrar que quedó corriendo;
- dejar el log visible en la misma superficie.

### Escenario 2 - Inspección antes de actuar

El usuario dice: "mostrame qué agentes y procesos siguen activos".

La vista debería poder:

- listar agentes vivos;
- mostrar procesos terminales asociados;
- indicar bloqueos, heartbeats o errores;
- no ejecutar cambios por defecto.

### Escenario 3 - Dirección general con apoyo de swarm

El usuario pide: "creá agentes para revisar MCP y tests, y avisame el progreso".

La vista debería poder:

- interpretar que esto ya no es sólo operación local;
- delegar al subsistema correcto;
- mostrar seguimiento consolidado;
- dejar claro cuándo el control pasó a swarm y cuándo volvió.

### Escenario 4 - Navegación y browser controlado

El usuario pide: "abrí tal URL y dejala en la vista para revisar settings".

La vista debería poder:

- abrir la sesión de browser;
- navegar a la URL;
- mostrar estado o snapshot relevante;
- dejar rastro en la timeline.

## Qué debe quedar fuera al principio

Para que esta idea no se vuelva una bolsa de features, conviene dejar fuera de la primera definición conceptual:

- autonomía abierta para cualquier comando sin política de permisos;
- wake word permanente escuchando todo el tiempo;
- canvas libre como núcleo obligatorio de la UX;
- reemplazo completo de vistas especializadas existentes;
- reimplementación de la lógica de swarm dentro del agente superior.

## Orden correcto de implementación

Este es el punto más importante. El orden correcto NO es empezar por voz, ni por canvas, ni por el director total.

### 1. Modelo de acciones y política de permisos

Primero hay que definir el contrato de acciones del sistema.

Ejemplos:

- `open_terminal`
- `run_terminal_command`
- `focus_terminal`
- `open_browser_page`
- `navigate_browser`
- `create_agent`
- `delegate_task`
- `show_logs`

Esto va primero porque sin acciones tipadas el agente superior se transforma en una capa frágil de prompt parsing.

**Por qué va primero:**
sin este paso no existe base segura para distinguir entre observar, operar y dirigir.

### 2. Timeline operativa y capa de observabilidad unificada

Antes de automatizar mucho, hay que poder ver bien qué pasó.

Esto implica:

- acción pedida;
- confirmación requerida o no;
- tool/adapter usado;
- estado de ejecución;
- resultado;
- error si falla.

**Por qué va segundo:**
si no hay observabilidad desde el principio, después es casi imposible depurar confianza, errores y control.

### 3. Modo Observador

El primer modo real debería ser el más seguro.

Debe permitir:

- inspeccionar terminales;
- listar procesos relevantes;
- ver páginas/browser sessions;
- ver agentes y estado;
- consultar logs y timeline.

**Por qué va tercero:**
porque te da utilidad inmediata y permite validar el modelo mental sin todavía mutar demasiado la app.

### 4. Modo Operador de aplicación

Recién después conviene habilitar acciones reales sobre la app.

Debe incluir:

- abrir terminal;
- correr comando permitido;
- abrir browser;
- navegar a URL;
- enfocar paneles o cambiar layout básico.

**Por qué va cuarto:**
porque una vez que ya podés observar y trazar, pasar a ejecutar acciones locales tiene riesgo controlado y valor inmediato.

### 5. MVP de Operator View por texto

Con observación + operación local ya se puede shippear una primera vista útil.

Ese MVP debe tener:

- input por texto;
- selector visible de modo de autoridad;
- timeline;
- surfaces activas mínimas;
- confirmaciones por riesgo.

**Por qué va quinto:**
porque recién acá existe una experiencia coherente. Antes de esto sólo hay piezas técnicas.

### 6. Modo Director General

Una vez que el agente ya controla la aplicación, recién ahí conviene subirlo al nivel de dirección sistémica.

Debe agregar:

- creación de agentes;
- delegación de tareas;
- disparo de capacidades de swarm;
- seguimiento consolidado multiagente;
- cancelación y reasignación.

**Por qué va sexto:**
porque si empezás por acá sin haber resuelto control local, permisos y observabilidad, terminás con un pseudo-orquestador demasiado abstracto y poco confiable.

### 7. Layout operativo avanzado o superficie espacial

Cuando las acciones ya funcionan, tiene sentido construir una vista más rica para acomodar terminales, browser y agentes como bloques vivos.

**Por qué va séptimo:**
porque la espacialidad mejora mucho la operación, pero no define el corazón del sistema.

### 8. Voz, push-to-talk y wake word

La voz debe ser la última gran capa.

Primero push-to-talk. Después, si vale la pena, wake word tipo `Hey Zed` o el nombre que se defina.

**Por qué va octavo:**
porque la voz es una mejora de input, no el fundamento del control. Si se hace antes, tapa problemas de arquitectura con una capa de UX llamativa pero inestable.

## Orden resumido

1. Definir acciones tipadas y permisos.
2. Construir timeline y observabilidad.
3. Implementar Modo Observador.
4. Implementar Modo Operador de aplicación.
5. Shippear Operator View por texto.
6. Agregar Modo Director General sobre swarm.
7. Mejorar layout/superficie espacial.
8. Agregar voz y wake word.

## Qué NO conviene hacer primero

- No empezar por wake word.
- No empezar por una UI tipo canvas.
- No empezar por “el super director total” sin contratos de acciones.
- No mezclar desde el día uno texto, voz, swarm, browser y terminal sin política de permisos.

Eso te daría una demo vistosa, pero una base mala.

## MVP recomendado

El MVP correcto para validar esta visión sería:

- `Modo Observador` + `Modo Operador de aplicación`;
- input por texto;
- timeline visible;
- terminal y browser como primeras superficies;
- confirmaciones claras;
- sin wake word;
- sin canvas obligatorio;
- sin dirección multiagente completa todavía.

Ese MVP valida el corazón del sistema sin sobrediseñarlo.

## Preguntas abiertas

1. Cómo se va a llamar el agente superior por defecto.
2. Qué acciones entran en allowlist para el primer release.
3. Qué parte de la integración con swarm entra en el primer corte de `Director General`.
4. Si el layout espacial vive como modo opcional o como vista por defecto.
5. Si la voz debe correr localmente, híbrida o con proveedor externo.

## Siguiente aterrizaje recomendado

Antes de abrir un SDD, conviene bajar un poco más estas ideas en una nota conceptual corta que responda sólo estas preguntas:

- cuál es la diferencia exacta entre `Operador de aplicación` y `Director General`;
- qué acciones mínimas hacen que la vista ya sea útil;
- qué señales obligan a pedir confirmación;
- qué parte de swarm se invoca y cuál no;
- qué se considera éxito de la vista en su primera versión.

Recién cuando esas respuestas estén firmes tendría sentido pasar a un SDD o a un plan más formal.
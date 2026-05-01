# Barra de Contexto y Estado del Agente

Esta guía explica los dos indicadores visuales que aparecen dentro del chat de AgentHub mientras un sub-agente está activo: el **grupo de contexto** (`ContextToolGroup`) y la **barra de estado inferior** (`AgentStatusBar`).

---

## ContextToolGroup — grupo de recolección de contexto

### ¿Qué es?

Cuando el sub-agente necesita leer archivos, buscar código o listar directorios antes de responder, agrupa todas esas operaciones en un único bloque colapsable llamado **"Contexto recolectado"**. En lugar de mostrar decenas de tool calls individuales, te muestra un resumen legible.

### Estados visuales

| Estado                 | Color del borde           | Ícono                | Título                       |
| ---------------------- | ------------------------- | -------------------- | ---------------------------- |
| En progreso            | Ámbar (`amber-500/30`)    | `Loader2` girando    | **Recolectando contexto...** |
| Completado sin errores | Sutil (`--border-subtle`) | `CheckCircle2` verde | **Contexto recolectado**     |
| Con errores parciales  | Rojo (`red-500/30`)       | `ChevronDown` rojo   | **Contexto parcial**         |

### Resumen inline

El bloque siempre muestra un resumen textual de lo que se hizo, por ejemplo:

```
✔ Contexto recolectado  3 archivos leídos, 2 búsquedas, 1 listado  ·  142ms  ›
```

El tiempo total es la **suma de todos los tool calls individuales** del grupo.

### Herramientas que se agrupan

Solo se agrupa automáticamente el siguiente conjunto de tool names:

| Tool name                       | Categoría           | Ícono        |
| ------------------------------- | ------------------- | ------------ |
| `read`, `read_file`, `readFile` | Lectura de archivos | `FileText`   |
| `glob`, `grep`, `search`        | Búsqueda            | `Search`     |
| `list`, `ls`, `directory`       | Listado             | `FolderOpen` |

Las herramientas de acción (escritura de archivos, ejecución de comandos, llamadas MCP) **no** se agrupan — aparecen como tool calls individuales en el panel de Trazas.

### Expandir / colapsar

Hacé clic en el bloque para ver el detalle de cada operación individual:

```
leído       src/components/chat/AgentStatusBar.jsx            89ms
búsqueda    function\s+AgentStatusBar                         12ms
leído       src/views/AgentHub.jsx                           143ms
```

Cada línea muestra:

- **Ícono** según el tipo de tool
- **Etiqueta** en español (`leído`, `grep`, `listado`, etc.)
- **Argumento principal** (primer valor del input — generalmente el path o el patrón)
  - Si el argumento supera los 80 caracteres, se muestra truncado desde el final (`…/ruta/larga/del/archivo.jsx`)
- **Tiempo individual** en ms (solo si `timeEnd` y `timeStart` están disponibles)

---

## AgentStatusBar — barra de estado inferior

### ¿Qué es?

Una barra fija de **24px de alto** que aparece en el borde inferior del área de chat **exclusivamente mientras el sub-agente está activo** (`isActive = true`). Se oculta completamente cuando el agente termina o es interrumpido.

Su formato visual es:

```
■ Orquestador  claude-sonnet  |  7 toolcalls · 43s  |  12.4K (6%)  ──────  esc interrupt  ctrl+p commands
```

### Secciones de la barra (de izquierda a derecha)

#### 1. Indicador del agente

- Punto pulsante de color `--accent-primary`
- Nombre del agente activo (máximo 120px, truncado)
- Valor por defecto: `"Orquestador"`

#### 2. Modelo

- Ícono `Cpu`
- Nombre del modelo con limpieza automática de prefijos:
  - Se eliminan: `openai/`, `anthropic/`, `google/`
  - Se eliminan sufijos de fecha (`-2024-10-22`) y `-latest`
  - Ejemplo: `anthropic/claude-sonnet-4-5-2024-10-22` → `claude-sonnet-4-5`
- Máximo 160px, truncado

#### 3. Tool calls + tiempo transcurrido

- Ícono `Loader2` girando (solo si hay tool calls)
- Contador: `N toolcalls`
- Tiempo transcurrido desde que el agente se activó (timer en vivo, actualiza cada segundo)
  - Formato: `43s` (si < 60s) o `2m 7s` (si ≥ 60s)
- El timer **se resetea** cada vez que el agente se activa de nuevo (`isActive` pasa de `false` a `true`)

#### 4. Uso de tokens

- Muestra `tokenCount` formateado: si supera 1000 → `12.4K`; si no → número exacto
- Si hay `tokenLimit` configurado, muestra el porcentaje de uso entre paréntesis
- **Alerta visual**: cuando el uso supera el 80%, el porcentaje cambia a color `--warning` (ámbar)
- El límite por defecto es `200,000` tokens

#### 5. Shortcuts (extremo derecho)

- **`esc` interrupt**: llama a `onInterrupt()` — detiene el agente en curso
- **`ctrl+p` commands**: llama a `onCommandPalette()` — abre la paleta de comandos (solo se muestra si el callback está disponible)

### Comportamiento del timer

El timer usa `Date.now()` en la activación y calcula la diferencia cada segundo con `setInterval`. Al desactivarse, el intervalo se limpia automáticamente. No persiste entre sesiones ni recargas.

---

## Relación entre ambos componentes

```
AgentHub (chat)
├── [mensaje del usuario]
├── ContextToolGroup          ← aparece inline en el hilo del chat
│   ├── resumen (collapsed)   ← siempre visible
│   └── detalle por tool      ← visible al expandir
├── [respuesta del agente]
└── AgentStatusBar            ← barra fija en el borde inferior del chat
    ├── nombre + modelo
    ├── toolcalls + timer
    ├── tokens
    └── esc / ctrl+p
```

`ContextToolGroup` es parte del **flujo del chat** — aparece entre mensajes como un nodo visual. `AgentStatusBar` es parte del **layout fijo** — siempre en el mismo lugar mientras el agente corre.

---

## Preguntas frecuentes

**¿Por qué algunos tool calls no aparecen en el ContextToolGroup?**
Solo se agrupan operaciones de lectura/búsqueda/listado. Las escrituras, comandos de terminal, y llamadas a MCPs externos aparecen en el panel de **Trazas** del panel derecho.

**¿El timer sigue corriendo si cambio de pestaña?**
Sí. El timer usa `Date.now()` como referencia, por lo que calcula el tiempo real transcurrido independientemente de si la pestaña estuvo visible o no.

**¿Qué pasa si el agente usa más del 80% de tokens?**
El porcentaje en la `AgentStatusBar` cambia a color ámbar como advertencia visual. No hay interrupción automática — es solo un indicador.

**¿Puedo ver el timing de herramientas individuales sin expandir el grupo?**
No, el timing total del grupo se muestra siempre, pero el desglose por tool requiere expandir el bloque.

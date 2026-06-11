# Síntoma y evidencia — corrupción TUI OpenCode/grok

**Fecha:** 2026-06-10  
**Entorno:** DevHub desktop (apariencia Tauri; barra de workspaces con Workspace 1 / Workspace 2).  
**Comando reportado:** `opencode --session ses_abc`  
**Captura:** `evidence-2026-06-10-opencode-session.png`

---

## Qué se ve en pantalla

1. **Tres paneles terminales** en split horizontal dentro del workspace activo (Workspace 2 resaltado).
2. Cada panel tiene:
   - Título de chrome DevHub: `Terminal` + etiqueta **`grok`** (no el footer típico de OpenCode con `ctrl+p commands`).
   - Línea de estado del agente: `RCP (2/3) 458 / 200K`.
   - Zona central **negra** con **formas rectangulares grises** (muy bajo contraste), sin transcripto legible.
   - Pie Ink: `Waiting…` + timestamp `3:36 1458 [x]`.
   - Barra de atajos: `Shift+Tab: mode`, `ctrl+c: cancel`, `ctrl+Enter: interact`, …
3. Los tres paneles son **visualmente casi iguales** → no parece un panel sano y dos rotos; es un fallo **sistemático del renderer o del layout compartido**.

---

## Qué _no_ se ve (y es relevante)

- No hay texto de conversación, diff, ni output de herramientas.
- No hay el footer clásico de OpenCode (`ctrl+p commands`, `esc interrupt`) — el TUI en pantalla se comporta como **grok Ink**, aunque el usuario haya hablado de una sesión OpenCode.
- No hay overlay de error de conexión (WifiOff) ni pantalla de “Reconnect”.

Interpretación: el **PTY y el proceso TUI probablemente siguen vivos** (footer y Waiting… visibles), pero la **capa de render xterm** no está pintando el buffer de celdas correctamente.

---

## Variantes del mismo bug (reportadas en sesiones anteriores)

| Variante                  | Descripción                                                           |
| ------------------------- | --------------------------------------------------------------------- |
| **Text explosion**        | Caracteres y glifos superpuestos, a veces en paneles split inactivos. |
| **Bloques grises**        | Como en la captura: placeholders o atlas GPU sin texel válido.        |
| **Transcripto en blanco** | Footer Ink OK, área central vacía.                                    |
| **Scroll roto**           | Rueda mueve historial del shell o no mueve el transcripto del TUI.    |

Todas comparten: **TUI Ink/OpenCode/grok + xterm GPU renderer + multi-panel o workspace switch**.

---

## Evidencia a recolectar en la próxima reproducción

| Artefacto                  | Ubicación                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Captura de pantalla        | Adjuntar al folder `docs/errores/03-terminal-canvas-glyph-corruption/`                      |
| Log terminal               | `data/logs/terminal-debug.log` — tags `RENDER:`, `CLIENT:`, `fit-*`, `workspace-show-*`     |
| `initialCommand` del panel | DevTools → props del panel o persistencia en workspace JSON                                 |
| Renderer efectivo          | Log `canvas-attached`, `webgl-attached`, `webgl-released-inactive-panel`, `canvas-released` |
| Session OpenCode           | ID en comando (`ses_abc`) vs `opencodeSessionId` detectado en servidor                      |

---

## Relación OpenCode ↔ grok en esta captura

DevHub puede restaurar `opencode --session <id>` y el runtime OpenCode puede estar sirviendo el agente **grok** dentro de su TUI, o los paneles pueden haberse creado con `grok` como `initialCommand` directo. En ambos casos:

- El **transporte PTY** es el mismo (WebSocket DevHub).
- El **renderer** es el mismo stack xterm.
- Las mitigaciones recientes tratan **grok** y **OpenCode** como rutas distintas de scroll/detection, pero la corrupción visual es **agnóstica al agente**: es fallo de capa de pintura GPU/DOM.

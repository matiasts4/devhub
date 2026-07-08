# 07 — Pegado multilínea en Grok: un mensaje por línea

## Resumen

Al **copiar varias líneas** desde un panel terminal de DevHub (xterm + PTY vía sidecar) y **pegar en Grok** (u otro TUI tipo Ink/OpenCode/Kimi), cada línea del portapapeles se enviaba como **un mensaje distinto**, saturando la conversación.

El mismo texto copiado desde una **terminal nativa** (p. ej. Windows Terminal) y pegado en Grok se comportaba mucho mejor (a menudo un solo bloque o pocos envíos).

**Estado:** **Resuelto** (2026-07-06) — verificado por el usuario: el pegado queda en un solo mensaje.

**Rama / contexto:** trabajo en `feature/terminal-decompose` (`useTerminalClipboard`, hooks extraídos de `TerminalTTY.jsx`).

---

## Síntoma

1. Seleccionar un bloque de varias líneas en la terminal de DevHub (salida de logs, transcripto, etc.).
2. Copiar (Ctrl+Shift+C, botón Copy del panel, Ctrl+C con selección, o menú contextual).
3. Enfocar el panel **Grok** y pegar (Ctrl+V / Ctrl+Shift+V / menú Pegar).
4. **Esperado:** un solo bloque en el área de input; el usuario pulsa Enter una vez.
5. **Observado (antes del fix):** N envíos — uno por cada línea del clipboard — llenando el historial del chat.

Comparación:

| Origen del copy | Pegado en Grok                     |
| --------------- | ---------------------------------- |
| Terminal nativa | ~1–2 mensajes (aceptable)          |
| DevHub          | ~1 mensaje **por línea** (crítico) |

---

## Causas raíz

Varias capas se sumaban; el pegado era el disparador visible, pero el **formato del clipboard** y el **camino de inyección al PTY** importaban por igual.

### 1. Inyección al PTY sin bracketed paste

DevHub enviaba el texto del portapapeles **en crudo** al sidecar (`{ type: 'input', data: text }`), evitando el `term.paste()` de xterm para no romper algunos TUIs.

Los TUIs interactivos (Grok, OpenCode con footer listo, Kimi) suelen tratar **cada `\n` o `\r`** en input como **submit** cuando no hay [bracketed paste](https://cirw.in/blog/bracketed-paste) (`ESC[200~` … `ESC[201~`).

Una terminal nativa, con el TUI en modo bracketed (DECSET 2004), envuelve el pegado automáticamente; DevHub no lo hacía.

### 2. Camino paralelo: paste nativo de xterm

Si el evento `paste` llegaba al `textarea` de xterm, `handlePasteEvent` ejecutaba `prepareTextForTerminal`, que convierte `\r?\n` → **solo `\r`**, y dispara `onData` → WebSocket.

Aunque fuera **un** mensaje WS, el proceso Grok podía interpretar **cada `\r`** como envío separado.

Había además riesgo de **doble manejo** (listener en `document` + `onPaste` en el viewport).

### 3. Copiado desde xterm en Windows

`SelectionService.selectionText` en xterm une filas del buffer con **`\r\n`** en Windows.

Sin heurística de wrap de ConPTY, cada **fila del viewport** (incluido soft-wrap) puede convertirse en una línea en el clipboard → **más saltos de línea** que al copiar desde Windows Terminal para la misma selección visual.

Eso amplificaba el problema al pegar sin bracketed paste (más “mensajes” percibidos).

### 4. Detección TUI demasiado estricta (primer intento de fix)

Una versión intermedia solo aplicaba bracketed paste si `grokTuiReadyRef` / `tuiSessionFooterConfirmedRef` estaban en `true`. En algunos momentos del ciclo de vida del panel el pegado seguía yendo en crudo.

---

## Solución aplicada

### A. Pegado (fix principal)

| Cambio                          | Detalle                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Bracketed paste obligatorio** | Todo pegado **multilínea** inyectado por WebSocket se envuelve en `ESC[200~` + texto normalizado + `ESC[201~`. |
| **Normalización previa**        | `normalizeTerminalSelectionForClipboard` (`\r\n` / `\r` → `\n`) antes del bracket.                             |
| **Criterio ampliado**           | `initialCommand` (`grok`, agentes TUI) + refs de lifecycle; por defecto multilínea → bracket.                  |
| **Bloqueo paste xterm**         | Capture en `textarea`/`element` con `stopImmediatePropagation` para que xterm no reinyecte por `onData`.       |
| **Routing de paste**            | Capture en `terminalRootRef` + `document`; `stopImmediatePropagation` donde aplica.                            |
| **Sin fallback peligroso**      | Si el WS no está abierto, **no** se usa `term.paste()` para multilínea (evita split por `\r`).                 |
| **Anti-duplicado**              | `pasteInFlightRef` evita dos pegados simultáneos por doble evento.                                             |

Funciones clave: `formatTerminalPastePayload`, `wrapTerminalBracketedPaste`, `shouldBracketTerminalTextPaste`, `sendTerminalPasteInput` en `TerminalTTY.helpers.js`.

### B. Copiado (mitigación alineada con terminales nativas)

| Cambio                           | Detalle                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clipboard LF-only**            | Al copiar desde DevHub, el texto se normaliza a `\n` entre líneas.                                                                                                                |
| **Interceptor `copy`**           | Listener en capture en `document` reescribe `text/plain` con la selección normalizada.                                                                                            |
| **windowsPty / wrap heuristics** | En Windows, `resolveXtermWindowsPtyOptions()` (`conpty` + `buildNumber: 19041`) para que xterm fusione filas soft-wrapped en `getSelection()` cuando ConPTY no marca `isWrapped`. |

### C. Limpieza de UI

- Se quitó `onPaste` duplicado en el viewport shell (`TerminalTTY.jsx`); el flujo queda centralizado en `useTerminalClipboard`.

---

## Archivos tocados

Ver [files-changed.md](./files-changed.md).

Tests unitarios: `src/components/__tests__/TerminalTTY.test.js` (`terminal clipboard copy helpers`, `terminal bracketed paste helpers`, `sendTerminalPasteInput`).

---

## Verificación

1. Rebuild / reinicio de la app desktop (Tauri) o `npm run dev` según el entorno habitual.
2. Copiar ≥3 líneas desde cualquier panel terminal DevHub.
3. Pegar en panel Grok con Ctrl+V.
4. **OK:** un solo bloque en el input; un Enter envía todo.

Logs opcionales (consola): líneas `[paste]` con `bracketed=true` y sin `refusing xterm.paste fallback for multiline`.

---

## Referencias

- xterm clipboard / bracketed paste: `node_modules/xterm/src/browser/Clipboard.ts`
- xterm selección Windows CRLF: `node_modules/xterm/src/browser/services/SelectionService.ts` (`selectionText`)
- xterm `windowsPty` / wrap: `node_modules/xterm/typings/xterm.d.ts`, `WindowsMode.ts`
- Handoff pegado swarm (contexto histórico, distinto bug): [42_Swarm_Bootstrap_Logging_Handoff.md](../../42_Swarm_Bootstrap_Logging_Handoff.md)

---

## Lecciones

1. **No replicar solo `term.paste()` por WebSocket** sin bracketed paste en TUIs que mapean CR/LF a submit.
2. **Bloquear el paste nativo de xterm** cuando el producto controla el PTY por WS, o mantener paridad exacta con su semántica (incl. bracket).
3. **Copiar y pegar son un par**: CRLF y filas de viewport en Windows influyen en cuántos “envíos” percibe el usuario aunque el bug se vea al pegar.
4. Probar siempre **DevHub copy → Grok paste** frente a **terminal nativa → Grok paste** con la misma selección visual.

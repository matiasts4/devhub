# Archivos modificados — pegado multilínea Grok

## Lógica de clipboard / helpers

| Archivo                                                 | Cambio                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/terminal/TerminalTTY.helpers.js`        | `normalizeTerminalSelectionForClipboard`, `resolveXtermWindowsPtyOptions`, constantes y helpers de bracketed paste (`TERMINAL_BRACKETED_PASTE_*`, `wrapTerminalBracketedPaste`, `isMultilineTerminalPaste`, `shouldBracketTerminalTextPaste`, `formatTerminalPastePayload`), comentarios en `sendTerminalPasteInput`. |
| `src/components/terminal/hooks/useTerminalClipboard.js` | Hook extraído: copy normalizado, interceptor `copy`, routing `paste` (root + document), `pasteInFlightRef`, `initialCommand`, rechazo de `term.paste` multilínea, uso de `formatTerminalPastePayload`.                                                                                                                |
| `src/components/terminal/hooks/useTerminalEngine.js`    | `...resolveXtermWindowsPtyOptions()` en ctor de `Terminal`; bloqueo paste nativo xterm en `textarea`/`element` (cleanup en `terminalBlurCleanupRef`).                                                                                                                                                                 |
| `src/components/TerminalTTY.jsx`                        | Pasa `initialCommand` a `useTerminalClipboard`; elimina `onPaste` duplicado en viewport shell.                                                                                                                                                                                                                        |

## Tests

| Archivo                                        | Cambio                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/components/__tests__/TerminalTTY.test.js` | Tests `terminal clipboard copy helpers`, `terminal bracketed paste helpers`, `sendTerminalPasteInput`. |

## Documentación

| Archivo                                                                    | Cambio                  |
| -------------------------------------------------------------------------- | ----------------------- |
| `docs/errores/07-terminal-clipboard-grok-multiline-paste/README.md`        | Este incidente.         |
| `docs/errores/07-terminal-clipboard-grok-multiline-paste/files-changed.md` | Inventario de archivos. |

## Sin cambios en sidecar

El sidecar (`sidecar-backend/server.js`) ya hacía `ptyProcess.write(filteredInput)` en un solo chunk; no fue necesario particionar ni unir líneas en servidor. El fix es **cliente → formato de input**.

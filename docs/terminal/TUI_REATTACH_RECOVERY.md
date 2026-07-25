# Recuperación de terminales TUI tras reattach (panel negro, selección, redraw)

Guía de los modos de fallo reales que vimos (2026-07) y los mecanismos de
recuperación que funcionan, para no reinventar el diagnóstico cada vez que una
terminal "se va a negro" o deja de responder.

---

## 0. Arquitectura: hay DOS servidores PTY — saber cuál es el vivo

| Servidor                                  | Quién lo usa                                                                                    | Protocolo                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `sidecar-backend/server.js` (puerto 4001) | **EL REAL** — dev (`pnpm electron:up`) y app instalada (`packaging/devhub-server.cjs` lo lanza) | v1: `ready` + replay de `session.history`. Sin v2, sin snapshots. |
| `src/lib/terminal/ttyServer.js`           | Implementación paralela (tests, contratos espejo)                                               | v1 + v2 (`subscribe` con `fromOffset`, snapshots SerializeAddon)  |

Reglas duras:

- **El sidecar NO se auto-reinicia** al editar código. Hay que relanzar
  `pnpm electron:up`. En Windows no persiste sesiones: reiniciar = mueren los PTYs.
- El sidecar loguea solo a **stdout** (la terminal de `electron:up`), no a
  `data/logs/terminal-debug.log`. Ese archivo lo escriben `ttyServer.js` y el
  cliente (vía `/api/terminal/log`).
- Los dos servidores deben mantenerse **en paralelo** (hay comentarios cruzados
  en el código). Un fix en uno NO aplica al otro.
- En `ttyServer.js`, `isFirstClientAttach` (`sockets.size === 1`) **es siempre
  true** porque `replaceSessionSockets` expulsa los sockets previos. Nunca
  condicionar lógica de reattach a eso — es código muerto disfrazado.

---

## 1. Modo de fallo: panel TUI negro tras cerrar/switch workspace

### Síntomas

- Cierras workspace 1 → caes en el workspace 2 → el kimi se ve **todo negro**
  (cursor en 0,0) o solo con el footer vivo.
- Cambiar de workspace manualmente **sí lo recupera**.

### Causa raíz (verificada de punta a punta)

1. Al cerrar el workspace, el panel del workspace destino se **remonta**
   (doble-mount por churn de `workspace-removed`; el keepalive no cubre ese path)
   y reconecta como **reattach**.
2. En reattach, el sidecar replaya `session.history` — **pero las TUIs de agente
   tienen `historyEnabled = false`** a propósito (para no repintar frames viejos).
   Resultado: el canvas nuevo recibe **cero bytes**.
3. Lo único que aparece es output nuevo (p.ej. el footer si la TUI sigue viva).

Cómo se verificó: `curl http://127.0.0.1:4001/sessions/<id>/output` mostraba el
UI completo de kimi en el servidor mientras el panel estaba negro. El PTY estaba
sano; el cliente nunca recibió el contenido.

### Mecanismos de recuperación (cuál funciona y por qué)

| Mecanismo                                           | Efecto medido en kimi (en vivo)                     | Veredicto                                                                    |
| --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| History replay                                      | 0 bytes (TUIs tienen `historyEnabled=false`)        | No aplica a TUIs                                                             |
| **Ctrl+L** (`\x0c` al PTY)                          | ~214 bytes — solo repinta la **status bar**         | Insuficiente solo                                                            |
| **Resize wobble** (`rows-1 → rows` = SIGWINCH real) | ~11.5 KB — **frame completo** (transcript + chrome) | **El que funciona en kimi**                                                  |
| Snapshot v2 (SerializeAddon)                        | Restaura pantalla serializada                       | Solo en `ttyServer.js`; vive en memoria del proceso (se pierde al reiniciar) |

Insight clave: cambiar de workspace recuperaba la vista porque el cambio de
layout emite un **SIGWINCH real** y kimi/Ink repinta todo. El fix replica eso.

### Fix implementado (ambos servidores)

En reattach con `session.mode === 'tui'`:

- **Ctrl+L para todas las TUIs de agente** (grok/opencode responden bien).
  Shells **excluidos**: su history replay sí funciona y Ctrl+L duplicaría el prompt.
- **Resize wobble adicional solo si `agentType === 'kimi'`**: `rows-1` y 150ms
  después `rows` — fuerza el repaint completo y aterriza en las dims reales.

Dónde:

- `sidecar-backend/server.js` — handler de conexión WS, +250ms tras el attach.
- `src/lib/terminal/ttyServer.js` — `_pendingTuiReattachRedraw` armado en el
  connect y disparado tras el `subscribe` v2 (orden garantizado), solo cuando
  **no hay snapshot** (si hay snapshot, el cliente restaura y el Ctrl+L podría
  borrar scrollback de la TUI).

Tests: `src/lib/terminal/__tests__/ttyServer.snapshot.test.js` (10/10, incl.
`v2-kimi-wobble`: orden exacto de los dos `resize`).

---

## 2. Modo de fallo: no se puede seleccionar/copiar en paneles kimi

### Causa raíz

DevHub forzaba los modos de mouse de xterm (`1000/1002/1003/1006`) en paneles
TUI. Con mouse tracking activo, xterm **manda los arrastres al PTY como eventos
de mouse en vez de seleccionar texto**. Windows Terminal/PowerShell no hacen
eso, por eso ahí sí se podía.

### Fix (ya existía desde 2026-07-20, commits `7e548f28` + `54634c0a`)

Hook del parser en `useTerminalEngine.js` (~línea 816): mientras la sesión es
kimi, traga cualquier DECSET de mouse (venga del PTY o de los "rebinds" propios)
→ la selección nativa queda libre. Verificado a nivel emulador:
sin hook → `mouseTrackingMode = 'any'` (selección muerta);
con hook → `'none'`.

Copiar luego: **Ctrl+Shift+C**, clic derecho → Copiar, o auto-copy en ajustes.

Ojo: la app **instalada** anterior al 2026-07-20 10:35 no tiene este fix —
re-empaquetar (`pnpm build` + `pnpm electron:build`) es cómo llega.

---

## 3. Recetas de diagnóstico (para la próxima vez)

1. **¿El PTY tiene contenido?**
   `curl http://127.0.0.1:4001/sessions` y luego
   `curl http://127.0.0.1:4001/sessions/<id>/output | jq .output`
   → si ahí está el UI pero el panel está negro: problema de entrega/render
   cliente, no del PTY.
2. **¿Qué hace la TUI ante un estímulo?** Medir deltas de output:
   - Ctrl+L: `curl -X PUT .../sessions/<id>/input -d '{"data":"\u000c"}'`
   - Resize: abrir WS a `/tty?sessionId=<id>` y enviar
     `{type:'resize',cols,rows}` dos veces (wobble).
   - Comparar `len(output)` antes/después. Así se probó que Ctrl+L ≠ repaint
     completo en kimi y que SIGWINCH sí.
3. **¿Mouse modes activos?** En node con el xterm del repo:
   `term.write('\x1b[?1003h', () => console.log(term.modes.mouseTrackingMode))`.
4. **Log cliente**: `localStorage.devhubTuiPointerDebug='1'` → eventos de
   pointer/wheel/scroll a `data/logs/terminal-debug.log`.
5. **¿Qué proceso sirve el puerto?** `netstat -ano | grep 4001` → PID →
   `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'` — confirma si el
   sidecar corre el código nuevo (fecha de creación) y desde qué ruta.

---

## 4. Checklist antes de tocar este subsistema

- [ ] ¿Estoy editando el servidor que la app realmente usa? (`sidecar-backend/`
      para las apps; `ttyServer.js` es el espejo con tests — mantener ambos).
- [ ] ¿El cambio requiere reiniciar `electron:up`? (sidecar sí, siempre).
- [ ] ¿Estoy asumiendo que Ctrl+L repinta TUIs? No en kimi — usar resize wobble.
- [ ] ¿Estoy gating en `isFirstClientAttach`? Es siempre true — no sirve.
- [ ] ¿El cliente espera contenido en reattach TUI? Por diseño recibe 0 bytes;
      la recuperación es Ctrl+L / wobble / snapshot, no history.
- [ ] ¿Nuevo modo de mouse para una TUI? Rompe selección — ver el hook DECSET
      de `useTerminalEngine.js`.

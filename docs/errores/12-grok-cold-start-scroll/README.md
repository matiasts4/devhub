# 12 — Grok cold-start / first-panel dead scroll

## Resumen

Al lanzar **Grok** en un panel terminal, el **scroll con la rueda a menudo no funcionaba** hasta:

- hacer **Ctrl+R** (reload del webview), o  
- abrir un **segundo** panel Grok (el segundo sí scrolleaba).

**OpenCode** y **Kimi** no presentaban este patrón. Tras el fix, Grok scrollea en el **primer** panel tras un cold start de la app, sin Ctrl+R.

**Estado:** corregido y verificado por el usuario (2026-07-18).  
**Alcance:** solo Grok TUI en xterm (desktop Tauri / dev). OpenCode sigue con native passthrough cuando el footer está ready.

---

## Síntomas (matriz de repro)

| Escenario | Antes | Después |
|-----------|--------|---------|
| Cold start app → abrir **primer** Grok → wheel | Muerto | OK |
| Cold start → Ctrl+R → abrir Grok nuevo → wheel | OK | OK |
| Abrir Grok #1 (muerto) → Grok #2 → wheel en #2 | OK en #2 | OK en ambos |
| OpenCode / Kimi cold start → wheel | OK | OK (sin regresión) |

---

## Causas raíz (apiladas)

Varias capas se sumaban; no bastaba un solo cambio.

### 1. Camino nativo que se traga el wheel (principal)

DevHub tiene dos caminos de wheel en TUIs Ink:

| Camino | Qué hace |
|--------|----------|
| **Native** | xterm convierte wheel → SGR 64/65 (si DECSET mouse está on) y manda por `onData` |
| **Inject** | `sendTerminalPasteInput` escribe SGR al PTY por WebSocket |

En el **primer panel Grok** era frecuente:

1. Se activaban modos mouse en el **emulador** xterm (rebind / `prepareActive` / reset) **antes** de que el TUI de Grok escuchara de verdad.
2. `forwardTerminalWheelToXterm` hacía `dispatchEvent` → devolvía “éxito”.
3. El handler hacía `preventDefault` / `stopPropagation`.
4. El TUI **no** procesaba el SGR → scroll muerto.
5. En el **segundo** panel el timing era distinto y a menudo caía en **inject** → funcionaba.

Ctrl+R remonta xterm + reattach con `resetTerminalModesForReattach` (mouse + DA query + redraw) cuando Grok ya está vivo → el siguiente launch ya no cae en ese estado.

### 2. Identidad Grok / `initialCommand` no en vivo

El handler de wheel a veces se creaba con un `initialCommand` capturado en el open del terminal. Si el comando Grok se resolvía tarde, el primer panel se trataba como shell (scroll local sobre alt-buffer = no-op).

### 3. Un solo rebind demasiado pronto

Un rebind a ~2,5 s en cold start a menudo corría **mientras Grok aún booteaba**. Luego se marcaba “ready” y el hot-path de detección **ya no re-enlazaba**.

### 4. Filtro de input (secundario / Next ttyServer)

`filterTerminalInputForSession` solo dejaba pasar SGR mouse si `mode === 'tui'` **y** `tuiReady === true`. En `ttyServer` el session casi nunca tenía `tuiReady`. En **desktop** el PTY real es el **sidecar**, cuyo filtro **no** strippea SGR 64/65 de la misma forma; el bug dominante para el usuario era el cliente (1–3). Aun así se endureció el filtro ESM (`agentType` / `isLiveTuiInputContext`) y se setea `tuiReady` al detectar agente.

### 5. OpenCode / Kimi por qué no fallaban igual

| Agente | Estrategia de wheel |
|--------|---------------------|
| **Kimi** | Scroll **local** xterm (`scrollLines`) — no depende de mouse del TUI |
| **OpenCode** | Native cuando footer confirmed + modos mouse reales del TUI |
| **Grok** | Ink full-screen; necesita SGR al PTY; más sensible al race del primer panel |

---

## Solución (diseño final)

### Estrategia de producto para Grok

**Siempre inject SGR al PTY. Nunca native passthrough.**

- `tuiAdapter.grok.wheelStrategy.passThrough = false`
- No llamar `setNativeWheelPassthrough(true)` en reconciles de Grok
- Payload: solo SGR 64/65 (sin flechas que roben el prompt)

### Módulo dedicado: `grokTuiWheelInject.js`

Enlazado en `useTerminalEngine` justo después de `terminal.open`:

1. Listener **capture** en `term.element` (`passive: false`).
2. `term.attachCustomWheelEventHandler` para el path alt-buffer de xterm (cuando no hay mouse protocol).
3. Getters **en vivo** para `initialCommand`, refs de lifecycle y socket (no closures stale).
4. Identidad Grok: `isGrokSessionRef` **o** comando `grok` **o** chrome en buffer.
5. `preventDefault` + `stopPropagation` + `stopImmediatePropagation` para que xterm no trague el evento.
6. Inject vía `sendTerminalPasteInput` (+ fallback send JSON/raw si hace falta).

### Bootstrap de flags (sin tormenta Ctrl+L)

`grokWheelBootstrap.js`: varios ticks en los primeros ~11 s para marcar sesión Grok y un **único** reset completo cuando hay chrome o tras N intentos — no un reset cada 600 ms (eso empeoraba el race del mouse host-side).

### Otros refuerzos

| Pieza | Rol |
|-------|-----|
| `useTerminalWheelRouter` | Grok excluido del native-forward; OpenCode sin cambio de producto |
| `useTerminalV2Session` | Al detectar chrome Grok: flags + inject-only; schedule bootstrap en fresh launch |
| `useTerminalPanelActivationRecovery` | Al activar panel Grok: assume launch para rebind ligero |
| `terminalNoiseFilter` / `ttyServer` | `isLiveTuiInputContext` + `session.tuiReady` / `agentType` (defensa en Next) |

---

## Archivos tocados (referencia)

### Cliente (críticos)

| Archivo | Cambio |
|---------|--------|
| `src/lib/terminal/grokTuiWheelInject.js` | **Nuevo** — inject dedicado Grok |
| `src/lib/terminal/grokWheelBootstrap.js` | **Nuevo** — multi-shot flags / un reset |
| `src/components/terminal/hooks/useTerminalEngine.js` | Bind inject al open de xterm |
| `src/components/terminal/hooks/useTerminalWheelRouter.js` | No native para Grok |
| `src/components/terminal/hooks/useTerminalV2Session.js` | Ready/chrome + bootstrap |
| `src/components/terminal/hooks/useTerminalPanelActivationRecovery.js` | Activate Grok |
| `src/components/terminal/TerminalTTY.helpers.js` | Payload SGR; reconcile no activa native |
| `src/lib/terminal/tuiAdapter.js` | `passThrough: false` para Grok |
| `src/components/TerminalTTY.jsx` | No apagar mouse en deactivate de agentes |

### Servidor / filtro (defensa)

| Archivo | Cambio |
|---------|--------|
| `src/lib/terminal/terminalNoiseFilter.js` | `isLiveTuiInputContext` |
| `src/lib/terminal/ttyServer.js` | `tuiReady` + ctx explícito al filtrar |

### Tests

| Archivo |
|---------|--------|
| `src/lib/terminal/__tests__/grokTuiWheelInject.test.js` |
| `src/lib/terminal/__tests__/grokWheelBootstrap.test.js` |
| `src/lib/terminal/tuiAdapter.test.js` |
| `src/components/terminal/hooks/__tests__/useTerminalWheelRouter.test.js` |
| `src/components/terminal/__tests__/reconcileGrokTuiWheelReadiness.test.js` |
| `src/lib/terminal/terminalNoiseFilter.test.js` |

---

## Cómo verificar (regresión)

### Manual (cold start real)

1. Cerrar **por completo** DevHub (no solo paneles).
2. Abrir la app.
3. Abrir **un solo** Grok (launcher / comando `grok`).
4. Cuando el TUI esté visible, rueda en el transcript **sin** Ctrl+R → debe scrollear.
5. Abrir un **segundo** Grok → ambos scrollean.
6. OpenCode / Kimi: smoke rápido de wheel sin regresión.

### Sonda opcional

```js
localStorage.setItem('devhubTuiPointerDebug', '1');
```

En logs de wheel Grok se espera inject (no depender de `native-forward` para Grok).

### Automatizado

```bash
npx jest src/lib/terminal/__tests__/grokTuiWheelInject.test.js \
  src/lib/terminal/__tests__/grokWheelBootstrap.test.js \
  src/lib/terminal/tuiAdapter.test.js \
  src/components/terminal/hooks/__tests__/useTerminalWheelRouter.test.js \
  src/components/terminal/__tests__/reconcileGrokTuiWheelReadiness.test.js \
  src/lib/terminal/terminalNoiseFilter.test.js --no-coverage
```

---

## Anti-patrones (no volver a hacer)

1. **Native passthrough para Grok** “porque OpenCode lo usa” — el primer panel traga el wheel.
2. **`setNativeWheelPassthrough(true)`** en reconciles de Grok.
3. **Marcar `grokTuiReady` + mouse host-side** en el `ready` del WS **antes** de que el TUI exista.
4. **Tormenta de `resetTerminalModesForReattach` / Ctrl+L** cada pocos cientos de ms durante el boot de Grok.
5. **Handlers de wheel con `initialCommand` capturado** en el open sin getters en vivo.
6. **Asumir que el sidecar y ttyServer filtran igual** — desktop usa sidecar; el cliente era el dominante.

---

## Relación con otros docs

- Triage general click/scroll TUI: [`../11-tui-click-scroll-triage/README.md`](../11-tui-click-scroll-triage/README.md)
- Mouse DECSET / focus basura: [`../03-terminal-canvas-glyph-corruption/`](../03-terminal-canvas-glyph-corruption/)
- Feature relacionada (paths clickeables en agente): `openspec/changes/agent-file-path-open/` (separada; no es la causa del scroll)

---

## Checklist de cierre

- [x] Cold start → primer Grok scrollea sin Ctrl+R (confirmado usuario)
- [x] Segundo Grok también OK
- [x] OpenCode / Kimi no rotos (comportamiento previo)
- [x] Tests unitarios de inject / adapter / bootstrap / filter
- [x] Documentado en este directorio

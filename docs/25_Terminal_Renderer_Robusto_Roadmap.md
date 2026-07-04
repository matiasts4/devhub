# Terminal renderer robusto — estrategia activa y roadmap

**Estado:** TERM-01 y TERM-02 cerrados, TERM-03 **descartado** (VTE eliminado en `terminal-engine-v2` Phase 0), TERM-04 cerrado como no-go, TERM-05 absorbido como decisión arquitectónica/documental. **`terminal-engine-v2` apply completo** (2026-07-04).
**Fecha:** 2026-05-16 (revisión: 2026-07-04 — xterm-only + motor v2 con PTY persistente y rehidratación).

## Decisión guía (vigente post `terminal-engine-v2`)

DevHub adopta **xterm-webgl como renderer por defecto** para workspace panels, command-bar spawns, swarm agent terminals y session restore. El stack es **xterm-only** (sin GTK/VTE nativo).

- `xterm-webgl` es el **renderer por defecto** para fresh users y para nuevos paneles sin preferencia almacenada.
- `xterm` (DOM) es el **fallback estable** cuando xterm-webgl no esté disponible (WebView sin WebGL, addon registration failure, context lost, etc.). En paneles `terminal-engine-v2`, el context loss **degrada permanentemente a DOM** (sin re-attach WebGL).
- **`vte-experimental` eliminado** — `native_vte.rs`, `nativeVteBridge.js` y branches VTE fueron retirados; preferencias legacy en `localStorage` se ignoran/migran a xterm.

**Motor `terminal-engine-v2` (flag por panel):** sidecar con ring buffer 2 MiB + pub/sub, termsize/cwd canónicos, rehidratación two-tier (`SerializeAddon` + delta), `unsubscribe` explícito (PTY vivo sin grace timer de 1 h), graveyard LRU global N=12, sesiones `opencode-durable` con `--session`. Spec: `openspec/changes/terminal-engine-v2/`.

La rama `checkpoint/terminal-experiments-2026-05-14` sigue valiendo como **material de referencia**, NO como merge directo: **no conviene mover esa rama completa**.

## Estado por TERM

| TERM    | Estado actual             | Decisión                                                                                                                                                                                 |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TERM-01 | Implementado              | Evidence pack + baseline/fallback documentado en `docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md`.                                                                                   |
| TERM-02 | Implementado              | Quedó la infraestructura de requested/effective renderer y fallback. La UI actual todavía expone selectores temporales en la vista terminal.                                             |
| TERM-03 | **Descartado**            | VTE nativo eliminado (`terminal-engine-v2` Phase 0). Stack xterm-only.                                                                                                                   |
| TERM-04 | Cerrado / no-go por ahora | **No se sigue con Ghostty/libghostty** salvo que TERM-03 y la auditoría de compatibilidad demuestren un bloqueo real que xterm-webgl + xterm fallback no puedan resolver razonablemente. |
| TERM-05 | Dirección aceptada        | Estrategia canónica vigente: xterm-webgl default, xterm DOM fallback. VTE descartado. Lifecycle v2 en `terminal-engine-v2`.                                                              |

## Qué queda descartado o degradado

### 1. Ghostty / libghostty

Ghostty queda **fuera del roadmap activo**.

Motivo:

- hoy no hay evidencia de que haga falta abrir otra línea nativa más compleja;
- suma costo de build, empaquetado, runtime y mantenimiento;
- distrae del problema real actual, que ya no es “encontrar otro renderer”, sino **cerrar bien el camino GTK/VTE y su compatibilidad con la app**.

Reapertura permitida sólo si aparece un gap concreto y probado que GTK/VTE + xterm fallback no puedan cubrir.

### 2. WezTerm / Alacritty / Kitty / terminal externa

Quedan **rechazados como dirección principal**.

Motivo:

- no cumplen bien el requisito de terminal realmente dentro del layout DevHub;
- tensionan foco, z-index, resize, docking y multi-monitor;
- pueden servir como debug/manual fallback externo, pero NO como renderer del panel principal.

### 3. Overlay / child-window nativo

Queda como **último recurso degradado**, no como arquitectura objetivo.

Motivo:

- puede “parecer” in-app pero no comportarse como panel real;
- complica lifecycle, stacking, resize fino y consistencia UX.

## Hallazgos de auditoría pendientes

La parte visual de GTK/VTE mejoró mucho, pero todavía NO se puede declarar “camino terminal resuelto” por estas razones:

### A. Hoy conviven dos runtimes al mismo tiempo

`src/components/TerminalTTY.jsx` todavía inicializa xterm y abre el WebSocket/PTy incluso cuando el renderer efectivo es GTK/VTE.

Eso significa que el renderer nativo mejora la superficie visual, pero el pipeline viejo sigue vivo en paralelo.

**Dirección requerida:** un panel debe tener **un solo runtime terminal activo a la vez**.

### B. OpenCode/Hermes no están cerrados igual bajo GTK

`src/lib/terminal/nativeVteBridge.js` ya sabe reenviar eventos nativos tipo:

- `opencode-session-detected`
- `hermes-session-detected`
- `terminal-exit`

Pero en `src-tauri/src/native_vte.rs` hoy sólo quedó verificado claramente el emit de:

- `runtime-error`
- `terminal-exit`

Conclusión: la capa frontend está preparada para más paridad nativa, pero **no está probado que GTK emita hoy la misma semántica de sesión que el camino xterm/WebSocket**.

### C. OpenCode tiene reanudación parcial; Hermes no

`src/components/TerminalWorkspacesManager.jsx` escucha `devhub:opencode-session-detected` y `devhub:terminal-exit` para reopen/resume.

No existe wiring equivalente ahí para `devhub:hermes-session-detected`.

Además, `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` ya documenta que Hermes **no se considera reboot-safe resumable history** hoy.

### D. Swarm / Agent Room todavía dependen del pipeline viejo

Como la detección y varios eventos siguen pasando por el camino xterm/WebSocket, todavía hace falta auditar:

- launches desde Swarm/Bridge;
- tracking de `agent_runs` / `agent_registry`;
- reanudación de sesiones OpenCode;
- comportamiento real de Hermes;
- fallback/restore después de `terminal-exit` o error nativo.

### E. La UX de renderer todavía muestra una etapa anterior

Antes de TERM-08/09 seguían existiendo:

- opciones `ghostty-experimental` en `src/components/terminal/terminalRendererCapabilities.js` y `terminalRendererPreferences.js`;
- selectores `Renderer por defecto` y `Vista activa` en `src/components/TerminalWorkspacesManager.jsx`;
- copy de UI como `GTK VTE experimental · misma ventana · panel activo` en `src/components/TerminalTTY.jsx`.

Eso CONTRADICÍA la dirección actual. TERM-08/09 lo corrigen moviendo la preferencia a Settings, ocultando selectores operativos del header y tratando Ghostty sólo como compatibilidad legacy migrada a `xterm`.

**Dirección requerida:** la selección/configuración del renderer debe migrar a **Settings**, y la vista terminal no debería exponer un selector si el usuario normal no necesita operar esa decisión ahí.

## Estrategia activa a partir de ahora

1. **xterm-webgl es el renderer por defecto** para workspace panels, command-bar spawns, swarm agent terminals y session restore.
2. **xterm (DOM) queda como fallback único y estable** cuando xterm-webgl no esté disponible.
3. **GTK/VTE descartado** — renderer xterm-only; ver `terminal-engine-v2` para lifecycle persistente.
4. **Ghostty/libghostty sale del roadmap activo.**
5. **No se aceptan terminales externas/overlay como camino principal.**
6. **No se considera listo TERM-03** hasta auditar OpenCode, Hermes, Swarm y reanudación real.
7. **No se debe arrancar dos runtimes a la vez** para el mismo panel salvo fallback/recovery explícito.
8. **La configuración del renderer debe vivir en Settings**, no en el header operativo de la terminal.
9. **Soft roll-out:** stored `vte-experimental` se preserva; no se sobreescribe la preferencia del usuario en primer load.

## Próximos trabajos recomendados

### TERM-03 cierre real

- revalidar los pendientes 5.3 y 6.15 del cambio `openspec/changes/term-03-gtk-vte-native-spike/`;
- rerun focalizado con entorno que sí tenga `libsoup-3.0`, `javascriptcoregtk-4.1` y `webkit2gtk-4.1` para poder compilar/probar el camino Rust.

### TERM-06 — Auditoría de compatibilidad GTK/VTE

Verificar de punta a punta:

- OpenCode launch/detección/reopen;
- Hermes launch/detección/durabilidad;
- Swarm / Agent Room / `agent_runs` / `agent_registry`;
- `terminal-exit`, recovery y fallback.

### TERM-07 — Separación de runtime activo

Cambiar `TerminalTTY` para que, cuando GTK/VTE sea el renderer efectivo, **no bootée también el runtime xterm/WebSocket** salvo que el fallback se active de forma deliberada.

### TERM-08 — UX/configuración de renderer

- mover la preferencia a Settings;
- ocultar selectores del header terminal;
- limpiar labels `experimental` y referencias activas a Ghostty.

### TERM-09 — Limpieza de docs/tests/copy

Actualizar documentación y tests para que reflejen la estrategia nueva: GTK/VTE default + xterm fallback, sin Ghostty como candidato activo.

## Criterio para reabrir TERM-04

Sólo reabrir Ghostty/libghostty si pasa TODO esto:

- existe un bloqueo concreto, reproducible y relevante en GTK/VTE;
- ese bloqueo no se resuelve razonablemente con hardening del camino actual;
- el costo de build/empaquetado/runtime de Ghostty está justificado por evidencia, no por intuición.

Si no se cumplen esas tres condiciones, TERM-04 permanece cerrado.

## Referencias

- `docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md`
- `openspec/changes/term-03-gtk-vte-native-spike/`
- `src/components/TerminalTTY.jsx`
- `src/components/TerminalWorkspacesManager.jsx`
- `src/components/terminal/terminalRendererCapabilities.js`
- `src/components/terminal/terminalRendererPreferences.js`
- `openspec/changes/terminal-engine-v2/` (motor v2, apply completo)
- `src/lib/terminal/v2Graveyard.js`

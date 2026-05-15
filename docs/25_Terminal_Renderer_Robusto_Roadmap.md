# Terminal renderer robusto — investigación y roadmap

**Estado:** TERM-01 implementado como slice de evidence pack + hardening diagnóstico; roadmap abierto para fases siguientes.
**Fecha:** 2026-05-15.
**Motivo:** en la app instalada/desktop la terminal puede desfasarse visualmente: OpenCode queda casi invisible hasta hacer resize, aparecen artefactos horizontales, y paneles como editor/browser pueden romperse o quedar sin pintar. En dev se observa más estable que en la versión instalada.

## Diagnóstico operativo inicial

El síntoma principal parece de **render/layout**, no necesariamente de proceso:

- el contenido vuelve a aparecer tras un resize manual;
- los artefactos coinciden con repaint/fitting/compositor más que con caída de PTY;
- el transporte actual sigue siendo `xterm` + WebSocket + `node-pty`;
- el código actual ya intenta estabilizar con `ResizeObserver`, `fitAddon.fit()`, `term.refresh()`, `clearTextureAtlas()`, eventos de focus/visibility/pageshow y superficie sólida.

Hipótesis a verificar en una investigación futura:

1. **Diferencia dev vs instalada:** bundle desktop/static, WebKitGTK/Tauri, GPU/compositor, timing de carga y sidecar pueden cambiar el orden de resize/repaint.
2. **Fit temprano o dimensiones cero:** xterm puede abrir antes de que el panel tenga dimensiones reales, especialmente con splits, docks, tabs o panes laterales.
3. **Compositor/transform/animación:** `framer-motion`, resizable panels, opacity/transforms o contenedores con overflow pueden dejar capas inválidas hasta un resize.
4. **Version skew:** la app instalada puede venir de un build anterior al estado actual de `refactor/ui`.
5. **Sesiones largas/TUI pesado:** OpenCode, imágenes o TUIs con mucho repaint estresan más la ruta canvas/DOM de xterm.

## Estado de la rama experimental

Existe la rama/checkpoint local:

- `checkpoint/terminal-experiments-2026-05-14`

Esa rama agrega una exploración grande de terminal nativa/alternativa:

- SDD/OpenSpec sobre `terminal-ghostty-replacement-spike`, `terminal-gtk-host-bridge`, `terminal-gtk4-vte-foundation`, `terminal-native-surface-wiring`, `terminal-linux-gtk4-desktop-seam`.
- Código Rust/Tauri para `gtk_host_bridge.rs`, `native_terminal.rs`, `linux_shell_runtime.rs`, `ghostty_vt_bridge.rs`.
- Runtime adapters JS (`nativeHostRuntimeAdapter`, `xtermRuntimeAdapter`, `terminalRuntimeAdapter`) y tests asociados.
- Wrapper/documentos locales para `native-terminal:dev`, `native-terminal:test`, `native-terminal:check`.

Conclusión: **no conviene mover esa rama completa tal cual**. Tiene valor como investigación y fuente de specs, pero es grande, mezcla varias direcciones y sus propios reportes declaran que la prueba visual same-window quedó bloqueada/incompleta.

## Recomendación

Usar la rama experimental como **cantera de diseño**, no como merge directo.

## Opciones de renderer — ranking de mejor a peor para DevHub

Condición no negociable: la terminal debe **verse y ajustarse dentro de la app**, en el panel de DevHub, sin abrir una ventana externa. Cualquier opción seria implica cambios grandes; por eso la evaluación debe quedar como tareas/spikes separados, con fallback.

| Ranking | Opción                                                        | Encaje in-app                                                                    | Riesgo     | Veredicto                                                                                                                                                                   |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `xterm.js` reforzado                                          | ✅ Total, ya es la base actual                                                   | Bajo/medio | Mejor primer paso porque mantiene compatibilidad y fallback. No resuelve todo si el problema viene de WebKit/compositor, pero debe quedar robusto igual.                    |
| 2       | GTK VTE Linux embebido                                        | ✅ Bueno para Linux/Tauri si se logra insertar como widget/panel                 | Medio/alto | Mejor alternativa nativa inicial. VTE es un widget GTK de terminal real; encaja con Linux, pero requiere bridge Rust/GTK, lifecycle, bounds y evidencia visual same-window. |
| 3       | `libghostty` / Ghostty embebido                               | ✅ Potencialmente, si se integra como librería y no como app externa             | Alto       | Muy prometedor para terminal moderna/GPU, pero debe tratarse como spike posterior: API, build, empaquetado y embedding real en Tauri deben probarse antes.                  |
| 4       | WebGL/canvas renderer alternativo sobre xterm                 | ✅ Total                                                                         | Medio      | Puede ayudar si el fallo es de renderer, pero no cambia la arquitectura de fondo. Debe probarse como variante del baseline, no como reemplazo estructural.                  |
| 5       | Terminal nativa por overlay/child-window                      | ⚠️ Parcial: puede “parecer” dentro, pero no pertenecer realmente al layout React | Alto       | No recomendada salvo último recurso. Suele romper foco, z-index, resize, multi-monitor y docking.                                                                           |
| 6       | WezTerm/Alacritty/Kitty/terminal externa embebida por proceso | ❌ Malo para el requisito                                                        | Alto       | Rechazada como dirección principal si abre o controla una ventana externa. Sólo serviría como herramienta externa/debug, no como panel DevHub.                              |
| 7       | tmux/Zellij/sesión persistente sin cambiar renderer           | ❌ No arregla visualización                                                      | Bajo       | Útil para persistencia o recuperación de sesión, pero no corrige el bug de pintura del panel. Complemento, no renderer.                                                     |

### Lectura del ranking

- **GTK VTE Linux** queda como la mejor opción nueva a probar después de estabilizar el baseline.
- **Ghostty/libghostty** queda explícitamente documentado como opción candidata, pero no debería ir primero porque hay más incertidumbre de integración.
- **Terminal externa/overlay** queda abajo por incumplir o tensionar el requisito de verse dentro de DevHub.
- **xterm** no se elimina: aunque se agregue VTE/Ghostty, debe seguir como fallback funcional.

Dirección recomendada por fases:

### TERM-0 / TERM-01 — Evidence pack antes de implementar cambios de renderer

Capturar pruebas reproducibles:

- dev web vs Tauri dev vs app instalada;
- OpenCode normal, OpenCode con output pesado, splits, editor/browser abierto, resize, cambio de workspace;
- logs de dimensiones del contenedor antes/después de `fit()`;
- evidencia visual antes/después de resize;
- versión exacta del build instalado.

Criterio: no tocar arquitectura hasta poder reproducir el fallo en 2–3 casos mínimos.

**Cierre TERM-01 (2026-05-15):**

- se agrega `docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md` como protocolo reproducible y guía manual QA;
- `xterm` queda reafirmado como baseline/fallback explícito;
- `checkpoint/terminal-experiments-2026-05-14` queda documentada como material de referencia, no merge directo;
- se agregan diagnósticos livianos cliente/servidor para resize, repaint, visibility/focus return y correlación cols/rows sin meter ruido excesivo.

### TERM-1 — Fortalecer xterm actual como baseline

Mantener xterm como default y fallback.

Posibles líneas:

- separar un `terminalRuntimeAdapter` pequeño y testeable;
- hacer el resize/repaint idempotente por snapshot de dimensiones/DPR;
- evitar animaciones/transforms/opacity sobre la superficie viva cuando el panel está activo;
- diferir `terminal.open()` hasta dimensiones estables;
- agregar botón/acción interna “repaint terminal” además del resize manual;
- tests enfocados para zero-size, focus return, visibility return, split resize y reconnect.

Esto preserva compatibilidad y reduce riesgo.

### TERM-2 — Switch explícito de renderer/fallback

Agregar una preferencia por workspace/panel:

- `xterm` como modo estable por defecto;
- `native-vte` / `native-host` como modo experimental;
- fallback automático a xterm si el host nativo no prueba ready real;
- UI visible para volver inmediatamente al modo anterior.

Regla: ningún renderer nuevo puede reemplazar al baseline sin escape hatch.

### TERM-3 — Native terminal como spike acotado

Si el baseline sigue fallando con TUIs pesados, retomar sólo un slice de la rama experimental:

- un único panel nativo activo;
- Linux/Tauri dev primero;
- sin vendorear runtime Tauri completo;
- sin mezclar Ghostty, GTK host bridge y GTK4/VTE en el mismo cambio;
- aceptación obligatoria con evidence pack: prompt visible dentro del panel, escritura, resize, switch de panel, cierre, y prueba de que no abre ventana externa.

Suborden recomendado:

1. GTK VTE Linux in-app.
2. `libghostty`/Ghostty in-app.
3. Sólo si ambas fallan: investigar overlay/child-window, marcado como degradado/no ideal.

### TERM-4 — Integración gradual

Sólo después de evidencia:

- persistencia de preferencia por panel/workspace;
- migración de sesiones o reinicio controlado;
- documentación usuario;
- pruebas E2E visuales si Playwright/Tauri lo permite.

## Decisión provisional

- **No merge directo** de `checkpoint/terminal-experiments-2026-05-14`.
- **Sí reutilizar** documentos, tests e ideas de esa rama.
- **Prioridad:** alta como deuda UX/desktop, pero posterior a las tareas Swarm/continuidad ya planificadas salvo que el fallo bloquee el uso diario.
- **Modo de trabajo futuro:** primero auditoría + evidence pack, luego hardening xterm, recién después spike nativo con fallback.

## Criterios de aceptación futuros

- Reproducir y documentar al menos un caso real del fallo.
- Demostrar que el fix no depende de resize manual.
- Mantener xterm como fallback funcional.
- Mantener un switch visible para volver al renderer anterior.
- No declarar “terminal nativa lista” sin prueba visual same-window.
- Tests enfocados verdes para las rutas modificadas.

## Referencias primarias para futuras investigaciones

- xterm.js docs/addons: https://xtermjs.org/docs/ y https://xtermjs.org/docs/guides/using-addons/
- GNOME VTE GTK terminal widget: https://gnome.pages.gitlab.gnome.org/vte/gtk3/class.Terminal.html
- Ghostty / `libghostty`: https://github.com/ghostty-org/ghostty y https://ghostty.org/docs
- Tauri v2 docs: https://v2.tauri.app/

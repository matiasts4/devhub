# Catálogo de crashes y fallos — lifecycle terminales / TUIs

> Clasificación para priorizar remediación. Severidad: **P0** = app irrecuperable sin reload; **P1** = panel muerto pero app sigue; **P2** = visual degradado sin throw.

---

## P0 — Crashes de runtime (React / xterm)

| ID       | Mensaje / firma                                                                | Trigger típico                                           | Capa faltante | Recuperable | Estado                                                                        |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------- | ----------- | ----------------------------------------------------------------------------- |
| **C-01** | `Can't find variable: hostRef`                                                 | Mount portal shared surface                              | L3 Portal     | No          | **Fixed** — `getActiveTarget`                                                 |
| **C-02** | `undefined is not an object (evaluating 'this._renderer.value.dimensions')`    | `term.refresh()` / `_innerRefresh` sin renderer          | L5 + L6       | No          | **Mitigado** — guards en `refreshTerminalViewport`; gaps en bursts            |
| **C-03** | `undefined is not an object (evaluating '_this._renderer.value.handleResize')` | ResizeObserver / fit durante dispose WebGL addon         | L5            | A veces     | **Mitigado** — A.4 + `neutralizeWebglAddonForDisposal`; stray events en swarm |
| **C-04** | React error boundary (árbol TWM cae)                                           | Cualquier throw no capturado en layout effect / listener | L1–L6         | No          | Abierto — depende de C-02/C-03 en path no cubierto                            |

**Correlación TUI:** OpenCode/grok/Claude Code activan más **C-02/C-03** porque `tuiSessionActive` dispara resize debounce + refresh agresivo y el canvas addon debe re-adjuntarse al ganar proyección.

---

## P1 — Panel muerto / no recuperable sin interacción

| ID       | Síntoma                                                        | Trigger típico                                        | Capa faltante       | Recuperable con click | Estado                                 |
| -------- | -------------------------------------------------------------- | ----------------------------------------------------- | ------------------- | --------------------- | -------------------------------------- |
| **V-01** | Panel negro (fondo app, sin TUI)                               | Swarm launch, grid 4+, standby workers                | L3 + L4 + L6        | A menudo sí           | Abierto                                |
| **V-02** | OpenCode footer visible pero transcripto vacío / `5;22H` leaks | Projection ready antes de canvas attach               | L6 + TUI focus      | Parcial               | Abierto                                |
| **V-03** | Panel no repinta tras cerrar sibling                           | `panel-closed` sin burst correcto para supervivientes | L1                  | Resize manual         | **Mitigado** — `panel-closed` reciente |
| **V-04** | Native VTE fantasma cubre dock/handle                          | Cierre sin `closeNativeVtePanel`                      | L2 (solo ws remove) | No                    | Parcial — `handleClosePanel` explícito |

---

## P2 — Degradación visual (sin crash)

| ID       | Síntoma                                          | Trigger                                    | Doc relacionado                                                                                       | Estado                                                         |
| -------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **G-01** | Bloques grises, glifos superpuestos              | GPU atlas en panel oculto                  | [03-terminal-canvas-glyph-corruption](../03-terminal-canvas-glyph-corruption/README.md)               | Abierto                                                        |
| **G-02** | `1;2c0;276;0c` en prompt (DA1 leak)              | Focus reporting en panel inactivo          | TerminalTTY blur path                                                                                 | Mitigado parcial                                               |
| **G-03** | Layout Ink roto (cols/rows incorrectos al boot)  | `initialCommand` antes de viewport fit     | swarm-launch burst timing                                                                             | Abierto                                                        |
| **G-04** | Prompt bootstrap ZED superpuesto / texto partido | lazy launch 1 panel + tmux paste largo     | [05-swarm-bootstrap-injection-debug](./05-swarm-bootstrap-injection-debug-2026-06-13.md)              | **Abierto** — debug 2026-06-13                                 |
| **G-05** | Pegar en Grok envía un mensaje por línea         | Copy multilínea DevHub → paste en TUI Grok | [07-terminal-clipboard-grok-multiline-paste](../07-terminal-clipboard-grok-multiline-paste/README.md) | **Fixed** — bracketed paste + bloqueo paste xterm (2026-07-06) |

---

## P1 — API / control plane (no xterm, pero spam y UI rota)

| ID       | Error                                         | Trigger                            | Estado                     |
| -------- | --------------------------------------------- | ---------------------------------- | -------------------------- |
| **A-01** | `params is a Promise` en `bus-snapshot` → 400 | Poll `useSwarmBusSnapshot` cada 3s | **Fixed** — `await params` |
| **A-02** | Mismo patrón en `timeline` route              | Control room / delegation          | **Fixed**                  |

---

## Árbol de decisión rápido (debug)

```
¿Hay throw en consola?
├─ Sí → C-01..C-04 → buscar handleLayoutSettled / dispose / refresh sin guard
└─ No → ¿Panel negro?
    ├─ Sí, tras swarm → V-01 → projection-ready + canvas reattach
    ├─ Sí, tras cerrar otra pestaña → V-03 → panel-closed burst
    └─ Sí, con basura ANSI → V-02 / G-02 → TUI focus + visibility
```

---

## Extracción de evidencia

```bash
# Lifecycle dispose/boot por sesión
rg '"event":"(dispose|boot)"' data/logs/terminal-debug.log | tail -50

# Viewport / renderer
rg 'RENDER:|fit-skip|layout-settled' data/logs/terminal-debug.log | tail -80

# API swarm
rg 'bus-snapshot|panel-closed|swarm-launch' .next/server/logs 2>/dev/null || true
```

Al reportar un incidente nuevo, usar plantilla:

```
ID: C-__ / V-__ / G-__
Trigger: (swarm-launch | panel-close | split | …)
Paneles: N, renderer: canvas|webgl|vte
TUI: opencode|grok|shell|claude-code
Recuperable sin reload: sí/no
Log snippet: (LIFECYCLE / stack trace)
```

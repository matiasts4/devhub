# 04 — Huecos de cobertura en lifecycle de terminales / TUIs

## Resumen

El change `openspec/changes/terminal-pizarra-stability` endureció el path **workspace ↔ pizarra** (singleton `SharedTerminalSurface`, GPU release, cola IPC, guard `isDisposingRef`). Esos arreglos **no se propagaron de forma sistemática** al resto de transiciones de terminal: swarm launch, cierre de pestañas, splits, relaunch, etc.

En dev, `isPizarraSharedViewEnabled()` está **ON por defecto**, así que _todos_ los paneles usan la arquitectura singleton — pero la matriz de verificación y los guards solo cubrían pizarra.

**Estado:** abierto — plan de remediación en [03-remediation-plan.md](./03-remediation-plan.md).

**Relacionado:**

- [03-terminal-canvas-glyph-corruption](../03-terminal-canvas-glyph-corruption/README.md) — síntomas visuales TUI
- [terminal-pizarra-stability apply-progress](../../../openspec/changes/terminal-pizarra-stability/apply-progress.md) — trabajo ya hecho (A.0–A.5, B, C)
- [baseline-metrics](../03-terminal-canvas-glyph-corruption/baseline-metrics.md) — matriz de repro (filas 8–15 añadidas para gaps)

---

## La “constelación” (capas que deben ir juntas)

Ninguna capa sola evita crashes. Cada lifecycle trigger debe aplicar **todas** las que correspondan:

| Capa                 | Ubicación                                        | Qué hace                                                                          |
| -------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| **L1 Dispatchers**   | `TerminalWorkspacesManager`, hooks               | `dispatchTerminalLayoutSettled`, `notifyNativeLayoutSettled`, solo panelIds vivos |
| **L2 Closing guard** | TWM                                              | `panelsClosingRef` — bloquea eventos/metadata durante teardown                    |
| **L3 Portal guards** | `SharedTerminalSurface.jsx`                      | `mounted`, `propsBySurfaceId.has`, ResizeObserver diferido                        |
| **L4 Visibility**    | `resolveSharedTerminalVisibility`                | `isVisibleInLayout` correcto cuando host no proyecta                              |
| **L5 Dispose**       | `TerminalTTY.jsx`                                | `isDisposingRef`, disconnect observers, `neutralizeWebglAddonForDisposal`         |
| **L6 Renderer**      | `refreshTerminalViewport`, `fitTerminalViewport` | `isTerminalRendererReady`, `isStaleXtermRendererError`                            |

Si falta una capa en un camino, el crash reaparece aunque las demás estén bien.

---

## Navegación

| Doc                                                                                                    | Contenido                                                      |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [01-crash-catalog.md](./01-crash-catalog.md)                                                           | Firmas de crash, severidad, recuperabilidad, correlación TUI   |
| [02-coverage-matrix.md](./02-coverage-matrix.md)                                                       | Tabla lifecycle × capas L1–L6                                  |
| [03-remediation-plan.md](./03-remediation-plan.md)                                                     | Fases, tareas, archivos, criterios de aceptación, tests        |
| [05-swarm-bootstrap-injection-debug-2026-06-13.md](./05-swarm-bootstrap-injection-debug-2026-06-13.md) | **Registro debug G-04** — hipótesis, fixes 1–8, evidencia logs |

---

## Headline metrics (extensión de A.0)

Además de **dispose-count-per-toggle = 0** en toggles pizarra:

| Métrica                                                        | Target                                   |
| -------------------------------------------------------------- | ---------------------------------------- |
| Crashes en swarm launch (5 paneles)                            | 0                                        |
| Crashes al cerrar N pestañas secuencialmente                   | 0                                        |
| Paneles negros sin click post-launch                           | 0 (o recuperación automática &lt; 500ms) |
| `bus-snapshot` 4xx/5xx en poll                                 | 0                                        |
| Errores no capturados en `handleLayoutSettled` durante dispose | 0                                        |

Logs: `data/logs/terminal-debug.log` (`LIFECYCLE:*`, `RENDER:*`, `fit-skip`).

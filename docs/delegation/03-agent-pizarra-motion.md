# Prompt — Agente 3: Pizarra + Motion + Aura Zed

> Copia todo este documento como prompt inicial en tu sesión OpenCode.
> Lee primero [`00-shared-context.md`](00-shared-context.md).

---

## Misión

Elevar animaciones y transiciones de **pizarra** (workspace↔canvas, superficies live, scroll/zoom), pulir integración Zed→pizarra, y refinar el **aura sutil** del Asistente Zed al activarse. Ejecuta SDD completo.

**Dependencia:** rollout prod de `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` debe esperar terminales estables (Agente 1). Animaciones y aura pueden avanzar en dev sin esperar.

---

## Comportamiento esperado — Requisitos funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| FR-P01 | Toggle workspace↔pizarra sin perder scrollback/sesión terminal | P0 (flag ON en staging) |
| FR-P02 | Transición fluida cross-fade + slide; sin doble animación anidada | **P0** |
| FR-P03 | Spawn terminal/browser en canvas con enter animation (opacity/scale) | P1 |
| FR-P04 | Wheel sobre terminal scrollea terminal; wheel en fondo zoom canvas | P1 |
| FR-P05 | Zoom focal bajo cursor (`zoomAtPoint`) | P1 |
| FR-P06 | Zed `open_url` → browser en pizarra + auto-layout confiable | P1 |
| FR-P07 | Zed `open_terminal` permanece en pizarra | P1 |
| FR-P08 | Fix audit: multi-select transformer, círculo centro, live preview dibujo | P1 |
| FR-P09 | Aura Zed **sutil**: gradiente ligero por fase; acento discreto por tool type | P1 |

## Requisitos no funcionales

- NFR-P01: `prefers-reduced-motion` → transiciones ≤50ms o `instant`
- NFR-P02: Animar chrome interno de superficies, **nunca** wrapper posicionado (regla `surfaceMotion.js`)
- NFR-P03: Un solo `ModeTransitionShell` por toggle — eliminar anidamiento en `WorkspaceRightDock` + `PizarraPane`
- NFR-P04: E2E `pizarra-shared-view-state.spec.ts` verde; añadir test transición si falta
- NFR-P05: Aura no bloquea clicks en terminal (z-index < modales, pointer-events:none en overlay)
- NFR-P06: Montar `MotionProvider` en shell app si no está
- NFR-P07: Unificar tokens — preferir `motion-tokens.js` + `surfaceMotion.js`; no easing suelto

---

## Estado verificado — gaps animación

| Gap | Evidencia |
|-----|-----------|
| Enter anim definido pero no aplicado | `SURFACE_ENTER_ANIMATION` en `surfaceMotion.js`; no usado en `PizarraLiveSurfaceLayer.jsx` |
| Doble `ModeTransitionShell` | `WorkspaceRightDock.jsx` y `PizarraPane.jsx` ambos envuelven |
| Spec drift | `useModeTransition`: debounce 0 vs spec 200ms; sin leaving visual; `DUR.base` 220 vs leave 110ms |
| `usePizarraModeTransition` huérfano | Scrim approach no cableado; import roto `MODE_TRANSITION` |
| `shouldCanvasConsumeWheel` no cableado | Testeado en `pizarraWheel.js`, no en `PizarraCanvas.jsx` |
| Aura sin tool-type | `ZedAmbientOverlay.jsx` solo cambia opacity por fase |

---

## Casos de uso de aceptación

**UC-4:** Toggle a pizarra → una sola animación ~220ms; terminal "Chase" conserva scrollback; browser nuevo entra con fade-in.

**UC-5:** Abro Zed → overlay sutil; al ejecutar tool terminal, leve shift de acento (no pulsación agresiva).

---

## Lecturas obligatorias (en orden)

1. [`docs/delegation/00-shared-context.md`](00-shared-context.md)
2. [`openspec/changes/pizarra-shared-view-state/proposal.md`](../../openspec/changes/pizarra-shared-view-state/proposal.md)
3. [`openspec/changes/pizarra-shared-view-state/design.md`](../../openspec/changes/pizarra-shared-view-state/design.md)
4. [`openspec/changes/pizarra-shared-view-state/tasks.md`](../../openspec/changes/pizarra-shared-view-state/tasks.md) — **contrastar con código**, muchos `[ ]` están hechos
5. [`src/lib/pizarra/surfaceMotion.js`](../../src/lib/pizarra/surfaceMotion.js)
6. [`src/lib/pizarra/useModeTransition.js`](../../src/lib/pizarra/useModeTransition.js)
7. [`src/lib/pizarra/ModeTransitionShell.jsx`](../../src/lib/pizarra/ModeTransitionShell.jsx)
8. [`src/lib/pizarra/pizarraWheel.js`](../../src/lib/pizarra/pizarraWheel.js)
9. [`src/lib/pizarra/canvasViewport.js`](../../src/lib/pizarra/canvasViewport.js) — `zoomAtPoint`
10. [`src/components/pizarra/PizarraCanvas.jsx`](../../src/components/pizarra/PizarraCanvas.jsx)
11. [`src/components/pizarra/PizarraPane.jsx`](../../src/components/pizarra/PizarraPane.jsx)
12. [`src/components/pizarra/PizarraLiveSurfaceLayer.jsx`](../../src/components/pizarra/PizarraLiveSurfaceLayer.jsx)
13. [`src/components/workspace/WorkspaceRightDock.jsx`](../../src/components/workspace/WorkspaceRightDock.jsx)
14. [`src/components/asistente/ZedAmbientOverlay.jsx`](../../src/components/asistente/ZedAmbientOverlay.jsx)
15. [`src/components/ui/system/motion-tokens.js`](../../src/components/ui/system/motion-tokens.js)
16. [`docs/audits/04-pizarra.md`](../audits/04-pizarra.md)

---

## Alcance de archivos (puedes modificar)

- `src/components/pizarra/**`
- `src/lib/pizarra/**`
- `src/components/workspace/WorkspaceRightDock.jsx`, `rightDockLayout.js`
- `src/components/workspace/SharedSurfacesProvider.jsx`, `SurfacePortal.jsx`
- `src/lib/pizarra/featureFlag.js` (documentar rollout staging)
- `src/components/asistente/ZedAmbientOverlay.jsx`
- `src/lib/asistente/zedOverlayEvents.js`, `buildZedAmbientStatus.js`
- `src/app/globals.css` — **solo** bloque `zed-aura-*` keyframes
- `src/App.js` o shell — montar `MotionProvider`
- Tests pizarra + `ZedAmbientOverlay.test.jsx`
- E2E `tests/e2e/pizarra-shared-view-state.spec.ts`

## Fuera de alcance (NO tocar)

- `terminalNoiseFilter.js`, mouse click strategy (Agente 1)
- `src/lib/asistente/tools/**` (Agente 2)
- Swarm/orquestación
- Refactor masivo `globals.css` themes (Agente 4)
- Undo/redo pizarra, export PNG

---

## SDD workflow — ejecutar en orden

### 1. explore
Dos explorations (o una combinada):
- `openspec/changes/pizarra-motion-polish/exploration.md` — inventario animación actual vs spec
- `openspec/changes/zed-ambient-aura/exploration.md` — estado aura

**Tarea crítica explore:** reconciliar `pizarra-shared-view-state/tasks.md` con código real; producir `reconciliation.md` listando qué tasks están done vs pending.

### 2. propose → 3. spec → 4. design

**pizarra-motion-polish** debe cubrir:
- Dedupe `ModeTransitionShell` (un solo owner: probablemente `WorkspaceRightDock`)
- Wire `shouldCanvasConsumeWheel` en wheel handler de `PizarraCanvas`
- Focal zoom en wheel
- Apply `SURFACE_ENTER_*` en `PizarraLiveSurfaceLayer`
- Fix audit P0 (transformer, circle, preview)
- Align durations con spec o actualizar spec si decisión consciente

**zed-ambient-aura** debe cubrir:
- Intensidad sutil (opacity executing ≤0.35, open ≤0.18)
- `--accent-terminal`, `--accent-browser`, `--accent-file` vía CSS vars
- Tool type pasado desde `useZedChat` / `zedOverlayEvents` al overlay
- Reduced motion: desactivar `zed-aura-pulse`

### 5. tasks (sugerencia)

| Task | Descripción |
|------|-------------|
| P1 | Reconciliation tasks.md shared-view-state |
| P2 | Eliminar doble ModeTransitionShell + test wiring |
| P3 | Wire wheel routing + test `PizarraCanvas.wheel` |
| P4 | Focal zoom wheel |
| P5 | Surface enter animation |
| P6 | Fix transformer multi-select |
| P7 | Fix circle center + live preview |
| P8 | Aura sutil + tool-type tint |
| P9 | MotionProvider en App |
| P10 | E2E shared-view + flag staging doc |

### 6. apply → 7. verify

---

## Nota sobre `usePizarraModeTransition`

Existe enfoque scrim alternativo. Evalúa en design si:
- (A) Mejorar `useModeTransition` actual, o
- (B) Cablear scrim y deprecar AnimatePresence doble

Documenta decisión en design.md. No dejes ambos caminos activos.

---

## Entregables

- [ ] `openspec/changes/pizarra-motion-polish/` completo
- [ ] `openspec/changes/zed-ambient-aura/` completo
- [ ] `pizarra-shared-view-state/reconciliation.md` + tasks.md actualizado
- [ ] E2E verde
- [ ] `[git:checkpoint]` DevHub MCP

---

## Comandos útiles

```bash
npm test -- --testPathPattern=pizarra|ModeTransition|ZedAmbient
npx playwright test tests/e2e/pizarra-shared-view-state.spec.ts
```

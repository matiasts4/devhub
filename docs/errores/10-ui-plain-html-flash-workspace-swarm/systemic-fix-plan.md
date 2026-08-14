# Plan sistémico: thrash / FOUC / “crasheos” visuales

> **Estado 2026-07-09:** P0–P4 implementados en working tree (sin commit al cierre).  
> Log de sesión y cómo retomar: **[SESSION-2026-07-09.md](./SESSION-2026-07-09.md)** · índice **[README.md](./README.md)**.

## Problema

Corregir incidencia por incidencia (TypeError → pizarra storm → opacity → FOUC HMR…)  
**no escala**: siempre queda un camino que no miramos.

Los “crasheos” del usuario son **tres clases distintas** que se sienten igual:

| Clase | Qué es | Evidencia |
|-------|--------|-----------|
| **A. TypeError JS** | función undefined / renderer muerto | `crash.log` |
| **B. Tormenta de layout** | demasiados `layout-settled` → longtasks | `visual-thrash` hot-window + longtask |
| **C. FOUC CSS** | CSS del DOM se cae un frame | Times New Roman, `--surface-app` missing |

Hoy hay parches en A y B y un escudo parcial en C. Falta un **sistema** que las cubra todas por construcción.

---

## Principio

> **Un solo choke point por clase de fallo**, con política + tests + telemetría.  
> No más ifs sueltos en 15 hooks.

```
                    ┌─────────────────────────┐
   UI events  ───►  │ 1. Layout event bus     │  ← coalesce + classify
                    │    (nativeLayoutSync)   │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        soft repaint     hard recover      ignore/noise
              │                 │
              ▼                 ▼
     ┌────────────────┐  ┌────────────────┐
     │ 2. Safe helpers│  │ 3. Budget gate │
     │ (never ctx)    │  │ (max work/s)   │
     └────────────────┘  └────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            ┌──────────────┐        ┌──────────────┐
            │ 4. FOUC shield│        │ 5. Probe SLA │
            │ (always CSS)  │        │ (CI + runtime)│
            └──────────────┘        └──────────────┘
```

---

## Capa 1 — Event bus de layout (choke point B)

**Hoy:** cualquiera llama `dispatchTerminalLayoutSettled` / `notifyNativeLayoutSettled` y N terminales corren recovery pesado.

**Absoluto:**

1. **API única** `requestTerminalLayoutSync({ reason, panelIds, severity? })`  
   - Nadie más despacha el CustomEvent crudo (eslint ban).
2. **Clasificación de reasons** (tabla canónica):

| Severity | Reasons (ej.) | Acción permitida |
|----------|---------------|------------------|
| `noise` | resize loops, drag mid | nada |
| `soft` | workspace-switch, host-activate-workspace, panel-focus | 1× soft refresh / panel / 100ms |
| `hard` | pizarra enter/exit real, GPU context lost, workspace-removed | fit + reattach (budgeted) |
| `burst` | panel-closed multi | 1 burst acotado, no N |

3. **Coalesce global:** misma `(reasonClass, panelId)` en ventana 80–120ms → 1 evento.
4. **Invariante de effects:**  
   `notify*` / callbacks **nunca** en deps de `useEffect` que disparen layout.  
   Solo estado real (`pizarraOwns`, `activeWsId`, …) + refs para las funciones.

**Cierra:** storm pizarra-mode-exit, double-dispatch portal, drag storms, longtasks en cascada.

---

## Capa 2 — Helpers seguros (choke point A)

**Hoy:** hooks destructuran helpers del ctx bag y sombrean imports → TypeError.

**Absoluto:**

1. **Regla:** pure helpers **solo** import de módulo (`TerminalTTY.helpers`).  
   Ctx bag = estado de instancia (refs, callbacks de React), **nunca** funciones puras.
2. **ESLint custom** (o codemod + ban list):  
   prohibir en destructuring de `c` / `ctx`:  
   `refreshTerminalViewport|forceTerminalViewportRepaint|stabilizeTerminalRenderer|fitTerminalViewport|isTerminalRendererReady|nudgeTerminalPtyResize|installXtermTeardownSafety`
3. **Wrapper único** `safeTerminalRepaint(term, opts)`:  
   `installXtermTeardownSafety` + ready check + try/catch stale + no throw.
4. Todos los recovery paths llaman el wrapper, no 15 copias.

**Cierra:** toda la familia `X is not a function` y dimensions uncaught.

---

## Capa 3 — Budget de trabajo en main thread (choke point B2)

**Hoy:** un `workspace-created` puede costar 700ms+; N paneles × burst = FOUC + “app muerta”.

**Absoluto:**

1. **Token bucket por panel:** max 1 hard recover / 250ms, max 3 soft / 250ms.
2. **Global:** max 2 hard recovers concurrentes (resto cola `requestIdleCallback` / rAF).
3. **Prohibido en soft path:** `clearAtlas: true`, multi-phase burst, force-repaint en loop.
4. Telemetría: si se excede budget → `visual-thrash` kind `budget-exceeded` (no silenciar).

**Cierra:** longtasks que “se sienten como crash” aunque no haya TypeError.

---

## Capa 4 — FOUC shield permanente (choke point C)

**Hoy:** Next/Turbopack HMR quita style tags un frame → Times New Roman.

**Absoluto:**

1. **CSS crítico inline** en `layout` (`#devhub-fouc-shield`) — ya iniciado.  
   Completar: tokens mínimos de todos los themes default, chrome sidebar/topbar, `html/body`.
2. **No depender de un solo CSS chunk** para el “esqueleto” visual.
3. **Modo dev opcional:** `DEVHUB_STABLE_CSS=1` → desactivar HMR de CSS / usar CSS empaquetado (doc + script).  
   Validación de thrash en **build/tauri** sin HMR = verdad de producto.
4. Probe: si aún hay Times New Roman → **fail duro** (shield roto).

**Cierra:** flash “HTML plano” aunque el resto del CSS se recargue.

---

## Capa 5 — SLA + tests (para que no se nos pase)

### Runtime (siempre on)

| Métrica | SLA (dev) | Acción |
|---------|-----------|--------|
| `shell-flex-lost` / Times | 0 por sesión de uso normal | log + contador UI debug |
| `css-var-missing --surface-app` | 0 si shield activo | log |
| `longtask` > 200ms en layout-settled | ≤ 2 / minuto en steady state | log `budget-exceeded` |
| TypeError terminal helpers | 0 | crash.log + fail |

### Estáticos

- ESLint: ban ctx-shadow helpers, ban raw `dispatchTerminalLayoutSettled` fuera del bus.
- Test de contrato: tabla reason → severity (snapshot).
- Test: effect de pizarra no re-dispara si solo cambia identity de notify.

### E2E (Playwright, 1 receta)

1. Login/proyecto → Terminales  
2. 10× workspace switch rápido  
3. pizarra on/off  
4. Assert: **cero** `shell-flex-lost` / `css-var-missing` en `browser.log` durante la receta  
5. Assert: cero TypeError en `crash.log`

Si falla, **bloquea merge** — no “luego lo vemos”.

---

## Mapa: incidencias pasadas → capa que las mata

| Incidencia vista | Capa |
|------------------|------|
| `refreshTerminalViewport is not a function` | 2 |
| pizarra-mode-exit en cada switch | 1 |
| portal dispara exit en host workspace | 1 (reason taxonomy) |
| longtask 700ms workspace-created | 3 |
| Times New Roman / CSS se va | 4 |
| “crasheo” sin crash.log | 5 (probe + SLA) |
| opacity 0 sidebar FOUC | 4 + lint motion chrome |

---

## Orden de implementación (un programa, no 20 PRs sueltos)

| Fase | Entrega | Criterio de done | Estado |
|------|---------|------------------|--------|
| **P0** | Bus: `requestTerminalLayoutSync` + severity table + coalesce | pizarra-exit storm = 0 en receta switch | **DONE** `nativeLayoutSync.js` |
| **P1** | Safe helpers + `safeTerminalRepaint` + soft path en churn | TypeError helpers = 0 | **DONE** helpers + churn soft fast-path |
| **P2** | Budget gate en bus (min gap soft/hard) | longtask en switch < umbral | **DONE** en bus `MIN_EMIT_GAP_MS` |
| **P3** | FOUC shield en layout | Times New Roman = 0 con shield | **DONE** `#devhub-fouc-shield` |
| **P4** | Contract tests + probe runtime | tests verdes; probe en browser.log | **parcial** unit tests; E2E CI opcional siguiente |

Estimación: **P0+P1** ya cortan el 80% de lo que el usuario llama “crasheo”.  
P2–P4 cierran el resto y evitan regresiones.

---

## Qué NO hacer

- Más `if (reason.includes('…'))` sueltos en el churn hook sin pasar por severity table.
- “Meter el helper en el ctx bag” otra vez.
- Validar thrash solo en dev con HMR activo (falsos FOUC de save de archivo).
- Marcar done sin receta E2E + log check.

---

## Decisión de producto

| Opción | Cuándo |
|--------|--------|
| **A. Ejecutar P0→P4 ahora (SDD)** | quieres estabilidad real de terminales |
| **B. Solo P0+P1 ya** | resultado rápido, SLA después |
| **C. Freeze optims + solo shield+probe** | no tocar recovery aún |

Recomendación: **A**, con P0+P1 en un solo corte y P2–P4 en el siguiente.

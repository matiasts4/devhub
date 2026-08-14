# 10 — UI plain / thrash / “crasheos” visuales (terminales + workspace)

## Estado actual (2026-07-09, fin de sesión)

| Área | Estado |
|------|--------|
| TypeError `refreshTerminalViewport is not a function` | **Mitigado** (helpers por import + `safeTerminalRepaint`) |
| Tormenta `pizarra-mode-exit` en cada workspace switch | **Mitigado** (effect + reason taxonomy + bus) |
| FOUC Times New Roman / HTML plano | **Muy reducido** (FOUC shield + static CSS) |
| Longtasks / jank al entrar pizarra | **Mejor**, aún puede quedar jank residual (&lt;250ms vs 500–800ms) |
| Crash formal en `crash.log` | **Sin entradas nuevas** desde ~14:38 local (errores viejos del TypeError) |

**Rama:** `fix/strip-terminal-load-optim`  
**Punto de partida de la rama:** strip de optims de carga fría + fixes de imports/ctx.

El usuario reporta **menos errores** al final de la sesión. Aún puede sentir un “tic”/congelación breve (longtask), que **no** es TypeError ni FOUC clásico.

---

## Índice de docs en esta carpeta

| Archivo | Contenido |
|---------|-----------|
| **[SESSION-2026-07-09.md](./SESSION-2026-07-09.md)** | **Log completo de la sesión** (timeline, causas, fixes, cómo retomar) |
| [systemic-fix-plan.md](./systemic-fix-plan.md) | Plan en capas P0–P4 (choke points) |
| [visual-thrash-diagnosis.md](./visual-thrash-diagnosis.md) | Cómo medir thrash visual vs crash formal |
| [strip-load-optim.md](./strip-load-optim.md) | Contexto del strip de optims de carga |
| [verify-imports-vs-crash.md](./verify-imports-vs-crash.md) | Hipótesis imports rotos vs thrash real |

---

## Tres clases de “crasheo” (no confundir)

| Clase | Qué ve el usuario | Dónde mirar |
|-------|-------------------|-------------|
| **A. TypeError JS** | App rota / overlay / thrash | `data/logs/crash.log` |
| **B. Tormenta layout / longtask** | Congelación 100–800ms | `browser.log` → `visual-thrash` + `longtask` |
| **C. FOUC CSS total** | HTML plano, Times New Roman, fondo se va | `shell-flex-lost` hard / `css-var-missing` |
| **D. Cráter parcial (idle)** | Fondo OK; iconos más grandes/arriba un instante | longtask + util CSS drop; ver SESSION § clase D |

**Regla de oro:** si el usuario dice “crasheo” y `crash.log` no crece, casi siempre es **B o C**. Usar el probe `visual-thrash`, no solo TypeErrors.

---

## Cómo retomar en otra conversación

1. Leer **SESSION-2026-07-09.md** (esta carpeta).
2. Branch: `fix/strip-terminal-load-optim`.
3. `git status` — muchos cambios **sin commit** al cierre de sesión (ver lista en SESSION).
4. Logs:
   ```powershell
   Get-Content D:\devhub\data\logs\crash.log -Tail 10
   Get-Content D:\devhub\data\logs\browser.log -Tail 80 |
     Select-String -Pattern 'visual-thrash|TypeError|shell-flex|longtask|probe-started'
   ```
5. Tras pull/cambios: **hard refresh** o reinicio limpio (ClientErrorLogger / layout no siempre HMR-remount).
6. Receta manual: Terminales → switch WS rápido → pizarra on/off → swarm opcional.

### Engram / memoria

Topic keys útiles (proyecto `devhub`):

- `bug/fouc-root-cause-pizarra-mode-exit-storm-times-new-roman-css-drop`
- `architecture/systemic-thrash-fix-p0-p4-implemented`
- `decision/visual-thrash-vs-formal-crash-probe-sidebar-opacity-fouc`

---

## Archivos clave tocados (sistema)

| Área | Paths |
|------|--------|
| Bus layout | `src/components/terminal/nativeLayoutSync.js` |
| Churn recovery | `src/components/terminal/hooks/useTerminalLayoutChurnRecovery.js` |
| Helpers seguros | `src/components/terminal/TerminalTTY.helpers.js` (`safeTerminalRepaint`) |
| Pizarra storm | `src/components/terminal/hooks/useWorkspacePanelLifecycle.js` |
| Portal reasons | `src/components/terminal/SharedTerminalSurface.jsx` |
| Pizarra longtasks | `src/components/pizarra/PizarraPane.jsx` |
| FOUC shield | `src/app/layout.js`, `public/fouc-shield.css` |
| Probe | `src/lib/debug/visualThrashProbe.js`, `src/hooks/useClientErrorLogger.js` |
| Server echo crashes | `src/lib/crashLog.js` |
| Tests | `nativeLayoutSync.test.js`, `safeTerminalRepaint.test.js`, `visualThrashSla.test.js` |

---

## Tests a correr (smoke)

```powershell
pnpm exec jest src/components/terminal/__tests__/nativeLayoutSync.test.js `
  src/components/terminal/__tests__/safeTerminalRepaint.test.js `
  src/lib/debug/__tests__/visualThrashSla.test.js --no-coverage
```

---

## Trabajo pendiente (si se reabre el issue)

1. Longtasks residuales en `handleFitAllView` / pizarra (yield interno, no solo defer del bus).
2. E2E Playwright: receta switch + assert cero `shell-flex-lost` / TypeError en logs.
3. ESLint ban: pure helpers en destructuring de ctx; raw `dispatch` fuera del bus (opcional).
4. Commit de todo el trabajo en `fix/strip-terminal-load-optim` (al cierre de sesión: **uncommitted**).
5. Validar en **build/tauri sin HMR** (FOUC de save de archivo es ruido de dev).

---

## No hacer

- Buscar solo en la terminal de Next: los TypeError del cliente van a `crash.log` / `browser.log`.
- Meter pure helpers otra vez en el ctx bag de TerminalTTY (causa TypeError por shadow).
- Poner `notifyNativeLayoutSettled` en deps de effects que re-disparen pizarra-mode-exit.
- Llamar `syncTerminalViewportOnWorkspaceShow` desde el soft path del churn (vuelve el longtask).

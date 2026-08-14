# Diagnóstico: thrash visual (no es TypeError)

> Sesión completa 2026-07-09: **[SESSION-2026-07-09.md](./SESSION-2026-07-09.md)** · **[README.md](./README.md)**

## Qué es (y qué no es)

| Señal | Dónde vive | Ejemplo |
|-------|------------|---------|
| **Crash formal** | `data/logs/crash.log` | `TypeError: refreshTerminalViewport is not a function` |
| **Thrash visual** | ojos del usuario + `browser.log` source `visual-thrash` | CSS “se va” 50–300 ms, sidebar se aplasta, iconos al fondo, layout plano, se auto-corrige |

Si dices “hubo un crasheo” y **no** hay línea nueva en `crash.log`, casi siempre es **thrash visual**. Buscar solo TypeErrors es buscar en el sitio equivocado.

## Síntomas típicos (usuario)

- Toda la app se ve “HTML plano” un instante y vuelve.
- Sidebar izquierda se achica; iconos caen al fondo / se pierde la estructura.
- Pasa al **cambiar workspaces rápido**, maximizar, pizarra, o ráfagas de layout.

## Causas probables (no mutuamente excluyentes)

1. **Animación con `opacity: 0`** en chrome estable (sidebar, shell) → frame “sin skin”.
2. **HMR / reload de CSS** en dev (stylesheet links se reescriben).
3. **Races de layout-settled** + GPU terminal (flash del área terminal, a veces confunde con CSS global).
4. **Remount** de shells con Framer Motion `initial: { opacity: 0 }`.
5. (Raro) **stylesheet resource error** real → sí debe ir a crash vía `resource-error`.

## Cómo capturarlo (receta)

### 1. Reinicio limpio + probe activo

```powershell
# para Next y Tauri, luego:
pnpm tauri dev
# o dev server web
```

Hard refresh (Ctrl+Shift+R). El probe vive en `installVisualThrashProbe` (montado con `useClientErrorLogger`).

### 2. Reproducir el thrash

Receta mínima:

1. Terminales
2. Cambiar de workspace varias veces rápido
3. (opcional) pizarra → normal
4. (opcional) maximizar / restaurar

### 3. Leer evidencia correcta

```powershell
# Thrash visual (lo que buscamos)
Get-Content D:\devhub\data\logs\browser.log -Tail 80 |
  Select-String -Pattern 'visual-thrash|stylesheet|sidebar-flex|css-var|resource-error'

# Crash formal (solo si hay TypeError real)
Get-Content D:\devhub\data\logs\crash.log -Tail 20
```

En DevTools Console también debe salir:

```text
[devhub][visual-thrash] sidebar-opacity-blink { ... }
[devhub][visual-thrash] stylesheet-drop { ... }
```

### 4. Interpretar `kind`

| `kind` | Significado | Siguiente paso |
|--------|-------------|----------------|
| `stylesheet-drop` / `stylesheet-links-gone` | CSS se descargó o HMR reescribió links | mirar Network + resource-error; en dev, menos HMR |
| `css-var-missing` | tokens de tema vacíos un frame | theme provider / remount de providers |
| `sidebar-flex-lost` | `display:flex` se perdió | Tailwind/CSS unloaded o clase quitada |
| `sidebar-width-collapse` | ancho cae a ~icon-only sin toggle | motion width / collapsed state flicker |
| `sidebar-opacity-blink` | chrome a opacity≈0 | Framer `initial/exit opacity:0` en sidebar/shell |

### 5. DevTools Performance (opcional, 30 s)

1. Performance → Start
2. Reproduce 3–4 workspace switches
3. Stop → Screenshots
4. Busca frames grises / sin layout
5. En el frame malo: Inspect → mira si `link[rel=stylesheet]` sigue y si `--surface-app` tiene valor

## Qué no hacer

- No digas “no hay crash” solo porque `crash.log` no creció.
- No busques solo `window.onerror` para este síntoma.
- No asumas que el thrash se “arregla solo” = no es bug: **sí es bug de UX**, aunque sea auto-healing.

## Fix ya aplicado (parcial)

- `App.js` sidebar: quitado `opacity: 0` en enter/exit (solo slide en X).
- Probe `visual-thrash` → `browser.log` + `console.warn`.

## Siguiente si el probe confirma `sidebar-opacity-blink` / `stylesheet-drop`

1. Buscar otros `initial={{ opacity: 0 }}` en chrome de workspace (no en tooltips).
2. Workspace switch: evitar remount del shell con `key` que cambie por workspace id.
3. En dev: si `stylesheet-drop` al editar, es HMR — validar en build/tauri sin HMR.

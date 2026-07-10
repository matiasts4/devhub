# Recovery ladder — volver a estable y reintroducir (2026-07-10)

## Por qué

Los parches encima de `fix/strip-terminal-load-optim` (strip + thrash + browser kill-switch)
siguen dejando thrash/crasheos percibidos. Se repite el plan que ya se usó el 09-jul:

1. Anclar en una versión **verificada estable por el usuario**
2. Reintroducir capas **una a una**
3. Parar en el primer salto que rompa

## Estado guardado (nada se pierde)

| Qué                                       | Dónde                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Tip con strip + ctx bag fixes             | branch `fix/strip-terminal-load-optim` @ `696efbe2`                                  |
| WIP thrash/FOUC/kill-switch (uncommitted) | `stash@{0}` — _wip thrash FOUC browser-killswitch before stable rollback 2026-07-10_ |
| Alias del tip actual                      | `wip/thrash-session-2026-07-10` → mismo `696efbe2`                                   |
| Baseline estable (usuario, 05-jul)        | `5c4bc55a` / branch `test/stable-2026-07-05-pre-webview2`                            |
| Rama de dogfood ahora                     | `recover/stable-2026-07-05-pre-webview2` @ `5c4bc55a`                                |

### Recuperar el WIP de thrash más adelante

```powershell
git checkout fix/strip-terminal-load-optim
git stash list   # buscar el mensaje "wip thrash FOUC..."
git stash apply stash@{0}   # o el índice correcto
```

## Timeline (lo “puleado” reciente)

```
5c4bc55a  2026-07-05  ★ ESTABLE (pre-WebView2) — herdr + decompose ya está
3b92878f  2026-07-07  WebView2 embed (producto)
4659ca94  2026-07-07  WebView2 z-order
18cea2f9  2026-07-07  GPU soft reveal wiring
8b57ca27  2026-07-08  mega checkpoint (preload, churn, engine, dock)
a4853bba  2026-07-08  dock live resize HWND
───────── 2026-07-09 strip ──────────────────────────────
88d97176              strip load optims (cold path 5c4bc55 + KEEP WebView2)
fdd08e9e              restore helpers exports rotos por strip parcial
1a8ba1a4              docs verify import vs thrash
1bfd47c2 / 696efbe2   ctx bag helpers (TypeError refreshTerminalViewport)
───────── uncommitted (sesión thrash 09–10 jul) ─────────
          layout bus soft/hard, FOUC shield, blank-recovery,
          isNativeBrowserDockLive, kill-switch WebView2, probes…
```

### Qué es “de hoy” vs “de ayer”

- **09-jul (commits):** strip + fix de imports + ctx bag → rama `fix/strip-terminal-load-optim`
- **09–10 jul (sin commit, ahora en stash):** bus thrash, FOUC, browser kill-switch, click-blocker
- **07–08 jul:** entrada de WebView2 + mega checkpoint (candidatos fuertes de regresión vs 05-jul)

## Escalera de reintroducción (dogfood en cada peldaño)

Tras validar `5c4bc55a` estable otra vez:

| Paso  | Commit / rango                          | Qué trae                     | Criterio de pase                                |
| ----- | --------------------------------------- | ---------------------------- | ----------------------------------------------- |
| **0** | `5c4bc55a`                              | Baseline pre-WebView2        | Terminales, switch workspace, sin thrash fuerte |
| **1** | `3b92878f` + `4659ca94`                 | Solo WebView2 producto       | Browser dock usable; sin robar clicks           |
| **2** | `a4853bba` (sin 8b57ca27 si es posible) | Live resize HWND             | Resize dock sin HWND zombi                      |
| **3** | cherry-pick selectivo de `88d97176`     | Solo si hace falta cold-path | No reintroducir preload/fail-fast               |
| **4** | Nunca de una: `8b57ca27` completo       | Mega optim                   | Si hace falta, trocear por archivos             |

**No reintroducir de golpe** el stash thrash ni el kill-switch hasta que el baseline + WebView2 mínimo estén limpios.

### Comandos sugeridos (paso 0 → 1)

```powershell
# Ya estamos en recover/stable-2026-07-05-pre-webview2
pnpm tauri dev   # dogfood 10–15 min

# Si estable, crear rama de reintroducción:
git checkout -b recover/step1-webview2-only
git cherry-pick 3b92878f
# dogfood
git cherry-pick 4659ca94
# dogfood
```

Si un cherry-pick confictúa fuerte, preferir **checkout de archivos concretos** del commit (surgical) en vez del commit entero.

## Cómo dogfood (checklist corto)

1. Full restart (`pnpm tauri dev` o app instalada)
2. Abrir terminales, 2–3 workspaces, switch tabs
3. Split / close panel
4. (Desde paso 1) abrir browser dock, cerrar, resize
5. Mirar `data/logs/browser.log` — longtasks / TypeError
6. Si “crashea” en <5 min → **parar**; no seguir la escalera

## Relación con el intento anterior (documentado)

Ver `strip-load-optim.md`: se intentó “current tree minus optims” partiendo de `5c4bc55` pero **manteniendo** WebView2. Eso dejó imports rotos y thrash residual. Esta vez el orden es el inverso: **primero baseline limpia, luego capas**.

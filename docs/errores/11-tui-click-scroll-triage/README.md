# 11 — TUI click / scroll triage (OpenCode / Grok)

## Resumen

Clicks y wheel en paneles Ink (OpenCode / Grok) a veces no llegan al PTY. DevHub tiene dos caminos (DECSET nativo vía xterm vs inyección SGR por `sendTerminalPasteInput`); varios guards los matan.

**Estado:** triage instrumentado + fixes puntuales (2026-07-17). Verificar en `tauri:dev` con la matriz abajo.

## Cómo activar la sonda

En DevTools de la app:

```js
localStorage.setItem('devhubTuiPointerDebug', '1');
```

Recargar Terminales. Cada mousedown/wheel emite `POST /api/terminal/log` con tag `tui-pointer` / `tui-wheel` e incluye `path`, `zone`, `mouseTrackingMode`, `domFocus`, ready flags.

Apagar: `localStorage.removeItem('devhubTuiPointerDebug')`.

## Matriz de repro (predicción por código → verificar en UI)

Leyenda: `FAIL*` = fallo esperado por código pre-fix; `OK?` = debería funcionar tras fixes; rellenar columna **UI** al probar.

| Escenario                              | Click transcript                      | Click footer/botón      | Wheel transcript | Wheel sobre prompt  |
| -------------------------------------- | ------------------------------------- | ----------------------- | ---------------- | ------------------- |
| OpenCode frío                          | OK? (inject sin ready)                | OK? (inject zona input) | OK (inject frío) | OK? (ya no swallow) |
| OpenCode tras workspace switch         | OK? si DECSET rebind                  | OK?                     | OK?              | OK?                 |
| OpenCode + Zed abierto (sin foco term) | OK? inject                            | OK? inject              | OK inject        | OK?                 |
| Grok frío                              | OK?                                   | OK?                     | OK               | OK?                 |
| Grok tras sibling close / switch       | OK?                                   | OK?                     | OK?              | OK?                 |
| Split 2 paneles → activar el inactivo  | FAIL\* si mousedown escribe mouse-off | FAIL\* mismo            | OK?              | OK?                 |

### Fallos raíz confirmados en código (pre-fix)

1. `useTerminalViewportPointer` pasaba `tuiSessionActiveRef.current` (no `grokSession`) a `prepareActiveTuiTerminalFocusRespectingSelection` → mousedown en Grok frío escribía `?1000l` / mouse off.
2. Inject de click solo en transcript → footer/botones sin fallback.
3. `buildTerminalMousePressSequence` hacía press `M` y luego **apagaba** mouse (`?1000l`); sin release `m`.
4. Wheel en input zone hacía `preventDefault` sin PTY → scroll “muerto” sobre el prompt.

## Fixes aplicados (priorizados)

Evidencia: lectura estática + contratos nuevos (no UI tauri en este turno). Orden = blast radius / certeza.

| #   | Fix                                                                                                                                                                 | Evidencia                                                                                             | Archivo                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `tuiActive` = sessionRef \|\| grok \|\| opencode launch al rebind; inject en **cualquier** zona; `buildTerminalMousePressSequence` = press+release **sin** `?1000l` | mousedown Grok frío escribía mouse-off; footer nunca inyectaba; inject apagaba DECSET tras cada click | `useTerminalViewportPointer.js`, `TerminalTTY.helpers.js` |
| 2   | Wheel TUI sobre input zone → inject SGR (antes: swallow sin PTY)                                                                                                    | router hacía `preventDefault` sin bytes; scroll “muerto” sobre prompt                                 | `useTerminalWheelRouter.js`                               |

Fuera de este slice (seguir si la matriz UI sigue fallando): rebind en `useTerminalPanelActivationRecovery` si modes siguen off tras workspace switch; corrupción atlas (doc 03).

## Archivos

- `src/lib/terminal/tuiPointerDebug.js` — sonda opt-in
- `src/components/terminal/hooks/useTerminalViewportPointer.js`
- `src/components/terminal/hooks/useTerminalWheelRouter.js`
- `src/components/terminal/TerminalTTY.helpers.js` — `buildTerminalMousePressSequence`
- Tests: `useTerminalViewportPointer.contract.test.js`, wheel router, helpers

## Checklist UI (humano)

- [ ] OpenCode: click Build / mode chips / footer
- [ ] OpenCode: wheel transcript + wheel sobre prompt
- [ ] Grok: click atajos footer + wheel
- [ ] Tras abrir Zed y volver al terminal: wheel + click footer
- [ ] Tras cambiar workspace y volver: lo mismo
- [ ] Con sonda on: paths esperados `inject-click` / `inject-wheel` / `native-forward` / no `swallowed-input-zone` en TUI

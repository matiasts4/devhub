# Cambios intentados — handoff técnico

Registro de lo que ya se tocó en el código para que el siguiente responsable no repita trabajo ni reintroduzca regresiones.

**Rama:** `feature/terminal-renderer-xterm-webgl`  
**Último commit relevante:** `76097c7` — `feat(assistant,terminal): Zed overlay, xterm-webgl renderer, and workspace dock overhaul`  
**Working tree local (sin commit al 2026-06-10):** +262 líneas en terminal TTY / noise filter.

---

## Commit `76097c7` (ya integrado)

| Área                 | Cambio                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| Renderer default     | `xterm-webgl` para paneles nuevos sin preferencia guardada                   |
| Canvas lifecycle     | `releaseCanvasAddon` en hide de layout / split inactivo                      |
| Workspace visibility | `resolveWorkspaceShellVisibilityStyle` — hide instantáneo, `contain: strict` |
| Zed / dock           | Overlay ambient, política de terminales, sync dock derecho                   |
| Tests                | Cobertura release canvas en hide, webgl split                                |

---

## Cambios locales sin commit (2026-06-10)

### `src/components/TerminalTTY.jsx`

| Símbolo / bloque                                                          | Qué hace                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `TERMINAL_DISABLE_FOCUS_REPORTING_SEQ`                                    | Solo `?1004l`                                                                 |
| `TERMINAL_DISABLE_MOUSE_REPORTING_SEQ`                                    | Modos mouse 1000–1015                                                         |
| `disableTerminalFocusReporting(term, { disableMouse })`                   | Mouse off solo cuando corresponde                                             |
| `detectGrokTuiReady`                                                      | Detecta footer grok (`Shift+Tab mode`, `ctrl+c:cancel`, `user_prompt_submit`) |
| `resolveTerminalWheelScrollPrefer`                                        | grok → `arrow`; OpenCode → `page` o passthrough                               |
| `buildTerminalWheelArrowSequence` / `buildTerminalWheelSgrSequence`       | Payloads wheel explícitos                                                     |
| `tuiSessionActiveRef`, `isGrokSessionRef`, `tuiSessionFooterConfirmedRef` | Estado sesión TUI                                                             |
| Wheel `useEffect`                                                         | `capture: true`; hit-test en `term.element`; ramas grok/OpenCode              |
| Output handler                                                            | `grokReady` marca sesión grok sin requerir footer OpenCode                    |

### `src/lib/terminal/terminalNoiseFilter.js`

| Símbolo                        | Qué hace                                 |
| ------------------------------ | ---------------------------------------- |
| `TERMINAL_MOUSE_CLICK_LEAK_RE` | Solo clicks (botones 0–3)                |
| `stripTerminalMouseClickLeak`  | Preserva wheel 64/65                     |
| `containsTerminalInputNoise`   | Chequeo de ruido sin penalizar wheel SGR |

### Tests actualizados

- `src/components/__tests__/TerminalTTY.test.js` — grok scroll prefer, `detectGrokTuiReady`
- `src/lib/terminal/terminalNoiseFilter.test.js` — wheel preservado en input path

---

## Qué NO está hecho (brechas vs causas)

| Brecha                                                             | Relación                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Release WebGL en **workspace hide** (panel único)                  | Causa 1 — memoria Engram #6805 lo menciona; no está en el diff local completo |
| `shouldReleaseWebglRendererOnLayoutHide` unificado                 | Solo canvas tiene helper explícito en layout hide                             |
| Evidencia pack TERM-01 en installed app con `opencode --session`   | Cierre formal pendiente                                                       |
| Confirmación de por qué **3 paneles grok idénticos** en la captura | Puede ser split manual o bug de remount — sin logs de esa sesión              |

---

## Archivos de referencia

```
src/components/TerminalTTY.jsx
src/components/terminal/workspaceAnimProps.js
src/components/terminal/terminalRendererCapabilities.js
src/lib/terminal/terminalNoiseFilter.js
src/components/__tests__/TerminalTTY.xterm-webgl.test.jsx
docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md
docs/25_Terminal_Renderer_Robusto_Roadmap.md
```

---

## Riesgos si se revierte el diff local

1. Vuelve el scroll roto en grok (Page Up/Down en lugar de flechas).
2. Vuelve el filtrado de wheel SGR en el camino input → OpenCode deja de scrollear.
3. Mouse modes se apagan otra vez en TUI activo al enfocar.

## Riesgos si se mergea sin más trabajo

1. La corrupción de atlas (**causa 1**) puede persistir en installed app.
2. Puede haber regresión OpenCode si `tuiSessionFooterConfirmedRef` no dispara en restores rápidos.

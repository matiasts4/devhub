# Archivos modificados — incidente 05 (2026-06-21)

Lista para auditoría y cherry-pick. Agrupados por causa.

---

## Causa 1 — next-server zombie `:3400`

| Archivo | Cambio |
|---------|--------|
| `src-tauri/src/lib.rs` | `is_devhub_reserved_port`, `kill_listeners_on_port`, `reclaim_hung_nextjs_listener`, tests unitarios |
| `packaging/linux/devhub-server` | Kill listeners en puertos reservados al arrancar |
| `scripts/tauri-cli.cjs` | `syncDevhubServerSidecar()` antes del build |
| `scripts/patch-installed-devhub.sh` | Instalar wrapper parcheado en sistema |

---

## Causa 2 — SQLite `invited_email`

| Archivo | Cambio |
|---------|--------|
| `src/lib/db/schema.js` | ALTERs invite columns; índices **después** del loop ALTER |
| `src/lib/db/core.test.js` | Test upgrade legacy `project_members` |

---

## Causa 3 — TWM off-screen (primera ola)

| Archivo | Cambio |
|---------|--------|
| `src/components/TerminalWorkspacesManager.jsx` | Modo dormant, gates `isVisible` en restore/native layout |
| `next.config.js` | Rewrites SPA `/hub`, `/project/:path*` → `/` |

---

## Causa 4 — Swarm + Terminales (segunda ola)

| Archivo | Cambio |
|---------|--------|
| `src/App.js` | Montar `TerminalWorkspacesManager` **solo** si `isTerminalRoute` |
| `src/components/TerminalWorkspacesManager.jsx` | `heavySurfacesReady`, boot placeholder 2× rAF |
| `src/components/terminal/terminalRendererPreferences.js` | `shouldAvoidWebglOnThisRuntime`, demote webgl en Tauri Linux |
| `src/views/SwarmControl.jsx` | `surfaceReady`, defer SSE y snapshot fetch |
| `src/components/__tests__/terminalRendererPreferences.test.js` | Test demotion Tauri Linux |

---

## Render TUI (rayitas canvas — incidente relacionado)

Los fixes de packaging **no eliminan** artefactos visuales en splits OpenCode/Kimi. Eso es lifecycle canvas:

- Doc: [03-terminal-canvas-glyph-corruption/04-rayitas-workspace-switch-2026-06-21.md](../03-terminal-canvas-glyph-corruption/04-rayitas-workspace-switch-2026-06-21.md)
- Código: `canvasReleasedOnLayoutHideRef` en `TerminalTTY.jsx`

---

## Documentación (este incidente)

| Archivo | Cambio |
|---------|--------|
| `docs/errores/05-deb-webkit-page-couldnt-load/README.md` | Índice y cronología |
| `docs/errores/05-deb-webkit-page-couldnt-load/01-*.md` … `04-*.md` | Causas detalladas |
| `docs/errores/05-deb-webkit-page-couldnt-load/commands-used.md` | Runbook diagnóstico |
| `docs/errores/05-deb-webkit-page-couldnt-load/files-changed.md` | Este archivo |

---

## Cross-links útiles en código

```text
src-tauri/src/lib.rs          → reclaim_hung_nextjs_listener (~L242)
src/lib/db/schema.js          → idx_project_members_invited_email (~L1095)
src/App.js                    → isTerminalRoute + conditional TWM (~L280)
terminalRendererPreferences.js → shouldAvoidWebglOnThisRuntime (~L7)
TerminalWorkspacesManager.jsx → data-terminal-manager-dormant (~L6464)
```

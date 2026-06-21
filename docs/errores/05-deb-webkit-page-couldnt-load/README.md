# 05 — `.deb` instalado: "This page couldn't load" al entrar al proyecto / terminales / Swarm

## Resumen

En la build **empaquetada** (Tauri + WebKitGTK + Next standalone en `:3400`), la app mostraba la pantalla nativa de WebKit **"This page couldn't load"** (Reload / Back) en momentos distintos del flujo. El diagnóstico fue lento porque **varios fallos encadenados compartían el mismo síntoma visual** y el hub a veces parecía funcionar mientras el backend ya estaba roto.

Este registro documenta **4 causas raíz**, el orden en que aparecieron, cómo distinguirlas y qué parches quedaron en el repo.

**Fecha del incidente:** 2026-06-21  
**Plataforma:** Linux amd64, `.deb` DevHub 0.1.1, WebKitGTK  
**Relacionado:** [01-instalador-linux-no-abre](../01-instalador-linux-no-abre/README.md) (arranque sidecar/Next), [04-terminal-lifecycle-coverage-gaps](../04-terminal-lifecycle-coverage-gaps/README.md) (lifecycle GPU/terminales)

---

## Síntomas reportados (cronología)

| Fase | Qué veía el usuario | Causa real |
|------|---------------------|------------|
| A | Hub → seleccionar proyecto → **"This page couldn't load"** | `next-server` zombie en `:3400` (TCP up, HTTP muerto) |
| B | Hub carga pero toast **"Error al cargar proyectos"**, lista vacía | Migración SQLite: índice sobre `invited_email` antes del `ALTER TABLE` |
| C | Tras fix B, **dashboard OK** pero al abrir proyecto seguía fallando a veces | `TerminalWorkspacesManager` montaba xterm/native VTE **off-screen** al entrar al workspace |
| D | Dashboard OK; **Terminales** y **Swarm Control** (y otras rutas) mismo error | TWM aún montado en memoria en todas las rutas + `xterm-webgl` en WebKitGTK empaquetado |

---

## Mapa rápido: ¿qué revisar primero?

```text
"This page couldn't load"
        │
        ├─ curl http://127.0.0.1:3400/ → timeout / no 200?
        │     └─ Causa 1: next-server zombie → ver 01-next-server-zombie-puerto-3400.md
        │
        ├─ curl OK pero hub sin proyectos / toast error DB?
        │     └─ Causa 2: schema invited_email → ver 02-sqlite-invited-email-indices.md
        │
        ├─ Dashboard OK, crash al entrar al proyecto (sin ir a terminales)?
        │     └─ Causa 3: TWM off-screen → ver 03-webkit-terminal-mount-offscreen.md
        │
        └─ Dashboard OK; crash solo en Terminales / Swarm / rutas pesadas?
              └─ Causa 4 → ver 04-swarm-y-terminales-tras-dashboard.md
```

---

## Causas raíz y correcciones (tabla)

| # | Causa raíz | Corrección principal |
|---|------------|----------------------|
| 1 | `next-server` colgado en `:3400`; cleanup no lo mataba porque `ps` muestra cmdline truncada (`next-server (v16.x)`) sin `devhub` | `is_devhub_reserved_port`, `kill_listeners_on_port`, `reclaim_hung_nextjs_listener()` en `src-tauri/src/lib.rs`; mismo kill en `packaging/linux/devhub-server` |
| 2 | DB legacy sin columnas de invitados; `ensureAllSchema` creaba índices sobre `invited_email` **antes** de los `ALTER TABLE` | Índices de `project_members` movidos **después** del loop de ALTERs en `src/lib/db/schema.js` |
| 3 | `WorkspaceLayout` montaba `TerminalWorkspacesManager` siempre; en dashboard corría startup restore + xterm/WebGL oculto (`display: none`) | Modo **dormant** (`isVisible=false`), startup restore y native layout gated por visibilidad |
| 4 | TWM seguía montado (hooks) en swarm/tareas; en `/terminales` activaba **xterm-webgl** (crash WebKitGTK) | Montar TWM **solo** en ruta `/terminales`; forzar renderer `xterm` (DOM) en Tauri Linux; montaje diferido 2× `requestAnimationFrame`; Swarm Control con paint deferido |

---

## Estado tras los fixes (2026-06-21)

| Verificación | Estado esperado |
|--------------|-----------------|
| `curl -s --max-time 3 -w '%{http_code}\n' http://127.0.0.1:3400/` | `200` |
| Hub lista proyectos (DB en `~/.devhub/data/devhub.db`) | Proyectos visibles |
| Entrar al proyecto → dashboard | Carga sin pantalla WebKit |
| Sidebar → Swarm Control | Carga (spinner breve, luego UI) |
| Sidebar → Terminales | Carga con renderer DOM estable |

Si algo vuelve a fallar, capturar **inmediatamente** `~/.local/share/com.devhub.desktop/logs/DevHub.log` y el resultado de los curls de [commands-used.md](./commands-used.md).

**Render TUI (rayitas canvas):** ver [03/04-rayitas-workspace-switch](../03-terminal-canvas-glyph-corruption/04-rayitas-workspace-switch-2026-06-21.md) — síntoma distinto de “page couldn't load”.

---

## Navegación

| Doc | Contenido |
|-----|-----------|
| [01-next-server-zombie-puerto-3400.md](./01-next-server-zombie-puerto-3400.md) | Puerto 3400 zombie, detección, kill manual y automático |
| [02-sqlite-invited-email-indices.md](./02-sqlite-invited-email-indices.md) | Migración `project_members`, orden ALTER vs índices |
| [03-webkit-terminal-mount-offscreen.md](./03-webkit-terminal-mount-offscreen.md) | Crash WebKitGTK por terminales ocultas al entrar al proyecto |
| [04-swarm-y-terminales-tras-dashboard.md](./04-swarm-y-terminales-tras-dashboard.md) | Segunda ola: swarm + terminales tras arreglar dashboard |
| [commands-used.md](./commands-used.md) | Comandos de diagnóstico copy-paste |
| [files-changed.md](./files-changed.md) | Archivos tocados en el repo |

---

## Lecciones (para no repetir el infierno)

1. **Mismo síntoma ≠ misma causa.** WebKit "couldn't load" puede ser backend muerto, crash GPU o navegación rota — siempre medir `:3400` con `curl` antes de tocar React.
2. **En `.deb`, nunca montar xterm/WebGL off-screen.** WebKitGTK no tolera spin-up de GPU/PTY en contenedores `display:none`.
3. **Migraciones SQLite: índices después de ALTERs** en DBs legacy; el `CREATE TABLE IF NOT EXISTS` no altera tablas ya existentes.
4. **Cleanup de procesos por puerto reservado**, no solo por cmdline: `next-server` miente en `/proc/pid/cmdline`.
5. **Documentar en `docs/errores/` en caliente** — este incidente costó horas porque los fixes eran incrementales y el usuario veía siempre la misma pantalla genérica.

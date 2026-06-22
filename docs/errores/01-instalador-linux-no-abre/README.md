# 01 — Instalador Linux no abre / Proyeetos no cargan / App queda en blanco

## Resumen

El instalador DEB de DevHub para Linux presentaba **5 fallos encadenados** que impedían que la aplicación abriera correctamente desde el icono/launcher del gestor de aplicaciones. Cada fallo amplificaba al siguiente, making diagnosis difícil porque el debug mode funcionaba bien mientras que el paquete instalado fallaba de formas no obvias.

---

## Estado final

| Verificación                           | Estado |
| -------------------------------------- | ------ |
| App abre desde icono/launcher          | ✅     |
| Sin logs en terminal                   | ✅     |
| Sidecar levanta en `127.0.0.1:4000`    | ✅     |
| Next.js sirve en `0.0.0.0:3400`        | ✅     |
| Node 24 usado (no Node 22 del sistema) | ✅     |
| DB integrity_check = ok                | ✅     |
| Reconstrucción del .deb                | ✅     |

---

## Síntomas originales

1. Desde el gestor de aplicaciones: pantalla en blanco, "Could not connect to 127.0.0.1"
2. `Module did not self-register: better_sqlite3.node` — ABI mismatch
3. Logs del sidecar aparecían en la terminal que lanzó la app
4. Cerrar la terminal mataba la app aunque estuviera "abierta"
5. `database disk image is malformed` al intentar cargar proyectos

---

## Causas raíz y correcciones

| #   | Causa raíz                                                                                                | Corrección                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `sessionCwd.js` importaba `../src/lib/terminal/cwdGuard.js` — ruta que no existe en el paquete instalado  | Copió `cwdGuard.js` dentro de `sidecar-backend/` + arregló el require a `./cwdGuard.js`              |
| 2   | Launcher del sistema resolvía Node 22 (ABI 127); `better-sqlite3` estaba compilado para Node 24 (ABI 137) | `devhub-launcher` ahora sourcea NVM, detecta Node >=24 y exporta `DEVHUB_ALLOW_NODE24=1`             |
| 3   | Rust `println!`/`eprintln!` escribían a stdout/stderr heredados de la terminal                            | Reemplazados por `log::info!/warn!/error!` — en release van a /dev/null                              |
| 4   | DB corrupa por crash durante escritura WAL; lógica de recovery copiaba la corrupción hacia adelante       | `shared.js` ahora usa `PRAGMA integrity_check` en 3 puntos: pre-open, filtro de backups, post-schema |
| 5   | `tauri.conf.json` tenía campos inválidos para Tauri v2 que bloqueaban el rebuild                          | Eliminados `desktop` (bajo `linux.deb`) y `binaries` (fuera de lugar)                                |

---

## Archivos modificados

- `sidecar-backend/sessionCwd.js`
- `sidecar-backend/cwdGuard.js` **(nuevo)**
- `src-tauri/src/lib.rs`
- `src/lib/db/shared.js`
- `src/lib/db/shared-integrity.test.js` **(nuevo)**
- `tests/unit/sidecar-cwd-guard.test.js` **(nuevo)**
- `packaging/linux/devhub-launcher`
- `packaging/linux/DevHub.desktop`
- `src-tauri/tauri.conf.json`

---

## Navegación

- [Causa 1 — cwdGuard path crash](./01-cwdguard-path-crash.md)
- [Causa 2 — Node 22 vs 24 ABI mismatch](./02-node24-abi-mismatch.md)
- [Causa 3 — App acoplada al terminal](./03-stdio-terminal-coupling.md)
- [Causa 4 — Corrupción SQLite WAL](./04-sqlite-wal-corruption.md)
- [Causa 5 — Schema de Tauri inválido](./05-tauri-conf-schema.md)
- [Comandos usados durante debugging](./commands-used.md)
- [Lista completa de archivos](./files-changed.md)

---

## Incidentes relacionados (post-instalador)

- [05 — `.deb`: "This page couldn't load" (puerto 3400 zombie, SQLite invites, WebKit terminales/swarm)](../05-deb-webkit-page-couldnt-load/README.md) — Jun 2026

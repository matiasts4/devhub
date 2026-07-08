# Archivos cambiados — 08 dev + instalado coexistencia

| Archivo                                                   | Cambio                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packaging/devhub-server.cjs`                             | `isPackagedDevelopmentRuntime`, `detectLayout` dev, pre-kill con `SIDECAR_PORT=4001`. |
| `scripts/sync-devhub-server-resource.cjs`                 | Copia `packaging/devhub-server.cjs` a resources de debug/release.                     |
| `scripts/tauri-dev.cjs`                                   | Sync antes de `tauri dev`.                                                            |
| `scripts/tauri-cli.cjs`                                   | Sync en `dev` (solo `.cjs`) y en `build` (`.cjs` + launcher).                         |
| `src-tauri/src/lib.rs`                                    | Guard de puerto en `shutdown_sidecar`; netstat Windows con puerto exacto.             |
| `tests/unit/packaging-devhub-server-layout.test.js`       | Tests de detección dev vs prod.                                                       |
| `docs/errores/08-dev-instalado-coexistencia-terminales/*` | Este incidente.                                                                       |

## Referencia (sin cambio en este fix, pero relevante)

| Archivo                             | Rol                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/lib.rs`              | `cleanup_zombie_ports` en debug ya excluye :4000 y :3400; `spawn_sidecar` pasa `DEVHUB_RUNTIME` y `SIDECAR_PORT`. |
| `scripts/tauri-dev.cjs`             | Fija `DEVHUB_HOME=~/.devhub-dev`, `SIDECAR_PORT=4001`.                                                            |
| `scripts/devhub-runtime-doctor.cjs` | Diagnóstico de puertos y marcador `sidecar-port.txt` mezclado.                                                    |
| `src/lib/devhub/sidecarRuntime.js`  | Probe ordenado 4000/4001 según home dev vs prod.                                                                  |
